<script setup lang="ts">
import type { CurrencyCode } from '@/utils/financeHelper'
import { Icon } from '@iconify/vue'
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardX } from '@/components/ui/card-x'
import { Empty } from '@/components/ui/empty'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import * as financeHelper from '@/utils/financeHelper'
import { formatBytesPerSecondWithConfig, formatBytesWithConfig, formatDateTime, formatUptimeWithFormat } from '@/utils/helper'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getRegionCode, getRegionDisplayName } from '@/utils/regionHelper'
import { formatPrice, formatPriceWithCycle, getExpireStatus, getExpireText } from '@/utils/tagHelper'

const LoadChart = defineAsyncComponent(() => import('@/components/LoadChart.vue'))
const PingChart = defineAsyncComponent(() => import('@/components/PingChart.vue'))

const route = useRoute()
const router = useRouter()

const appStore = useAppStore()
const nodesStore = useNodesStore()
const exchangeRates = ref(financeHelper.DEFAULT_EXCHANGE_RATES)
const financeCurrency = ref<CurrencyCode>('CNY')

onMounted(async () => {
  window.scrollTo({ top: 0, behavior: 'instant' })
  financeCurrency.value = financeHelper.getStoredFinanceCurrency()

  const { rates } = await financeHelper.getDailyExchangeRates()
  exchangeRates.value = rates
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

interface MetricCard {
  label: string
  value: string
  icon: string
  valueClass?: string
}

const MONTH_DAYS = 30

function formatNodeAmount(amount: number, currency: string): string {
  if (!Number.isFinite(amount) || amount <= 0)
    return formatPrice(0, currency, appStore.lang)

  const fractionDigits = Math.abs(amount) >= 100 ? 0 : 2
  const normalizedAmount = Number(amount.toFixed(fractionDigits))
  return formatPrice(normalizedAmount, currency, appStore.lang)
}

function calculateMonthlyAverageCost(price: number, billingCycle: number): number | null {
  const normalizedPrice = Number(price)
  const normalizedCycle = Number(billingCycle)

  if (!Number.isFinite(normalizedPrice) || normalizedPrice <= 0)
    return 0

  if (!Number.isFinite(normalizedCycle) || normalizedCycle <= 0)
    return null

  return normalizedPrice / normalizedCycle * MONTH_DAYS
}

const nodePriceText = computed(() => {
  if (!data.value)
    return '-'

  if (Number(data.value.price) <= 0)
    return formatPrice(0, data.value.currency, appStore.lang)

  return formatPriceWithCycle(data.value.price, data.value.billing_cycle, data.value.currency, appStore.lang)
})

const monthlyAverageCostText = computed(() => {
  if (!data.value)
    return '-'

  const monthlyAverageCost = calculateMonthlyAverageCost(data.value.price, data.value.billing_cycle)
  if (monthlyAverageCost === null)
    return appStore.lang === 'zh-CN' ? '不适用' : 'N/A'

  return `${formatNodeAmount(monthlyAverageCost, data.value.currency)} / 月`
})

const remainingTimeText = computed(() => {
  if (!data.value?.expired_at)
    return '-'

  return getExpireText(data.value.expired_at, appStore.lang)
})

const remainingValueText = computed(() => {
  if (!data.value)
    return '-'

  const remainingValueCNY = financeHelper.calculateRemainingValueCNY(data.value, exchangeRates.value)
  const targetRate = exchangeRates.value[financeCurrency.value] || 1
  const formattedValue = financeHelper.formatFinanceAmount(remainingValueCNY * targetRate, financeCurrency.value)

  return `${formattedValue.symbol}${formattedValue.value} ${formattedValue.currency}`
})

const remainingTimeValueClass = computed(() => {
  if (!data.value?.expired_at)
    return ''

  const status = getExpireStatus(data.value.expired_at)
  if (status === 'expired' || status === 'critical')
    return 'text-destructive'
  if (status === 'warning')
    return 'text-orange-600 dark:text-orange-400'
  if (status === 'long_term')
    return 'text-muted-foreground'
  return 'text-emerald-600 dark:text-emerald-400'
})

const metricCards = computed<MetricCard[]>(() => {
  if (!data.value)
    return []

  return [
    {
      label: '节点价格',
      value: nodePriceText.value,
      icon: 'tabler:cash',
    },
    {
      label: '月均支出',
      value: monthlyAverageCostText.value,
      icon: 'tabler:receipt-2',
    },
    {
      label: '剩余时间',
      value: remainingTimeText.value,
      icon: 'tabler:calendar-dollar',
      valueClass: remainingTimeValueClass.value,
    },
    {
      label: '剩余价值',
      value: remainingValueText.value,
      icon: 'tabler:coins',
    },
  ]
})

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

      <div class="px-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <CardX
          v-for="item in metricCards" :key="item.label"
          hoverable size="small"
          class="group h-full bg-background/50 border-none hover:bg-background transition-all rounded-md"
          content-class="h-full !p-3"
        >
          <div class="flex h-full min-h-20 flex-col justify-between gap-3">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-medium tracking-wider text-muted-foreground">{{ item.label }}</span>
              <Icon
                :icon="item.icon" :width="20" :height="20"
                class="text-slate-500/25 transition-colors group-hover:text-slate-500"
              />
            </div>
            <div class="min-w-0 space-y-1">
              <div class="truncate text-base font-semibold leading-none sm:text-2xl" :class="item.valueClass">
                {{ item.value }}
              </div>
            </div>
          </div>
        </CardX>
      </div>

      <div class="px-4 pt-4 gap-4 grid grid-cols-1 lg:grid-cols-2">
        <CardX
          title="硬件信息" size="small"
          class="group h-full bg-background/50 border-none hover:bg-background transition-all rounded-md"
        >
          <div class="gap-3 grid grid-cols-1 sm:grid-cols-2">
            <div v-for="item in hardwareInfo" :key="item.label" class="min-w-0 flex flex-col gap-1 rounded-sm bg-slate-500/5 p-2">
              <div class="flex gap-1 items-center text-muted-foreground">
                <Icon v-if="item.icon" :icon="item.icon" :width="14" :height="14" />
                <span class="text-xs sm:text-sm">{{ item.label }}</span>
              </div>
              <span class="text-xs sm:text-sm break-all">{{ item.value }}</span>
            </div>
          </div>
        </CardX>

        <CardX
          title="系统信息" size="small"
          class="group h-full bg-background/50 border-none hover:bg-background transition-all rounded-md"
        >
          <div class="gap-3 grid grid-cols-1 sm:grid-cols-2">
            <div v-for="item in systemInfo" :key="item.label" class="min-w-0 flex flex-col gap-1 rounded-sm bg-slate-500/5 p-2">
              <div class="flex gap-1 items-center text-muted-foreground">
                <Icon v-if="item.icon" :icon="item.icon" :width="14" :height="14" />
                <span class="text-xs sm:text-sm">{{ item.label }}</span>
              </div>
              <div class="flex min-w-0 gap-2 items-center">
                <img v-if="item.label === '操作系统'" :src="getOSImage(data.os)" :alt="getOSName(data.os)" class="size-5 shrink-0">
                <span class="text-xs sm:text-sm break-all">
                  {{ item.value }}
                </span>
              </div>
            </div>
          </div>
        </CardX>

        <CardX
          title="存储信息" size="small"
          class="group h-full bg-background/50 border-none hover:bg-background transition-all rounded-md"
        >
          <div class="gap-3 grid grid-cols-1 sm:grid-cols-3">
            <div v-for="item in storageInfo" :key="item.label" class="min-w-0 flex flex-col gap-1 rounded-sm bg-slate-500/5 p-2">
              <div class="flex gap-1 items-center text-muted-foreground">
                <Icon v-if="item.icon" :icon="item.icon" :width="14" :height="14" />
                <span class="text-xs sm:text-sm">{{ item.label }}</span>
              </div>
              <span class="text-xs sm:text-sm break-all">{{ item.value }}</span>
            </div>
          </div>
        </CardX>

        <CardX
          title="网络信息" size="small"
          class="group h-full bg-background/50 border-none hover:bg-background transition-all rounded-md"
        >
          <div class="gap-3 grid grid-cols-1 sm:grid-cols-2">
            <div class="min-w-0 flex flex-col gap-1 rounded-sm bg-slate-500/5 p-2 relative">
              <div class="flex gap-1 items-center text-muted-foreground">
                <Icon icon="icon-park-outline:transfer-data" :width="14" :height="14" />
                <span class="text-xs sm:text-sm">总流量</span>
                <div class="flex-1"></div>
                <!-- TODO 已用/总量 -->
              </div>
              <span class="text-xs sm:text-sm break-all flex flex-row flex-wrap items-center gap-1">
                <Icon icon="tabler:upload" width="12" height="12" />
                {{ formatBytes(data?.net_total_up ?? 0) }}
                <span class="px-1" />
                <Icon icon="tabler:download" width="12" height="12" />
                {{ formatBytes(data?.net_total_down ?? 0) }}
              </span>
              <!-- TODO 展示流量进度（无限流量时隐藏） -->
              <!-- <div class="absolute inset-y-0 left-0 rounded-sm bg-primary/10 w-10 pointer-events-none"></div> -->
            </div>
            <div class="min-w-0 flex flex-col gap-1 rounded-sm bg-slate-500/5 p-2">
              <div class="flex gap-1 items-center text-muted-foreground">
                <Icon icon="icon-park-outline:dashboard-one" :width="14" :height="14" />
                <span class="text-xs sm:text-sm">网络速率</span>
              </div>
              <span class="text-xs sm:text-sm break-all flex flex-row flex-wrap items-center gap-1">
                <Icon icon="tabler:chevron-up" width="12" height="12" />
                {{ formatBytesPerSecond(data?.net_out ?? 0) }}
                <span class="px-1" />
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
