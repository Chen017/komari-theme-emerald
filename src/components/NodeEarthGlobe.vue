<script setup lang="ts">
import type { Arc, COBEOptions, Globe, Marker } from 'cobe'
import { Icon } from '@iconify/vue'
import { useElementSize } from '@vueuse/core'
import createGlobe from 'cobe'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { getCoordByCode, getCountryCodeFromRegion } from '@/utils/geoHelper'
import { formatBytesPerSecondSplit } from '@/utils/helper'

const appStore = useAppStore()
const nodesStore = useNodesStore()

const containerRef = ref<HTMLDivElement>()
const canvasRef = ref<HTMLCanvasElement>()
const { width: containerWidth, height: containerHeight } = useElementSize(containerRef)

let globe: Globe | null = null
let rafId: number | null = null
const phi = ref(0)
const targetPhi = ref(0)
const isPointerDown = ref(false)
let lastPointerX = 0

interface RegionCluster {
  code: string
  coord: [number, number]
  servers: number
  onlineServers: number
}

function clusterKey(c: RegionCluster) {
  return `${c.code}:${c.servers}:${c.onlineServers}`
}

/** 节点按地区聚合 —— 仅依赖客户端列表，不掺入实时速率，避免每次速率推送都重算 markers/arcs */
const regionClusters = computed<RegionCluster[]>(() => {
  const map = new Map<string, RegionCluster>()
  for (const node of nodesStore.nodes) {
    const code = getCountryCodeFromRegion(node.region)
    if (!code)
      continue
    const coord = getCoordByCode(code)
    if (!coord)
      continue

    let entry = map.get(code)
    if (!entry) {
      entry = { code, coord, servers: 0, onlineServers: 0 }
      map.set(code, entry)
    }
    entry.servers += 1
    if (node.online)
      entry.onlineServers += 1
  }
  return Array.from(map.values()).sort((a, b) => b.servers - a.servers)
})

interface RegionRate {
  up: number
  down: number
}

/** 每个地区的实时上下行速率（仅在线节点参与） */
const regionRates = computed<Map<string, RegionRate>>(() => {
  const map = new Map<string, RegionRate>()
  for (const node of nodesStore.nodes) {
    if (!node.online)
      continue
    const code = getCountryCodeFromRegion(node.region)
    if (!code)
      continue
    let entry = map.get(code)
    if (!entry) {
      entry = { up: 0, down: 0 }
      map.set(code, entry)
    }
    entry.up += node.net_out || 0
    entry.down += node.net_in || 0
  }
  return map
})

function markerId(code: string): string {
  return `cdn-${code.toLowerCase()}`
}

/**
 * 用 transform: translate3d 驱动 overlay 位置（替代 CSS anchor() 的 top/left）
 * cobe v2 内部用 1×1 锚点 div + style.left/top="xx%" 驱动；
 * 我们直接读这个 inline style 字符串（不触发 layout），换算成 px 写到 overlay transform 上，
 * 让 overlay 完整走 GPU 合成层，避免每帧 layout/paint。
 */
const labelEls = new Map<string, HTMLDivElement>()
const flagEls = new Map<string, HTMLDivElement>()
const anchorElCache = new Map<string, HTMLDivElement>()

function onLabelRef(el: any, code: string) {
  if (el)
    labelEls.set(code, el as HTMLDivElement)
  else
    labelEls.delete(code)
}

function onFlagRef(el: any, code: string) {
  if (el)
    flagEls.set(code, el as HTMLDivElement)
  else
    flagEls.delete(code)
}

function findAnchorEl(code: string): HTMLDivElement | null {
  const id = markerId(code)
  const cached = anchorElCache.get(id)
  if (cached && cached.isConnected)
    return cached
  const wrapper = canvasRef.value?.parentElement
  if (!wrapper)
    return null
  const el = wrapper.querySelector<HTMLDivElement>(`div[style*="--cobe-${id}"]`)
  if (el)
    anchorElCache.set(id, el)
  return el
}

function syncOverlays() {
  const w = containerWidth.value
  const h = containerHeight.value
  if (!w || !h)
    return
  flagEls.forEach((flagEl, code) => {
    const anchorEl = findAnchorEl(code)
    if (!anchorEl)
      return
    const xPct = Number.parseFloat(anchorEl.style.left)
    const yPct = Number.parseFloat(anchorEl.style.top)
    if (Number.isNaN(xPct) || Number.isNaN(yPct))
      return
    const x = (xPct / 100) * w
    const y = (yPct / 100) * h
    flagEl.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`
    const labelEl = labelEls.get(code)
    if (labelEl)
      labelEl.style.transform = `translate3d(${x}px, ${y}px, 0) translateY(-100%)`
  })
}

const markers = computed<Marker[]>(() => {
  // size 设为 0：cobe 仍会创建 --cobe-{id} 锚点 div，但 WebGL 不渲染圆点（被旗帜浮层取代）
  return regionClusters.value.map(cluster => ({
    id: markerId(cluster.code),
    location: cluster.coord,
    size: 0,
  }))
})

/** 以服务器数最多的地区为中心，向其余地区连线，形成 CDN 拓扑 */
const arcs = computed<Arc[]>(() => {
  const clusters = regionClusters.value
  if (clusters.length < 2)
    return []
  const hub = clusters[0]
  if (!hub)
    return []
  return clusters.slice(1).map(cluster => ({
    from: hub.coord,
    to: cluster.coord,
  }))
})

const themeColors = computed(() => {
  if (appStore.isDark) {
    return {
      dark: 1,
      mapBrightness: 4,
      baseColor: [0.32, 0.33, 0.4] as [number, number, number],
      markerColor: [0.4, 0.7, 1.0] as [number, number, number],
      glowColor: [0.2, 0.25, 0.45] as [number, number, number],
      arcColor: [0.45, 0.75, 1.0] as [number, number, number],
    }
  }
  return {
    dark: 0,
    mapBrightness: 6,
    baseColor: [1, 1, 1] as [number, number, number],
    markerColor: [0.21, 0.51, 0.93] as [number, number, number],
    glowColor: [1, 1, 1] as [number, number, number],
    arcColor: [0.21, 0.51, 0.93] as [number, number, number],
  }
})

function getRenderSize() {
  const width = containerWidth.value || canvasRef.value?.clientWidth || 320
  const height = containerHeight.value || canvasRef.value?.clientHeight || width
  return { width, height }
}

function buildInitialOptions(): COBEOptions {
  const colors = themeColors.value
  const { width, height } = getRenderSize()
  return {
    devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    width: width * 2,
    height: height * 2,
    phi: phi.value,
    theta: 0.22,
    dark: colors.dark,
    diffuse: 1.2,
    mapSamples: 16000,
    mapBrightness: colors.mapBrightness,
    baseColor: colors.baseColor,
    markerColor: colors.markerColor,
    glowColor: colors.glowColor,
    markers: markers.value,
    arcs: arcs.value,
    arcColor: colors.arcColor,
    arcWidth: 0.75,
    arcHeight: 0.3,
    markerElevation: 0,
  }
}

function animate() {
  if (!globe)
    return
  if (!isPointerDown.value)
    targetPhi.value += 0.0012
  phi.value += (targetPhi.value - phi.value) * 0.12
  const { width, height } = getRenderSize()
  globe.update({
    phi: phi.value,
    width: width * 2,
    height: height * 2,
  })
  syncOverlays()
  rafId = requestAnimationFrame(animate)
}

function startGlobe() {
  if (!canvasRef.value)
    return
  globe = createGlobe(canvasRef.value, buildInitialOptions())
  rafId = requestAnimationFrame(animate)
}

function stopGlobe() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  globe?.destroy()
  globe = null
  anchorElCache.clear()
}

function rebuildGlobe() {
  stopGlobe()
  startGlobe()
}

onMounted(() => {
  startGlobe()
})

onBeforeUnmount(() => {
  stopGlobe()
})

// 切换主题需要重建（baseColor/dark 等颜色在 createGlobe 阶段固化）
watch(() => appStore.isDark, () => rebuildGlobe())
// 仅当地区集合或数量真正变化时才推送 markers/arcs，避免每次速率更新都搬运 WebGL buffer
watch(
  () => regionClusters.value.map(clusterKey).join(','),
  () => {
    if (!globe)
      return
    globe.update({ markers: markers.value, arcs: arcs.value })
  },
)

function onPointerDown(e: PointerEvent) {
  isPointerDown.value = true
  lastPointerX = e.clientX;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function onPointerMove(e: PointerEvent) {
  if (!isPointerDown.value)
    return
  const delta = e.clientX - lastPointerX
  lastPointerX = e.clientX
  targetPhi.value += delta / 200
}
function onPointerUp(e: PointerEvent) {
  isPointerDown.value = false;
  (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
}

const totalServers = computed(() => regionClusters.value.reduce((sum, c) => sum + c.servers, 0))
const onlineServers = computed(() => regionClusters.value.reduce((sum, c) => sum + c.onlineServers, 0))
const offlineServers = computed(() => totalServers.value - onlineServers.value)

function rateFor(code: string): RegionRate {
  return regionRates.value.get(code) ?? { up: 0, down: 0 }
}

function formatRate(bytesPerSec: number): string {
  const { value, unit } = formatBytesPerSecondSplit(bytesPerSec, appStore.byteDecimals)
  return `${value} ${unit}`
}
</script>

<template>
  <div ref="containerRef" class="relative aspect-square w-full max-w-md mx-auto -translate-y-6 md:-translate-y-12">
    <canvas
      ref="canvasRef"
      class="earth-globe-canvas absolute inset-0 w-full h-full select-none touch-none cursor-grab active:cursor-grabbing"
      @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp"
    />

    <div
      v-for="cluster in regionClusters" :key="`flag-${cluster.code}`" :ref="(el) => onFlagRef(el, cluster.code)"
      class="region-flag transition-opacity duration-300" :style="{
        opacity: `var(--cobe-visible-${markerId(cluster.code)}, 0)`,
      }"
    >
      <img :src="`/images/flags/${cluster.code}.svg`" :alt="cluster.code" class="size-4 block">
    </div>

    <div
      v-for="cluster in regionClusters" :key="cluster.code" :ref="(el) => onLabelRef(el, cluster.code)"
      class="cdn-label bg-background/60 backdrop-blur-[2px] rounded transition-[opacity,filter] duration-500" :style="{
        opacity: `var(--cobe-visible-${markerId(cluster.code)}, 0)`,
        filter: `blur(calc((1 - var(--cobe-visible-${markerId(cluster.code)}, 0)) * 20px))`,
      }"
    >
      <div class="p-0.5 px-1 text-xs zoom-80 items-start justify-center text-nowrap">
        <div class="text-green-600 flex flex-row items-center gap-0.5">
          <Icon icon="tabler:chevron-up" width="12" height="12" /> {{ formatRate(rateFor(cluster.code).up) }}
        </div>
        <div class="text-blue-600 flex flex-row items-center gap-0.5">
          <Icon icon="tabler:chevron-down" width="12" height="12" /> {{ formatRate(rateFor(cluster.code).down) }}
        </div>
      </div>
    </div>

    <div
      v-if="totalServers > 0"
      class="absolute top-6 md:top-12 left-0 text-[10px] text-muted-foreground pointer-events-none flex gap-2 items-center backdrop-blur-lg bg-background/60 rounded px-2 py-0.5"
    >
      <div v-if="onlineServers > 0" class="flex items-center gap-1">
        <span class="inline-block size-1.5 rounded-full bg-green-600 animate-pulse" />
        <span class="text-green-600">{{ onlineServers }}</span>
      </div>
      <div v-if="offlineServers > 0" class="flex items-center gap-1">
        <span class="inline-block size-1.5 rounded-full bg-yellow-600 animate-pulse" />
        <span class="text-yellow-600">{{ offlineServers }}</span>
      </div>
      <!-- <div v-if="totalServers > 0" class="flex items-center gap-1">
        <span class="inline-block size-1.5 rounded-full bg-blue-600 animate-pulse" />
        <span class="text-blue-600">{{ totalServers }}</span>
      </div> -->
    </div>
  </div>
</template>

<style scoped>
.earth-globe-canvas {
  contain: layout paint;
}

/* CDN 标签 & 国旗 marker：位置完全由 JS 写入 transform: translate3d(x, y, 0) ... 驱动
   - translate3d 强制独立合成层，跳过 layout/paint，只走 GPU composite
   - top/left 固定为 0，只作为 transform 起点 */
.cdn-label {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: flex-end;
  gap: 4px;
  pointer-events: none;
  will-change: transform;
}

.region-flag {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  will-change: transform, opacity;
}
</style>
