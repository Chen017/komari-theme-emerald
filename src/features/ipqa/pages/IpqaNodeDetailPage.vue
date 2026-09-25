<script setup lang="ts">
import type { IpqaDailyPairedReport, IpqaNormalizedReport, IpqaSemanticChange } from '../types'
import { Icon } from '@iconify/vue'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useNodesStore } from '@/stores/nodes'
import IpqaArchiveNavigator from '../components/IpqaArchiveNavigator.vue'
import IpqaBasicInfo from '../components/IpqaBasicInfo.vue'
import IpqaChangeTimeline from '../components/IpqaChangeTimeline.vue'
import IpqaFactorMatrix from '../components/IpqaFactorMatrix.vue'
import IpqaMailPanel from '../components/IpqaMailPanel.vue'
import IpqaMediaPanel from '../components/IpqaMediaPanel.vue'
import IpqaRawDetails from '../components/IpqaRawDetails.vue'
import IpqaRiskScores from '../components/IpqaRiskScores.vue'
import {
  fetchNodeArchive,
  fetchNodeArchiveDates,
  fetchNodeChanges,
  fetchNodeLatest,
} from '../services/api'

defineOptions({ name: 'IpqaNodeDetailPage' })

const route = useRoute()
const router = useRouter()
const nodesStore = useNodesStore()

const uuid = computed(() => String(route.params.uuid || ''))
const node = computed(() => nodesStore.nodes.find(n => n.uuid === uuid.value) || null)

const loading = ref(true)
const dates = ref<string[]>([])
const currentDate = ref<string>('')
const currentReport = ref<IpqaDailyPairedReport | null>(null)
const activeIpVersion = ref<'IPv4' | 'IPv6'>('IPv4')
const nodeChanges = ref<IpqaSemanticChange[]>([])

type TabKey = 'info' | 'score' | 'factor' | 'media' | 'mail' | 'changes' | 'raw'
const activeTab = ref<TabKey>('info')

const tabs: Array<{ key: TabKey, label: string, icon: string }> = [
  { key: 'info', label: '基本信息', icon: 'lucide:network' },
  { key: 'score', label: '风控评分', icon: 'lucide:shield-alert' },
  { key: 'factor', label: '风险因子', icon: 'lucide:sliders-horizontal' },
  { key: 'media', label: '流媒体与 AI', icon: 'lucide:tv-2' },
  { key: 'mail', label: '邮件与黑名单', icon: 'lucide:mail' },
  { key: 'changes', label: '历史变动', icon: 'lucide:history' },
  { key: 'raw', label: '原始归档', icon: 'lucide:code-2' },
]

let loadGeneration = 0

async function loadArchive(targetDate?: string, refreshMetadata = true) {
  const generation = ++loadGeneration
  const targetUuid = uuid.value
  loading.value = true

  try {
    let availableDates = dates.value

    if (refreshMetadata) {
      const [nextDates, changes] = await Promise.all([
        fetchNodeArchiveDates(targetUuid),
        fetchNodeChanges(targetUuid),
      ])
      if (generation !== loadGeneration) return
      availableDates = nextDates
      dates.value = nextDates
      nodeChanges.value = changes
    }

    if (availableDates.length > 0) {
      const selected = targetDate && availableDates.includes(targetDate)
        ? targetDate
        : availableDates[0]!

      const report = await fetchNodeArchive(targetUuid, selected)
      if (generation !== loadGeneration) return

      currentDate.value = selected
      currentReport.value = report

      if (report?.v4) {
        activeIpVersion.value = 'IPv4'
      }
      else if (report?.v6) {
        activeIpVersion.value = 'IPv6'
      }
    }
    else {
      const latest = await fetchNodeLatest(targetUuid)
      if (generation !== loadGeneration) return

      currentReport.value = latest
      if (latest) {
        dates.value = [latest.date]
        currentDate.value = latest.date
        activeIpVersion.value = latest.v4 ? 'IPv4' : 'IPv6'
      }
      else {
        currentDate.value = ''
      }
    }
  }
  catch (err) {
    if (generation !== loadGeneration) return
    console.warn('[IPQA Detail] Error loading node archive:', err)
    currentReport.value = null
  }
  finally {
    if (generation === loadGeneration) {
      loading.value = false
    }
  }
}

function onDateChange(newDate: string) {
  if (newDate === currentDate.value && currentReport.value?.date === newDate) return
  void router.push({ query: { ...route.query, date: newDate } })
}

watch(
  [uuid, () => route.query.date],
  ([newUuid, newDate], [oldUuid, oldDate]) => {
    const targetDate = typeof newDate === 'string' ? newDate : undefined
    if (newUuid !== oldUuid) {
      dates.value = []
      currentDate.value = ''
      currentReport.value = null
      nodeChanges.value = []
      void loadArchive(targetDate, true)
      return
    }

    if (newDate !== oldDate && targetDate && targetDate !== currentReport.value?.date) {
      void loadArchive(targetDate, false)
    }
  },
  { immediate: true },
)

const activeNormalizedReport = computed<IpqaNormalizedReport | null>(() => {
  if (!currentReport.value) return null
  if (activeIpVersion.value === 'IPv4') {
    return currentReport.value.v4
  }
  return currentReport.value.v6
})
</script>

<template>
  <div class="mx-auto max-w-[1280px] px-4 py-6 overflow-x-hidden space-y-6">
    <!-- Header -->
    <div>
      <div class="mb-2 flex items-center gap-2">
        <RouterLink
          to="/resource-insights"
          class="inline-flex items-center gap-1 text-xs text-neutral-400 dark:text-neutral-500 transition-colors hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          <Icon icon="lucide:arrow-left" class="size-3.5" />
          返回资源概览
        </RouterLink>
      </div>

      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div class="flex items-center gap-2.5">
            <h1 class="text-2xl font-bold tracking-tight text-neutral-800 dark:text-neutral-100 sm:text-3xl">
              {{ node?.name || '节点 IPQA 档案' }}
            </h1>
            <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300">
              IPQA 归档
            </span>
          </div>
          <p class="mt-1 text-xs font-mono text-neutral-400 dark:text-neutral-500">
            UUID: {{ uuid }}
          </p>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="py-16 text-center text-neutral-400">
      <Icon icon="lucide:loader-2" class="w-8 h-8 animate-spin mx-auto mb-2 text-emerald-500" />
      <span class="text-xs">正在加载节点 IPQA 归档数据...</span>
    </div>

    <!-- No Archive State -->
    <div
      v-else-if="!currentReport"
      class="py-16 px-4 text-center rounded-2xl bg-white/80 dark:bg-neutral-900/80 border border-neutral-200/80 dark:border-neutral-800/80"
    >
      <Icon icon="lucide:file-x-2" class="w-10 h-10 mx-auto mb-2 text-neutral-300 dark:text-neutral-600" />
      <h3 class="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
        暂无该节点的 IPQA 历史归档
      </h3>
      <p class="text-xs text-neutral-400 max-w-sm mx-auto">
        该节点可能尚未安装 IP-Quality-Archive 或尚未由插件同步归档文件。
      </p>
    </div>

    <!-- Content -->
    <div v-else class="space-y-5">
      <!-- Navigator: Date selector + IPv4/IPv6 Switch -->
      <IpqaArchiveNavigator
        :dates="dates"
        :current-date="currentDate"
        :has-v4="currentReport.summary.hasV4"
        :has-v6="currentReport.summary.hasV6"
        :active-ip-version="activeIpVersion"
        @update:date="onDateChange"
        @update:ip-version="v => activeIpVersion = v"
      />

      <!-- Tabs -->
      <div class="flex items-center gap-1 border-b border-neutral-200 dark:border-neutral-800 overflow-x-auto pb-px">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          class="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border-b-2 transition-all whitespace-nowrap cursor-pointer"
          :class="activeTab === tab.key ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'"
          @click="activeTab = tab.key"
        >
          <Icon :icon="tab.icon" class="w-4 h-4" />
          <span>{{ tab.label }}</span>
        </button>
      </div>

      <!-- Tab Content: Changes tab (doesn't require normalized report) -->
      <div v-if="activeTab === 'changes'">
        <IpqaChangeTimeline :changes="nodeChanges" />
      </div>

      <!-- Other tabs require active normalized report -->
      <div v-else-if="!activeNormalizedReport" class="py-12 text-center text-xs text-neutral-400">
        该归档日期未包含 {{ activeIpVersion }} 报告数据。
      </div>

      <div v-else>
        <!-- Tab 1: Basic Info -->
        <IpqaBasicInfo v-if="activeTab === 'info'" :report="activeNormalizedReport" />

        <!-- Tab 2: Risk Scores -->
        <IpqaRiskScores v-else-if="activeTab === 'score'" :report="activeNormalizedReport" />

        <!-- Tab 3: Risk Factors -->
        <IpqaFactorMatrix v-else-if="activeTab === 'factor'" :report="activeNormalizedReport" />

        <!-- Tab 4: Media & AI -->
        <IpqaMediaPanel v-else-if="activeTab === 'media'" :report="activeNormalizedReport" />

        <!-- Tab 5: Mail & DNSBL -->
        <IpqaMailPanel v-else-if="activeTab === 'mail'" :report="activeNormalizedReport" />

        <!-- Tab 7: Raw Details -->
        <IpqaRawDetails v-else-if="activeTab === 'raw'" :report="activeNormalizedReport" />
      </div>
    </div>
  </div>
</template>
