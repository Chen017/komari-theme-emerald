<script setup lang="ts">
import type { NormalizedNodeCost, RenewalFilter } from '../types'
import { Icon } from '@iconify/vue'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { buildRenewalTimeline } from '../calculations'
import { formatCny } from '../services/fx'

const props = defineProps<{
  nodes: readonly NormalizedNodeCost[]
  loading?: boolean
}>()

const activeFilter = ref<RenewalFilter>('30d')

const filterOptions: Array<{ value: RenewalFilter, label: string }> = [
  { value: '30d', label: '30 天内' },
  { value: '90d', label: '90 天内' },
  { value: 'expired', label: '已过期' },
  { value: 'no_expiry', label: '未设置到期' },
  { value: 'all', label: '全部' },
]

const timelineItems = computed(() => buildRenewalTimeline(props.nodes, activeFilter.value))

function getStatusStyle(status: string) {
  switch (status) {
    case 'expired':
    case 'critical':
      return {
        dot: 'bg-destructive ring-destructive/30',
        text: 'text-destructive',
        badge: 'bg-destructive/10 text-destructive border-destructive/20',
        icon: 'lucide:alert-circle',
      }
    case 'warning':
      return {
        dot: 'bg-amber-500 ring-amber-500/30',
        text: 'text-amber-600 dark:text-amber-400',
        badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
        icon: 'lucide:clock',
      }
    case 'long_term':
      return {
        dot: 'bg-muted-foreground ring-muted-foreground/30',
        text: 'text-muted-foreground',
        badge: 'bg-muted text-muted-foreground border-border/50',
        icon: 'lucide:infinity',
      }
    case 'no_expiry':
      return {
        dot: 'bg-muted-foreground/40 ring-muted-foreground/20',
        text: 'text-muted-foreground',
        badge: 'bg-muted/60 text-muted-foreground border-border/40',
        icon: 'lucide:help-circle',
      }
    default:
      return {
        dot: 'bg-emerald-600 ring-emerald-500/30',
        text: 'text-emerald-700 dark:text-emerald-300',
        badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
        icon: 'lucide:calendar-check',
      }
  }
}
</script>

<template>
  <div class="rounded-lg border border-border/70 bg-card/60 p-4 shadow-xs">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-2">
        <Icon icon="lucide:calendar-clock" class="size-4 text-emerald-600 dark:text-emerald-400" />
        <h2 class="text-sm font-semibold text-foreground">
          续费时间线
        </h2>
        <span class="text-xs text-muted-foreground">({{ timelineItems.length }})</span>
      </div>

      <!-- Filter buttons -->
      <div class="flex flex-wrap items-center gap-1 rounded-md bg-muted/60 p-0.5">
        <button
          v-for="opt in filterOptions"
          :key="opt.value"
          type="button"
          class="rounded px-2 py-1 text-xs font-medium transition-colors"
          :class="activeFilter === opt.value
            ? 'bg-background text-emerald-700 dark:text-emerald-300 shadow-xs'
            : 'text-muted-foreground hover:text-foreground'"
          @click="activeFilter = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <!-- Timeline list -->
    <div class="mt-4">
      <div v-if="loading" class="space-y-3 py-4">
        <div v-for="i in 3" :key="i" class="h-12 animate-pulse rounded bg-muted/50" />
      </div>

      <div
        v-else-if="timelineItems.length === 0"
        class="flex flex-col items-center justify-center py-10 text-center text-xs text-muted-foreground"
      >
        <Icon icon="lucide:calendar-check-2" class="mb-2 size-8 opacity-40" />
        <p>当前筛选条件下无续费节点</p>
      </div>

      <div v-else class="relative space-y-2">
        <div
          v-for="item in timelineItems"
          :key="item.uuid"
          class="group flex flex-col justify-between gap-2 rounded-md border border-border/40 bg-background/50 p-3 transition-colors hover:border-emerald-500/40 sm:flex-row sm:items-center"
        >
          <div class="flex items-center gap-3 min-w-0">
            <span
              class="size-2 shrink-0 rounded-full ring-2"
              :class="getStatusStyle(item.status).dot"
            />
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <RouterLink
                  :to="{ name: 'instance-detail', params: { id: item.uuid } }"
                  class="truncate text-sm font-medium text-foreground transition-colors hover:text-emerald-600 dark:hover:text-emerald-400"
                >
                  {{ item.name }}
                </RouterLink>
                <span
                  class="inline-flex items-center rounded border px-1.5 py-0.2 text-[10px] font-medium"
                  :class="getStatusStyle(item.status).badge"
                >
                  {{ item.statusLabel }}
                </span>
                <span class="text-[10px] text-muted-foreground">
                  {{ item.renewalLabel }}
                </span>
              </div>
              <div class="mt-0.5 text-[11px] text-muted-foreground">
                <span>到期日: {{ item.date }}</span>
                <span class="mx-1.5">·</span>
                <span :class="getStatusStyle(item.status).text">{{ item.timingLabel }}</span>
              </div>
            </div>
          </div>

          <div class="flex shrink-0 items-center justify-end gap-3 text-right">
            <div>
              <div class="text-sm font-semibold tabular-nums text-foreground">
                <template v-if="item.renewalAmountCny !== null">
                  {{ formatCny(item.renewalAmountCny) }}
                </template>
                <template v-else>
                  --
                </template>
              </div>
              <div v-if="item.originalAmount && item.originalCurrency" class="text-[10px] text-muted-foreground tabular-nums">
                {{ item.originalCurrency }} {{ item.originalAmount }} / 期
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
