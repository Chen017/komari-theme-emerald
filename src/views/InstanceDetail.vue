<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed, defineAsyncComponent, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardX } from '@/components/ui/card-x'
import { Empty } from '@/components/ui/empty'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { formatBytesPerSecondWithConfig, formatBytesWithConfig, formatDateTime, formatUptimeWithFormat } from '@/utils/helper'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getRegionCode, getRegionDisplayName } from '@/utils/regionHelper'

const LoadChart = defineAsyncComponent(() => import('@/components/LoadChart.vue'))
const PingChart = defineAsyncComponent(() => import('@/components/PingChart.vue'))

const route = useRoute()
const router = useRouter()

const appStore = useAppStore()
const nodesStore = useNodesStore()

onMounted(() => {
  window.scrollTo({ top: 0, behavior: 'instant' })
})

const formatBytes = (bytes: number) => formatBytesWithConfig(bytes, appStore.byteDecimals)
const formatBytesPerSecond = (bytes: number) => formatBytesPerSecondWithConfig(bytes, appStore.byteDecimals)
const formatUptime = (seconds: number) => formatUptimeWithFormat(seconds, 'minute')

const data = computed(() => nodesStore.nodes.find(node => node.uuid === route.params.id))

interface InfoItem {
  label: string
  value: string | undefined
  icon?: string
}

const hardwareInfo = computed<InfoItem[]>(() => [
  { label: 'CPU', value: data.value ? `${data.value.cpu_name} (x${data.value.cpu_cores})` : '-', icon: 'icon-park-outline:cpu' },
  { label: '架构', value: data.value?.arch ?? '-', icon: 'icon-park-outline:application-two' },
  { label: '虚拟化', value: data.value?.virtualization ?? '-', icon: 'icon-park-outline:server' },
  { label: 'GPU', value: data.value?.gpu_name || '-', icon: 'icon-park-outline:video-one' },
])

const systemInfo = computed<InfoItem[]>(() => [
  { label: '操作系统', value: data.value?.os ?? '-', icon: 'icon-park-outline:computer' },
  { label: '内核版本', value: data.value?.kernel_version ?? '-', icon: 'icon-park-outline:code' },
  { label: '运行时间', value: formatUptime(data.value?.uptime ?? 0), icon: 'icon-park-outline:timer' },
  { label: '最后上报', value: formatDateTime(data.value?.time), icon: 'icon-park-outline:time' },
])

const storageInfo = computed<InfoItem[]>(() => [
  { label: '内存', value: formatBytes(data.value?.mem_total ?? 0), icon: 'icon-park-outline:memory' },
  { label: '内存交换', value: formatBytes(data.value?.swap_total ?? 0), icon: 'icon-park-outline:switch' },
  { label: '硬盘', value: formatBytes(data.value?.disk_total ?? 0), icon: 'icon-park-outline:hard-disk' },
])
</script>

<template>
  <div class="instance-detail">
    <div v-if="!data" class="p-4">
      <CardX>
        <Empty description="节点不存在或已被删除">
          <template #extra>
            <Button @click="router.push('/')">
              返回首页
            </Button>
          </template>
        </Empty>
      </CardX>
    </div>

    <template v-else>
      <div class="px-4 py-2 flex gap-4 items-center">
        <Button variant="ghost" size="icon-sm" class="bg-background/50" @click="router.push('/')">
          <Icon icon="tabler:arrow-left" :width="16" :height="16" />
        </Button>
        <div class="text-lg font-bold flex gap-2 items-center">
          <img
            :src="`/images/flags/${getRegionCode(data.region)}.svg`" :alt="getRegionDisplayName(data.region)"
            class="size-6"
          >
          <span>{{ data.name }}</span>
        </div>
        <Badge :variant="data.online ? 'default' : 'destructive'" class="text-xs !rounded">
          {{ data.online ? '在线' : '离线' }}
        </Badge>
      </div>

      <div class="px-4 gap-4 grid grid-cols-1 md:grid-cols-2">
        <CardX
          title="基本信息" size="small"
          class="col-span-2 group h-full bg-background/50 border-none hover:bg-background transition-all p-1 sm:p-4 rounded-md"
        >
          <div class="gap-2 grid grid-cols-2 lg:grid-cols-4">
            <div v-for="item in [...hardwareInfo, ...systemInfo]" :key="item.label" class="flex flex-col gap-1">
              <div class="flex gap-1 items-center text-muted-foreground">
                <!-- <Icon v-if="item.icon" :icon="item.icon" :width="14" :height="14" /> -->
                <span class="text-xs sm:text-sm">{{ item.label }}</span>
              </div>
              <div class="flex gap-2 items-center">
                <img v-if="item.label === '操作系统'" :src="getOSImage(data.os)" :alt="getOSName(data.os)" class="size-5">
                <span class="text-xs sm:text-sm break-all">
                  {{ item.value }}
                </span>
              </div>
            </div>
          </div>
        </CardX>

        <CardX
          title="存储信息" size="small"
          class="group h-full bg-background/50 border-none hover:bg-background transition-all p-1 col-span-2 sm:p-4 md:col-span-1 rounded-md"
        >
          <div class="gap-2 grid grid-cols-3">
            <div v-for="item in storageInfo" :key="item.label" class="flex flex-col gap-1">
              <div class="flex gap-1 items-center text-muted-foreground">
                <Icon v-if="item.icon" :icon="item.icon" :width="14" :height="14" />
                <span class="text-xs sm:text-sm">{{ item.label }}</span>
              </div>
              <span class="text-xs sm:text-sm">{{ item.value }}</span>
            </div>
          </div>
        </CardX>

        <CardX
          title="网络信息" size="small"
          class="group h-full bg-background/50 border-none hover:bg-background transition-all p-1 col-span-2 sm:p-4 md:col-span-1 rounded-md"
        >
          <div class="gap-2 grid grid-cols-2">
            <div class="flex flex-col gap-1">
              <div class="flex gap-1 items-center text-muted-foreground">
                <Icon icon="icon-park-outline:transfer-data" :width="14" :height="14" />
                <span class="text-xs sm:text-sm">总流量</span>
              </div>
              <span class="text-xs sm:text-sm break-all flex flex-row items-center gap-1">
                <Icon icon="tabler:upload" width="12" height="12" />
                {{ formatBytes(data?.net_total_up ?? 0) }}
                <span class="p-1" />
                <Icon icon="tabler:download" width="12" height="12" />
                {{ formatBytes(data?.net_total_down ?? 0) }}
              </span>
            </div>
            <div class="flex flex-col gap-1">
              <div class="flex gap-1 items-center text-muted-foreground">
                <Icon icon="icon-park-outline:dashboard-one" :width="14" :height="14" />
                <span class="text-xs sm:text-sm">网络速率</span>
              </div>
              <span class="text-xs sm:text-sm break-all flex flex-row items-center gap-1">
                <Icon icon="tabler:chevron-up" width="12" height="12" />
                {{ formatBytesPerSecond(data?.net_out ?? 0) }}
                <span class="p-1" />
                <Icon icon="tabler:chevron-down" width="12" height="12" />
                {{ formatBytesPerSecond(data?.net_in ?? 0) }}
              </span>
            </div>
          </div>
        </CardX>
      </div>

      <div class="p-4 space-y-4">
        <LoadChart :uuid="data.uuid" />
        <PingChart :uuid="data.uuid" />
      </div>
    </template>
  </div>
</template>
