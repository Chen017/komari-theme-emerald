<script setup lang="ts">
import type { IpqaFleetOverview, IpqaSemanticChange } from '@/features/ipqa'
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { computed, onMounted, ref } from 'vue'
import {
  fetchFleetOverview,
  fetchNodeChanges,
  IpqaFleetSummary,
  IpqaMediaMatrix,
  IpqaNodeGrid,
  IpqaRiskMatrix,
  RecentIpqaChanges,
} from '@/features/ipqa'
import { useAppStore } from '@/stores/app'

const props = defineProps<{
  nodes: readonly NodeData[]
}>()

const loading = ref(false)
const overview = ref<IpqaFleetOverview | null>(null)
const recentChanges = ref<Array<IpqaSemanticChange & { nodeName: string }>>([])
const isPluginAvailable = ref<boolean | null>(null)

async function loadData() {
  loading.value = true
  try {
    const data = await fetchFleetOverview()
    if (data) {
      overview.value = data
      isPluginAvailable.value = true
      // Collect recent changes across nodes
      const allChanges: Array<IpqaSemanticChange & { nodeName: string }> = []
      for (const node of data.nodes) {
        if (node.status === 'ok' || node.status === 'stale' || node.changes_today > 0) {
          const nodeChanges = await fetchNodeChanges(node.uuid)
          for (const c of nodeChanges) {
            // Defensively filter out any execution metadata/timestamp noise
            if (c.field && (c.field.includes('Head') || c.field.includes('Time') || c.field.includes('timestamp'))) {
              continue
            }
            allChanges.push({ ...c, nodeName: node.name })
          }
        }
      }
      // Sort newest first
      allChanges.sort((a, b) => b.date.localeCompare(a.date))
      recentChanges.value = allChanges.slice(0, 15)
    }
    else {
      isPluginAvailable.value = false
      // Fallback synthetic overview from current nodes list if plugin not yet synced
      overview.value = {
        schema_version: 1,
        updated_at: new Date().toISOString(),
        total_nodes: props.nodes.length,
        ipqa_nodes: 0,
        nodes_with_risk: 0,
        nodes_with_changes_today: 0,
        latest_archive_date: null,
        nodes: props.nodes.map(n => ({
          uuid: n.uuid,
          name: n.name,
          status: 'not_installed',
          latest_date: null,
          has_ipv4: false,
          has_ipv6: false,
          highest_risk: { category: 'Unknown', source: 'None' },
          media_summary: {},
          ai_summary: {},
          changes_today: 0,
        })),
      }
    }
  }
  catch (err) {
    console.warn('[IPQA] Failed to load IPQA overview:', err)
    isPluginAvailable.value = false
  }
  finally {
    loading.value = false
  }
}

const appStore = useAppStore()

onMounted(() => {
  void loadData()
})

const hasIpqaData = computed(() => {
  return overview.value && overview.value.ipqa_nodes > 0
})
</script>

<template>
  <div
    v-if="appStore.enableIpqaOverview"
    class="bg-white/80 dark:bg-neutral-900/80 backdrop-blur border border-neutral-200/80 dark:border-neutral-800/80 rounded-2xl p-5 shadow-xs space-y-5"
  >
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
          <Icon icon="lucide:shield-check" class="w-5 h-5" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h3 class="font-semibold text-neutral-800 dark:text-neutral-100">
              IP 质量与归档概览
            </h3>
            <span class="text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300">
              IPQA
            </span>
          </div>
          <p class="text-xs text-neutral-400 dark:text-neutral-500">
            涵盖多维度风险评分、流媒体/AI 解锁矩阵、邮件信誉及每日归档差异追踪
          </p>
        </div>
      </div>

      <button
        class="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        title="刷新 IPQA 数据"
        :disabled="loading"
        @click="loadData"
      >
        <Icon
          icon="lucide:refresh-cw"
          class="w-4 h-4"
          :class="{ 'animate-spin': loading }"
        />
      </button>
    </div>

    <!-- 1. Fleet Summary Strip -->
    <IpqaFleetSummary v-if="overview && isPluginAvailable !== false" :overview="overview" />

    <!-- Notice if plugin is not detected -->
    <div
      v-if="isPluginAvailable === false"
      class="py-8 px-4 rounded-xl bg-neutral-50/50 dark:bg-neutral-800/20 border border-dashed border-neutral-200 dark:border-neutral-800 text-center"
    >
      <div class="p-3 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 w-fit mx-auto mb-3">
        <Icon icon="lucide:plug-zap" class="w-8 h-8" />
      </div>
      <div class="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
        未检测到 IPQA Alert Report 插件
      </div>
      <p class="text-[11px] text-neutral-400 dark:text-neutral-500 max-w-md mx-auto mb-3">
        安装插件后可启用 IPQA 概览、风险矩阵与节点历史档案。
      </p>
      <a
        href="https://github.com/Chen017/komari-plugin-ipqa-alert-report"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-medium transition-colors"
      >
        <Icon icon="lucide:external-link" class="w-3.5 h-3.5" />
        <span>查看安装说明</span>
      </a>
    </div>

    <!-- Notice if plugin is installed but has no data yet -->
    <div
      v-else-if="!hasIpqaData"
      class="py-6 px-4 rounded-xl bg-neutral-50/50 dark:bg-neutral-800/20 border border-dashed border-neutral-200 dark:border-neutral-800 text-center"
    >
      <Icon icon="lucide:database" class="w-8 h-8 mx-auto mb-2 text-indigo-400/60" />
      <div class="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
        暂无节点 IPQA 归档数据
      </div>
      <p class="text-[11px] text-neutral-400 dark:text-neutral-500 max-w-md mx-auto">
        请确保在已安装 IP-Quality-Archive 的节点上运行检测，并由 komari-plugin-ipqa-alert-report 每日定时同步。
      </p>
    </div>

    <!-- 2. Node Grid -->
    <IpqaNodeGrid v-if="isPluginAvailable !== false && overview && overview.nodes.length > 0" :nodes="overview.nodes" />

    <!-- 3. Risk & Media Matrices -->
    <div
      v-if="hasIpqaData && overview && (appStore.ipqaShowRiskMatrix || appStore.ipqaShowMediaMatrix)"
      class="grid grid-cols-1 lg:grid-cols-2 gap-4"
    >
      <IpqaRiskMatrix v-if="appStore.ipqaShowRiskMatrix" :nodes="overview.nodes" />
      <IpqaMediaMatrix v-if="appStore.ipqaShowMediaMatrix" :nodes="overview.nodes" />
    </div>

    <!-- 4. Recent Changes Timeline -->
    <RecentIpqaChanges v-if="hasIpqaData && appStore.ipqaShowChanges" :changes="recentChanges" />
  </div>
</template>
