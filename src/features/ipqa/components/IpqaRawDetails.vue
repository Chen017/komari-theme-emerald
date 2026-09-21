<script setup lang="ts">
import type { IpqaNormalizedReport } from '../types'
import { Icon } from '@iconify/vue'
import { computed, ref } from 'vue'

const props = defineProps<{
  report: IpqaNormalizedReport
}>()

const copied = ref(false)

const formattedJson = computed(() => {
  return JSON.stringify(props.report, null, 2)
})

async function copyJson() {
  try {
    await navigator.clipboard.writeText(formattedJson.value)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  }
  catch {
    // ignore
  }
}
</script>

<template>
  <div class="p-4 rounded-xl bg-white/80 dark:bg-neutral-900/80 border border-neutral-200/80 dark:border-neutral-800/80 shadow-xs">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2">
        <Icon icon="lucide:code-2" class="w-4 h-4 text-emerald-500" />
        <h4 class="font-semibold text-xs text-neutral-800 dark:text-neutral-200">
          原始归档 JSON 数据 (Schema v{{ report.schemaVersion }})
        </h4>
      </div>

      <button
        type="button"
        class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
        @click="copyJson"
      >
        <Icon :icon="copied ? 'lucide:check' : 'lucide:copy'" class="w-3.5 h-3.5" :class="{ 'text-emerald-500': copied }" />
        <span>{{ copied ? '已复制' : '复制 JSON' }}</span>
      </button>
    </div>

    <pre class="p-3.5 rounded-xl bg-neutral-900 text-neutral-200 text-xs font-mono overflow-x-auto max-h-[500px] leading-relaxed select-all">{{ formattedJson }}</pre>
  </div>
</template>
