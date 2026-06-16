<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import worldMap from '@svg-maps/world'
import { computed } from 'vue'
import { getCoordByCode, getCountryCodeFromRegion } from '@/utils/geoHelper'
import { getRegionDisplayName } from '@/utils/regionHelper'

interface EarthMapPoint {
  code: string
  name: string
  coord: [number, number]
  online: number
  total: number
}

interface MapLocation {
  id: string
  name: string
  path: string
}

const props = defineProps<{
  nodes?: NodeData[]
}>()

const displayNodes = computed(() => props.nodes ?? [])

const mapPaths = worldMap.locations as MapLocation[]
const mapViewBox = worldMap.viewBox

const points = computed<EarthMapPoint[]>(() => {
  const map = new Map<string, EarthMapPoint>()
  for (const node of displayNodes.value) {
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
        name: getRegionDisplayName(node.region),
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

const totalServers = computed(() => displayNodes.value.length)
const onlineServers = computed(() => displayNodes.value.filter(node => node.online).length)
const offlineServers = computed(() => totalServers.value - onlineServers.value)
const activeCodes = computed(() => new Set(points.value.map(point => point.code)))
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

      <div class="relative flex-1 zoom-200 -translate-y-1/5">
        <svg :viewBox="mapViewBox" class="h-full w-full">
          <g class="fill-foreground/10 stroke-foreground/5">
            <path
              v-for="location in mapPaths"
              :key="location.id"
              :d="location.path"
              :class="[activeCodes.has(location.id.toUpperCase()) ? 'fill-emerald-500/50 stroke-emerald-500' : 'transition-colors duration-300 hover:stroke-emerald-500']"
            />
          </g>
        </svg>
      </div>
    </div>
  </div>
</template>
