<script setup lang="ts">
import type { IpqaNormalizedReport, RiskCategory } from '../types'
import { Icon } from '@iconify/vue'
import { getRiskColor, getRiskLabel } from '../formatters'

const props = defineProps<{
  report: IpqaNormalizedReport
}>()

function evaluateEngineRisk(engine: string, val: unknown): { category: RiskCategory, label: string } {
  if (val === null || val === undefined) return { category: 'Unknown', label: '--' }

  const str = String(val).trim()
  const num = Number(val)

  if (engine === 'IPQS') {
    if (num >= 85) return { category: 'Critical', label: `${num} (极高)` }
    if (num >= 75) return { category: 'High', label: `${num} (高)` }
    if (num >= 50) return { category: 'Medium', label: `${num} (中等)` }
    return { category: 'Low', label: `${num} (低)` }
  }

  if (engine === 'SCAMALYTICS') {
    if (num >= 75) return { category: 'High', label: `${num} (高)` }
    if (num >= 25) return { category: 'Medium', label: `${num} (中等)` }
    return { category: 'Low', label: `${num} (低)` }
  }

  if (engine === 'AbuseIPDB') {
    if (num >= 50) return { category: 'High', label: `${num}% (高)` }
    if (num >= 20) return { category: 'Medium', label: `${num}% (中等)` }
    return { category: 'Low', label: `${num}% (低)` }
  }

  if (engine === 'IP2LOCATION') {
    const upper = str.toUpperCase()
    if (upper.includes('VERY HIGH')) return { category: 'Critical', label: str }
    if (upper.includes('HIGH')) return { category: 'High', label: str }
    if (upper.includes('MEDIUM')) return { category: 'Medium', label: str }
    return { category: 'Low', label: str }
  }

  return { category: 'Low', label: str }
}
</script>

<template>
  <div class="space-y-4">
    <div class="p-4 rounded-xl bg-white/80 dark:bg-neutral-900/80 border border-neutral-200/80 dark:border-neutral-800/80 shadow-xs">
      <div class="flex items-center gap-2 mb-3">
        <Icon icon="lucide:shield-alert" class="w-4 h-4 text-orange-500" />
        <h4 class="font-semibold text-xs text-neutral-800 dark:text-neutral-200">
          多引擎风控评分体系 (Risk Scores)
        </h4>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        <div
          v-for="(scoreVal, engine) in report.scores"
          :key="engine"
          class="p-3 rounded-xl border flex flex-col justify-between"
          :class="[
            getRiskColor(evaluateEngineRisk(String(engine), scoreVal).category).bg,
            getRiskColor(evaluateEngineRisk(String(engine), scoreVal).category).border,
          ]"
        >
          <div class="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-1">
            {{ engine }}
          </div>
          <div>
            <div class="text-base font-bold text-neutral-800 dark:text-neutral-100">
              {{ evaluateEngineRisk(String(engine), scoreVal).label }}
            </div>
            <div
              class="text-[10px] font-medium mt-0.5"
              :class="getRiskColor(evaluateEngineRisk(String(engine), scoreVal).category).text"
            >
              {{ getRiskLabel(evaluateEngineRisk(String(engine), scoreVal).category) }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
