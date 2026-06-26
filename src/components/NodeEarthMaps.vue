<script setup lang="ts">
import type { EChartsOption, TopLevelFormatterParams } from 'echarts/types/dist/shared'
import type { NodeData } from '@/stores/nodes'
import { useIntervalFn } from '@vueuse/core'
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import VChart from 'vue-echarts'
import { Empty } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { useAppStore } from '@/stores/app'
import { ensureWorldMapRegistered } from '@/utils/echartsWorldMap'
import { getCoordByCode, getCountryCodeFromRegion } from '@/utils/geoHelper'
import { getRegionDisplayName } from '@/utils/regionHelper'
import '@/utils/echarts'

interface EarthMapPoint {
  code: string
  name: string
  coord: [number, number]
  online: number
  total: number
}

const props = defineProps<{
  nodes?: NodeData[]
}>()

const MAP_REFRESH_INTERVAL_MS = 60_000

const appStore = useAppStore()
const displayNodes = computed(() => props.nodes ?? [])
const sampledNodes = shallowRef<NodeData[]>([])
const mapName = ref<string>()
const loading = ref(true)
const loadError = ref<string | null>(null)

const regionDisplayNames = typeof Intl.DisplayNames === 'function'
  ? new Intl.DisplayNames(['zh-Hans'], { type: 'region' })
  : null

function resolveCountryDisplayName(region: string, code: string): string {
  const regionName = getRegionDisplayName(region)
  if (regionName !== region)
    return regionName

  return regionDisplayNames?.of(code) ?? code
}

function refreshSampledNodes() {
  sampledNodes.value = [...displayNodes.value]
}

const mapStructureSignature = computed(() => {
  return displayNodes.value
    .map(node => `${node.uuid}:${node.region}`)
    .join('|')
})

watch(mapStructureSignature, () => {
  refreshSampledNodes()
}, { immediate: true })

useIntervalFn(
  () => {
    refreshSampledNodes()
  },
  MAP_REFRESH_INTERVAL_MS,
  { immediate: true },
)

const points = computed<EarthMapPoint[]>(() => {
  const map = new Map<string, EarthMapPoint>()
  for (const node of sampledNodes.value) {
    const code = getCountryCodeFromRegion(node.region)
    if (!code)
      continue
    const coord = getCoordByCode(code)
    if (!coord)
      continue
    const current = map.get(code)
    if (!current) {
      map.set(code, {
        code,
        name: resolveCountryDisplayName(node.region, code),
        coord,
        online: node.online ? 1 : 0,
        total: 1,
      })
      continue
    }
    current.total += 1
    current.online += node.online ? 1 : 0
  }

  return Array.from(map.values()).sort((a, b) => b.online - a.online || b.total - a.total)
})

const totalServers = computed(() => sampledNodes.value.length)
const onlineServers = computed(() => sampledNodes.value.filter(node => node.online).length)
const offlineServers = computed(() => totalServers.value - onlineServers.value)
const pointsByCode = computed(() => new Map(points.value.map(point => [point.code, point])))

const chartThemeColors = computed(() => ({
  areaColor: appStore.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.06)',
  borderColor: appStore.isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.06)',
  hoverBorderColor: appStore.isDark ? 'rgba(16, 185, 129, 0.9)' : 'rgba(5, 150, 105, 0.85)',
  activeAreaColor: appStore.isDark ? 'rgba(16, 185, 129, 0.52)' : 'rgba(16, 185, 129, 0.36)',
  offlineAreaColor: appStore.isDark ? 'rgba(234, 179, 8, 0.32)' : 'rgba(202, 138, 4, 0.22)',
  activeBorderColor: appStore.isDark ? 'rgba(16, 185, 129, 0.95)' : 'rgba(5, 150, 105, 0.92)',
  offlineBorderColor: appStore.isDark ? 'rgba(234, 179, 8, 0.8)' : 'rgba(202, 138, 4, 0.88)',
  tooltipBg: appStore.isDark ? 'rgba(24, 24, 27, 0.95)' : 'rgba(255, 255, 255, 0.92)',
  tooltipText: appStore.isDark ? 'rgba(255, 255, 255, 0.92)' : 'rgba(15, 23, 42, 0.92)',
  tooltipTextSecondary: appStore.isDark ? 'rgba(255, 255, 255, 0.58)' : 'rgba(15, 23, 42, 0.6)',
  tooltipShadow: appStore.isDark ? 'rgba(0, 0, 0, 0.35)' : 'rgba(15, 23, 42, 0.08)',
}))

const mapSeriesData = computed(() => points.value.map(point => ({
  name: point.code,
  value: point.total,
  itemStyle: {
    areaColor: point.online > 0
      ? chartThemeColors.value.activeAreaColor
      : chartThemeColors.value.offlineAreaColor,
    borderColor: point.online > 0
      ? chartThemeColors.value.activeBorderColor
      : chartThemeColors.value.offlineBorderColor,
    borderWidth: 0.5,
  },
  emphasis: {
    itemStyle: {
      areaColor: point.online > 0
        ? chartThemeColors.value.activeAreaColor
        : chartThemeColors.value.offlineAreaColor,
      borderColor: point.online > 0
        ? chartThemeColors.value.activeBorderColor
        : chartThemeColors.value.offlineBorderColor,
    },
  },
})))

const chartOption = computed<EChartsOption>(() => ({
  animationDurationUpdate: 300,
  animationEasingUpdate: 'cubicOut',
  tooltip: {
    show: true,
    trigger: 'item',
    backgroundColor: chartThemeColors.value.tooltipBg,
    borderWidth: 0,
    padding: [0, 8],
    textStyle: {
      color: chartThemeColors.value.tooltipText,
      fontSize: 10,
      lineHeight: 20,
    },
    formatter: (params: TopLevelFormatterParams) => {
      const current = Array.isArray(params) ? params[0] : params
      const point = pointsByCode.value.get(String(current?.name ?? ''))
      if (!point)
        return ''
      const offline = point.total - point.online

      return [
        `<div class="flex gap-2 items-center">
          <div class="flex items-center gap-1">
            <span class="inline-block size-1.5 rounded-full bg-green-600 animate-pulse"></span>
            <span class="text-green-600">${point.online}</span>
          </div>
          ${offline > 0
    ? `
          <div class="flex items-center gap-1">
            <span class="inline-block size-1.5 rounded-full bg-yellow-600 animate-pulse"></span>
            <span class="text-yellow-600">${offline}</span>
          </div>
          `
    : ''}
        </div>`,
      ].join('')
    },
  },
  series: [
    {
      type: 'map',
      map: mapName.value,
      roam: false,
      selectedMode: false,
      left: 'center',
      top: 'center',
      width: '100%',
      height: '100%',
      layoutCenter: ['50%', '50%'],
      layoutSize: '168%',
      emphasis: {
        label: { show: false },
        itemStyle: {
          areaColor: chartThemeColors.value.borderColor,
          borderColor: chartThemeColors.value.hoverBorderColor,
          borderWidth: 0.5,
        },
      },
      itemStyle: {
        areaColor: chartThemeColors.value.areaColor,
        borderColor: chartThemeColors.value.borderColor,
        borderWidth: 0.5,
      },
      data: mapSeriesData.value,
      label: { show: false },
    },
  ],
}))

onMounted(async () => {
  loading.value = true
  loadError.value = null

  try {
    mapName.value = await ensureWorldMapRegistered()
  }
  catch (error) {
    loadError.value = error instanceof Error ? error.message : '地图资源加载失败'
  }
  finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="relative h-full border-none" content-class="h-full !p-0">
    <div class="relative flex h-88 flex-col items-center">
      <div
        v-if="totalServers > 0"
        class="absolute top-0 right-0 z-2 text-[10px] text-muted-foreground pointer-events-none flex gap-2 items-center backdrop-blur-lg bg-background/60 rounded px-2 py-0.5"
      >
        <div v-if="onlineServers > 0" class="flex items-center gap-1">
          <span class="inline-block size-1.5 rounded-full bg-green-600 animate-pulse" />
          <span class="text-green-600">{{ onlineServers }}</span>
        </div>
        <div v-if="offlineServers > 0" class="flex items-center gap-1">
          <span class="inline-block size-1.5 rounded-full bg-yellow-600 animate-pulse" />
          <span class="text-yellow-600">{{ offlineServers }}</span>
        </div>
      </div>

      <div class="relative flex-1 w-full -translate-y-1/6">
        <Spinner :show="loading" class="h-full w-full" content-class="!bg-transparent">
          <VChart
            v-if="mapName"
            :option="chartOption"
            autoresize
            class="h-full w-full"
          />
          <Empty
            v-else-if="loadError"
            description="地图资源加载失败"
            class="h-full"
          />
        </Spinner>
      </div>
    </div>
  </div>
</template>
