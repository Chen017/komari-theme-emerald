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

    <div v-else class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
      <!-- Risk Category -->
      <div class="p-2 rounded-sm bg-slate-500/5">
        <div class="text-[11px] text-muted-foreground mb-1">
          综合风控评级
        </div>
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

      <!-- IP Version -->
      <div class="p-2 rounded-sm bg-slate-500/5">
        <div class="text-[11px] text-muted-foreground mb-1">
          归档协议
        </div>
        <div class="flex items-center gap-1 font-mono">
          <span
            class="px-1.5 py-0.2 rounded text-[11px]"
            :class="latestReport.summary.hasV4 ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 font-bold' : 'text-neutral-400'"
          >
            IPv4
          </span>
          <span
            class="px-1.5 py-0.2 rounded text-[11px]"
            :class="latestReport.summary.hasV6 ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 font-bold' : 'text-neutral-400'"
          >
            IPv6
          </span>
        </div>
      </div>

      <!-- Media Unlocking -->
      <div class="p-2 rounded-sm bg-slate-500/5">
        <div class="text-[11px] text-muted-foreground mb-1">
          流媒体解锁
        </div>
        <div class="flex items-center gap-1.5 font-medium">
          <span
            v-if="latestReport.summary.mediaSummary.Netflix"
            class="text-[11px]"
            :class="latestReport.summary.mediaSummary.Netflix.unlocked ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'"
          >
            NF{{ latestReport.summary.mediaSummary.Netflix.region ? `[${latestReport.summary.mediaSummary.Netflix.region}]` : '' }}
          </span>
          <span
            v-if="latestReport.summary.mediaSummary.Youtube"
            class="text-[11px]"
            :class="latestReport.summary.mediaSummary.Youtube.unlocked ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'"
          >
            YT{{ latestReport.summary.mediaSummary.Youtube.region ? `[${latestReport.summary.mediaSummary.Youtube.region}]` : '' }}
          </span>
        </div>
      </div>

      <!-- AI Unlocking -->
      <div class="p-2 rounded-sm bg-slate-500/5">
        <div class="text-[11px] text-muted-foreground mb-1">
          AI 解锁
        </div>
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
