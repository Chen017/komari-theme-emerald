<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import NodeEarthGlobe from '@/components/NodeEarthGlobe.vue'
import { CardX } from '@/components/ui/card-x'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { formatBytesPerSecondSplit, formatBytesSplit } from '@/utils/helper'

const appStore = useAppStore()
const nodesStore = useNodesStore()

const totalSpeed = computed(() => {
  const onlineNodes = nodesStore.nodes.filter(node => node.online)
  const up = onlineNodes.reduce((sum, node) => sum + (node.net_out || 0), 0)
  const down = onlineNodes.reduce((sum, node) => sum + (node.net_in || 0), 0)
  return { up, down }
})

const totalTraffic = computed(() => {
  const up = nodesStore.nodes.reduce((sum, node) => sum + (node.net_total_up || 0), 0)
  const down = nodesStore.nodes.reduce((sum, node) => sum + (node.net_total_down || 0), 0)
  return { up, down }
})

const onlineRegionCount = computed(() => new Set(
  nodesStore.nodes.filter(node => node.online && node.region !== '').map(node => node.region),
).size)

const onlineNodeCount = computed(() => nodesStore.nodes.filter(node => node.online).length)

const formattedTrafficUp = computed(() => formatBytesSplit(totalTraffic.value.up, appStore.byteDecimals))
const formattedTrafficDown = computed(() => formatBytesSplit(totalTraffic.value.down, appStore.byteDecimals))

const formattedSpeedUp = computed(() => formatBytesPerSecondSplit(totalSpeed.value.up, appStore.byteDecimals))
const formattedSpeedDown = computed(() => formatBytesPerSecondSplit(totalSpeed.value.down, appStore.byteDecimals))

// ==================== 内存 / 硬盘 汇总 ====================
// 离线节点的 ram / disk 为 0，不影响 used 求和；mem_total / disk_total 是静态库存信息，按全量统计
const totalMemory = computed(() => {
  let used = 0
  let total = 0
  for (const node of nodesStore.nodes) {
    used += node.ram || 0
    total += node.mem_total || 0
  }
  return { used, total }
})

const totalDisk = computed(() => {
  let used = 0
  let total = 0
  for (const node of nodesStore.nodes) {
    used += node.disk || 0
    total += node.disk_total || 0
  }
  return { used, total }
})

const formattedMemoryUsed = computed(() => formatBytesSplit(totalMemory.value.used, appStore.byteDecimals))
const formattedMemoryTotal = computed(() => formatBytesSplit(totalMemory.value.total, appStore.byteDecimals))
const formattedDiskUsed = computed(() => formatBytesSplit(totalDisk.value.used, appStore.byteDecimals))
const formattedDiskTotal = computed(() => formatBytesSplit(totalDisk.value.total, appStore.byteDecimals))
</script>

<template>
  <div class="p-4 grid grid-cols-12 grid-rows-1 gap-2 h-58">
    <NodeEarthGlobe class="col-span-6 col-start-7" />

    <div class="col-span-6 row-start-1 grid grid-cols-12 grid-rows-2 gap-2 rounded-xl h-50">
      <CardX
        hoverable
        class="col-span-4 row-span-1 col-start-1 row-start-1 group h-full bg-background/60 border-none hover:bg-background transition-all"
        content-class="h-full !p-3"
      >
        <div class="flex h-full flex-col justify-between gap-1">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium tracking-wider text-muted-foreground">内存用量</span>
            <Icon
              icon="tabler:cpu" :width="14" :height="14"
              class="text-sky-500/70 group-hover:text-sky-500 transition-colors"
            />
          </div>
          <div class="flex items-baseline gap-1 min-w-0 font-number">
            <span class="text-2xl font-bold leading-none tracking-tight">{{ formattedMemoryUsed.value }}</span>
            <span class="text-xs font-medium text-muted-foreground truncate">
              / {{ formattedMemoryTotal.value }} {{ formattedMemoryTotal.unit }}
            </span>
          </div>
        </div>
      </CardX>
      <CardX
        hoverable
        class="col-span-4 row-span-1 col-start-1 row-start-2 group h-full bg-background/60 border-none hover:bg-background transition-all"
        content-class="h-full !p-3"
      >
        <div class="flex h-full flex-col justify-between gap-1">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium tracking-wider text-muted-foreground">硬盘用量</span>
            <Icon
              icon="tabler:database" :width="14" :height="14"
              class="text-sky-500/70 group-hover:text-sky-500 transition-colors"
            />
          </div>
          <div class="flex items-baseline gap-1 min-w-0 font-number">
            <span class="text-2xl font-bold leading-none tracking-tight">{{ formattedDiskUsed.value }}</span>
            <span class="text-xs font-medium text-muted-foreground truncate">
              / {{ formattedDiskTotal.value }} {{ formattedDiskTotal.unit }}
            </span>
          </div>
        </div>
      </CardX>

      <CardX
        hoverable
        class="col-span-4 row-span-1 col-start-5 row-start-1 group bg-background/60 border-none hover:bg-background transition-all"
        content-class="h-full !p-3"
      >
        <div class="flex h-full flex-col justify-between gap-1">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium tracking-wider text-muted-foreground">累计上行</span>
            <Icon
              icon="tabler:cloud-up" :width="14" :height="14"
              class="text-emerald-500/70 group-hover:text-emerald-500 transition-colors"
            />
          </div>
          <div class="flex items-baseline gap-1 font-number">
            <span class="text-2xl font-bold leading-none tracking-tight">{{ formattedTrafficUp.value }}</span>
            <span class="text-xs font-medium text-muted-foreground">{{ formattedTrafficUp.unit }}</span>
          </div>
        </div>
      </CardX>
      <CardX
        hoverable
        class="col-span-4 row-span-1 col-start-5 row-start-2 group bg-background/60 border-none hover:bg-background transition-all"
        content-class="h-full !p-3"
      >
        <div class="flex h-full flex-col justify-between gap-1">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium tracking-wider text-muted-foreground">累计下行</span>
            <Icon
              icon="tabler:cloud-down" :width="14" :height="14"
              class="text-sky-500/70 group-hover:text-sky-500 transition-colors"
            />
          </div>
          <div class="flex items-baseline gap-1 font-number">
            <span class="text-2xl font-bold leading-none tracking-tight">{{ formattedTrafficDown.value }}</span>
            <span class="text-xs font-medium text-muted-foreground">{{ formattedTrafficDown.unit }}</span>
          </div>
        </div>
      </CardX>

      <CardX
        hoverable
        class="col-span-4 row-span-1 col-start-9 row-start-1 group bg-background/60 border-none hover:bg-background transition-all"
        content-class="h-full !p-3"
      >
        <div class="flex h-full flex-col justify-between gap-1">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium tracking-wider text-muted-foreground">实时上行</span>
            <Icon
              icon="tabler:chevrons-up" :width="14" :height="14"
              class="text-emerald-500/70 group-hover:text-emerald-500 transition-colors"
            />
          </div>
          <div class="flex items-baseline gap-1 font-number">
            <span class="text-2xl font-bold leading-none tracking-tight">{{ formattedSpeedUp.value }}</span>
            <span class="text-xs font-medium text-muted-foreground">{{ formattedSpeedUp.unit }}</span>
          </div>
        </div>
      </CardX>
      <CardX
        hoverable
        class="col-span-4 row-span-1 col-start-9 row-start-2 group bg-background/60 border-none hover:bg-background transition-all"
        content-class="h-full !p-3"
      >
        <div class="flex h-full flex-col justify-between gap-1">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium tracking-wider text-muted-foreground">实时下行</span>
            <Icon
              icon="tabler:chevrons-down" :width="14" :height="14"
              class="text-sky-500/70 group-hover:text-sky-500 transition-colors"
            />
          </div>
          <div class="flex items-baseline gap-1 font-number">
            <span class="text-2xl font-bold leading-none tracking-tight">{{ formattedSpeedDown.value }}</span>
            <span class="text-xs font-medium text-muted-foreground">{{ formattedSpeedDown.unit }}</span>
          </div>
        </div>
      </CardX>
    </div>
  </div>
</template>
