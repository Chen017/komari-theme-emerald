<script setup lang="ts">
import type { IpqaNormalizedReport } from '../types'
import { Icon } from '@iconify/vue'

defineProps<{
  report: IpqaNormalizedReport
}>()
</script>

<template>
  <div class="space-y-4">
    <!-- Main Identity Card -->
    <div class="p-4 rounded-xl bg-white/80 dark:bg-neutral-900/80 border border-neutral-200/80 dark:border-neutral-800/80 shadow-xs">
      <div class="flex items-center gap-2 mb-3">
        <Icon icon="lucide:network" class="w-4 h-4 text-emerald-500" />
        <h4 class="font-semibold text-xs text-neutral-800 dark:text-neutral-200">
          IP 身份与归属地信息
        </h4>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div class="p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800/60">
          <div class="text-[11px] text-neutral-400 dark:text-neutral-500 mb-0.5">IP 地址</div>
          <div class="font-mono font-semibold text-neutral-800 dark:text-neutral-100 truncate">
            {{ report.info.ip || '--' }}
          </div>
        </div>

        <div class="p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800/60">
          <div class="text-[11px] text-neutral-400 dark:text-neutral-500 mb-0.5">国家 / 地区</div>
          <div class="font-semibold text-neutral-800 dark:text-neutral-100 truncate">
            {{ report.info.country || '--' }} {{ report.info.region ? `· ${report.info.region}` : '' }}
          </div>
        </div>

        <div class="p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800/60">
          <div class="text-[11px] text-neutral-400 dark:text-neutral-500 mb-0.5">城市</div>
          <div class="font-semibold text-neutral-800 dark:text-neutral-100 truncate">
            {{ report.info.city || '--' }}
          </div>
        </div>

        <div class="p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800/60">
          <div class="text-[11px] text-neutral-400 dark:text-neutral-500 mb-0.5">原生 / 广播类型</div>
          <div class="font-semibold text-neutral-800 dark:text-neutral-100 truncate">
            <span
              class="px-1.5 py-0.5 rounded text-[11px] font-medium"
              :class="report.info.type?.includes('原生') ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'"
            >
              {{ report.info.type || '--' }}
            </span>
          </div>
        </div>

        <div class="p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800/60">
          <div class="text-[11px] text-neutral-400 dark:text-neutral-500 mb-0.5">ASN</div>
          <div class="font-mono font-medium text-neutral-800 dark:text-neutral-100 truncate">
            AS{{ report.info.asn || '--' }}
          </div>
        </div>

        <div class="p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800/60">
          <div class="text-[11px] text-neutral-400 dark:text-neutral-500 mb-0.5">ISP 运营商</div>
          <div class="font-medium text-neutral-800 dark:text-neutral-100 truncate" :title="String(report.info.isp)">
            {{ report.info.isp || '--' }}
          </div>
        </div>

        <div class="p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800/60 md:col-span-2">
          <div class="text-[11px] text-neutral-400 dark:text-neutral-500 mb-0.5">所属组织机构 (Organization)</div>
          <div class="font-medium text-neutral-800 dark:text-neutral-100 truncate" :title="String(report.info.organization)">
            {{ report.info.organization || '--' }}
          </div>
        </div>
      </div>
    </div>

    <!-- Usage and Company Classifications -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- Usage Classification -->
      <div class="p-4 rounded-xl bg-white/80 dark:bg-neutral-900/80 border border-neutral-200/80 dark:border-neutral-800/80 shadow-xs">
        <div class="flex items-center gap-2 mb-2.5">
          <Icon icon="lucide:tag" class="w-4 h-4 text-indigo-500" />
          <h4 class="font-semibold text-xs text-neutral-800 dark:text-neutral-200">
            各数据库使用类型判断 (Usage Type)
          </h4>
        </div>
        <div class="space-y-1.5 text-xs">
          <div
            v-for="(val, db) in report.type.usage"
            :key="db"
            class="flex items-center justify-between py-1 border-b border-neutral-100 dark:border-neutral-800/60 last:border-0"
          >
            <span class="text-neutral-400 dark:text-neutral-500">{{ db }}</span>
            <span class="font-medium text-neutral-800 dark:text-neutral-200">{{ val || '--' }}</span>
          </div>
          <div v-if="Object.keys(report.type.usage).length === 0" class="text-neutral-400 text-[11px] py-2">
            暂无使用类型分类数据
          </div>
        </div>
      </div>

      <!-- Company Classification -->
      <div class="p-4 rounded-xl bg-white/80 dark:bg-neutral-900/80 border border-neutral-200/80 dark:border-neutral-800/80 shadow-xs">
        <div class="flex items-center gap-2 mb-2.5">
          <Icon icon="lucide:building-2" class="w-4 h-4 text-blue-500" />
          <h4 class="font-semibold text-xs text-neutral-800 dark:text-neutral-200">
            各数据库公司/机构类型 (Company Type)
          </h4>
        </div>
        <div class="space-y-1.5 text-xs">
          <div
            v-for="(val, db) in report.type.company"
            :key="db"
            class="flex items-center justify-between py-1 border-b border-neutral-100 dark:border-neutral-800/60 last:border-0"
          >
            <span class="text-neutral-400 dark:text-neutral-500">{{ db }}</span>
            <span class="font-medium text-neutral-800 dark:text-neutral-200">{{ val || '--' }}</span>
          </div>
          <div v-if="Object.keys(report.type.company).length === 0" class="text-neutral-400 text-[11px] py-2">
            暂无公司类型分类数据
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
