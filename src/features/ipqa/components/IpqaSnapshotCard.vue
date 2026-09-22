<script setup lang="ts">
import type { IpqaDailyPairedReport } from '../types'
import { Icon } from '@iconify/vue'
import { onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { CardX } from '@/components/ui/card-x'
import { useBackgroundSurface } from '@/composables/useBackgroundSurface'
import { getRiskColor, getRiskLabel } from '../formatters'
import { fetchNodeLatest } from '../services/api'

const props = defineProps<{
  uuid: string
}>()

const { pickSurfaceClass } = useBackgroundSurface()

const loading = ref(false)
const latestReport = ref<IpqaDailyPairedReport | null>(null)

async function loadSnapshot() {
  if (!props.uuid) return
  loading.value = true
  try {
    const report = await fetchNodeLatest(props.uuid)
    latestReport.value = report
  }
  catch {
    latestReport.value = null
  }
  finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadSnapshot()
})

watch(() => props.uuid, () => {
  void loadSnapshot()
})
function getMediaItem(media: Record<string, any> | undefined, ...names: string[]) {
  if (!media) return null
  for (const n of names) {
    const lower = n.toLowerCase()
    for (const [k, v] of Object.entries(media)) {
      if (k.toLowerCase() === lower || k.toLowerCase().includes(lower)) {
        const status = (v as any)?.status
        const unlocked = typeof status === 'string' && (status.includes('解锁') || status.includes('Yes') || status.includes('仅自制'))
        const region = (v as any)?.region
        return { unlocked, region }
      }
    }
  }
  return null
}
</script>

<template>
  <CardX
    title="IP 质量概况 (IPQA)"
    size="small"
    class="group border-none transition-all rounded-md"
    :class="pickSurfaceClass('bg-background/60 hover:bg-background', 'bg-background/50 hover:bg-background backdrop-blur-xs')"
  >
    <template #extra>
      <RouterLink
        :to="`/ip-quality/${uuid}`"
        class="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
      >
        <span>查看完整 IP 质量档案</span>
        <Icon icon="lucide:arrow-right" class="w-3.5 h-3.5" />
      </RouterLink>
    </template>

    <div v-if="loading" class="py-4 text-center text-xs text-muted-foreground">
      <Icon icon="lucide:loader-2" class="w-4 h-4 animate-spin mx-auto mb-1 text-emerald-500" />
      <span>加载 IPQA 快照...</span>
    </div>

    <div v-else-if="!latestReport" class="py-3 px-2 flex items-center justify-between text-xs text-muted-foreground">
      <div class="flex items-center gap-2">
        <Icon icon="lucide:shield" class="w-4 h-4 opacity-50" />
        <span>该节点暂无 IPQA 归档记录</span>
      </div>
      <RouterLink
        :to="`/ip-quality/${uuid}`"
        class="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline"
      >
        前往档案页 →
      </RouterLink>
    </div>

    <div
      v-else
      class="rounded-sm bg-slate-500/5 p-2.5 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs"
    >
      <!-- Risk Category -->
      <div class="inline-flex items-center gap-2">
        <span class="text-muted-foreground shrink-0">综合风控评级：</span>
        <div
          class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border"
          :class="[
            getRiskColor(latestReport.summary.highestRiskCategory).bg,
            getRiskColor(latestReport.summary.highestRiskCategory).text,
            getRiskColor(latestReport.summary.highestRiskCategory).border,
          ]"
        >
          <span class="w-1.5 h-1.5 rounded-full" :class="getRiskColor(latestReport.summary.highestRiskCategory).dot" />
          <span>{{ getRiskLabel(latestReport.summary.highestRiskCategory) }}</span>
        </div>
      </div>

      <!-- Media Unlocking with v4 & v6 in ONE row -->
      <div class="inline-flex items-center gap-2 flex-wrap min-w-0">
        <span class="text-muted-foreground shrink-0">流媒体解锁：</span>
        <div class="inline-flex items-center gap-4 flex-wrap text-[11px]">
          <!-- v4 -->
          <div v-if="latestReport.v4" class="inline-flex items-center gap-1.5 flex-wrap">
            <span class="font-mono text-[10px] px-1 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 font-semibold">v4</span>
            <template v-for="s in [
              { name: 'YouTube', keys: ['YouTube', 'Youtube', 'youtube'] },
              { name: 'TikTok', keys: ['TikTok', 'tiktok'] },
              { name: 'Reddit', keys: ['Reddit', 'reddit'] },
            ]" :key="s.name">
              <span
                v-if="getMediaItem(latestReport.v4?.media, ...s.keys)"
                class="font-medium"
                :class="getMediaItem(latestReport.v4?.media, ...s.keys)?.unlocked ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'"
              >
                {{ s.name }}{{ getMediaItem(latestReport.v4?.media, ...s.keys)?.region ? `[${getMediaItem(latestReport.v4?.media, ...s.keys)?.region}]` : '' }}
              </span>
            </template>
          </div>

          <!-- v6 -->
          <div v-if="latestReport.v6" class="inline-flex items-center gap-1.5 flex-wrap">
            <span class="font-mono text-[10px] px-1 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 font-semibold">v6</span>
            <template v-for="s in [
              { name: 'YouTube', keys: ['YouTube', 'Youtube', 'youtube'] },
              { name: 'TikTok', keys: ['TikTok', 'tiktok'] },
              { name: 'Reddit', keys: ['Reddit', 'reddit'] },
            ]" :key="s.name">
              <span
                v-if="getMediaItem(latestReport.v6?.media, ...s.keys)"
                class="font-medium"
                :class="getMediaItem(latestReport.v6?.media, ...s.keys)?.unlocked ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'"
              >
                {{ s.name }}{{ getMediaItem(latestReport.v6?.media, ...s.keys)?.region ? `[${getMediaItem(latestReport.v6?.media, ...s.keys)?.region}]` : '' }}
              </span>
            </template>
          </div>

          <div v-if="!latestReport.v4 && !latestReport.v6" class="text-muted-foreground">--</div>
        </div>
      </div>

      <!-- AI Unlocking -->
      <div class="inline-flex items-center gap-2 shrink-0">
        <span class="text-muted-foreground shrink-0">AI 解锁：</span>
        <div class="font-medium text-[11px]">
          <span
            v-if="latestReport.summary.aiSummary.ChatGPT"
            :class="latestReport.summary.aiSummary.ChatGPT.unlocked ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'"
          >
            ChatGPT {{ latestReport.summary.aiSummary.ChatGPT.unlocked ? '已解锁' : '未解锁' }}
          </span>
          <span v-else class="text-muted-foreground">--</span>
        </div>
      </div>
    </div>
  </CardX>
</template>
