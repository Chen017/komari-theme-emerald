<script setup lang="ts">
import type { NormalizedNodeCost } from '../types'
import { Icon } from '@iconify/vue'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { formatCny } from '../services/fx'

const props = defineProps<{
  nodes: readonly NormalizedNodeCost[]
  loading?: boolean
}>()

const searchQuery = ref('')

const filteredNodes = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query)
    return props.nodes

  return props.nodes.filter(node =>
    node.name.toLowerCase().includes(query)
    || (node.originalCurrency && node.originalCurrency.toLowerCase().includes(query))
    || node.billingCycleLabel.toLowerCase().includes(query),
  )
})
</script>

<template>
  <div class="rounded-lg border border-border/70 bg-card/60 p-4 shadow-xs">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-2">
        <Icon icon="lucide:table-properties" class="size-4 text-emerald-600 dark:text-emerald-400" />
        <h2 class="text-sm font-semibold text-foreground">
          节点成本明细
        </h2>
        <span class="text-xs text-muted-foreground">({{ filteredNodes.length }} 台)</span>
      </div>

      <div class="relative w-full sm:w-64">
        <Icon
          icon="lucide:search"
          class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索节点名称、周期..."
          class="h-8 w-full rounded-md border border-border/60 bg-background/80 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
      </div>
    </div>

    <div class="mt-4 overflow-x-auto">
      <table class="w-full text-left text-xs">
        <thead class="border-b border-border/60 text-muted-foreground">
          <tr>
            <th class="py-2.5 pl-2 font-medium">
              节点名称
            </th>
            <th class="py-2.5 px-3 font-medium">
              原始资费与周期
            </th>
            <th class="py-2.5 px-3 font-medium text-right">
              月均折算 (CNY)
            </th>
            <th class="py-2.5 px-3 font-medium text-right">
              年化预算 (CNY)
            </th>
            <th class="py-2.5 px-3 font-medium">
              到期时间
            </th>
            <th class="py-2.5 pr-2 font-medium text-right">
              续费方式
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border/30">
          <tr v-if="loading">
            <td colspan="6" class="py-8 text-center text-muted-foreground">
              <div class="flex items-center justify-center gap-2">
                <Icon icon="lucide:loader-2" class="size-4 animate-spin text-emerald-600" />
                <span>正在计算成本明细...</span>
              </div>
            </td>
          </tr>

          <tr v-else-if="filteredNodes.length === 0">
            <td colspan="6" class="py-8 text-center text-muted-foreground">
              未找到匹配的节点
            </td>
          </tr>

          <tr
            v-for="node in filteredNodes"
            v-else
            :key="node.uuid"
            class="transition-colors hover:bg-muted/30"
          >
            <!-- 节点名称 -->
            <td class="py-2.5 pl-2 font-medium">
              <RouterLink
                :to="{ name: 'instance-detail', params: { id: node.uuid } }"
                class="text-foreground transition-colors hover:text-emerald-600 dark:hover:text-emerald-400"
              >
                {{ node.name }}
              </RouterLink>
              <span v-if="node.isFree" class="ml-1.5 inline-block rounded bg-emerald-500/10 px-1 py-0.2 text-[10px] text-emerald-600 dark:text-emerald-400">
                免费
              </span>
            </td>

            <!-- 原始资费与周期 -->
            <td class="py-2.5 px-3 text-muted-foreground tabular-nums">
              <template v-if="node.isFree">
                免费节点
              </template>
              <template v-else-if="node.originalAmount !== null">
                {{ node.originalCurrency || 'CNY' }} {{ node.originalAmount }} / {{ node.billingCycleLabel }}
              </template>
              <template v-else>
                未设置价格
              </template>
            </td>

            <!-- 月均折算 -->
            <td class="py-2.5 px-3 text-right font-medium tabular-nums text-foreground">
              {{ formatCny(node.monthlyCny) }}
            </td>

            <!-- 年化预算 -->
            <td class="py-2.5 px-3 text-right tabular-nums text-muted-foreground">
              {{ formatCny(node.annualizedCny) }}
            </td>

            <!-- 到期时间 -->
            <td class="py-2.5 px-3 text-muted-foreground tabular-nums">
              <template v-if="node.expiryAt">
                <span :class="node.daysUntilExpiry !== null && node.daysUntilExpiry <= 7 ? 'text-destructive font-medium' : ''">
                  {{ node.expiryAt.slice(0, 10) }}
                </span>
                <span v-if="node.daysUntilExpiry !== null" class="ml-1 text-[10px]">
                  ({{ node.daysUntilExpiry >= 0 ? `${node.daysUntilExpiry} 天后` : `已过期 ${Math.abs(node.daysUntilExpiry)} 天` }})
                </span>
              </template>
              <template v-else>
                --
              </template>
            </td>

            <!-- 续费方式 -->
            <td class="py-2.5 pr-2 text-right text-muted-foreground">
              <span
                class="inline-block rounded px-1.5 py-0.5 text-[10px]"
                :class="node.autoRenewal
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'bg-muted text-muted-foreground'"
              >
                {{ node.autoRenewal ? '自动续费' : '手动续费' }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
