<script setup lang="ts">
import type { IpqaNormalizedReport } from '../types'
import { Icon } from '@iconify/vue'
import { computed } from 'vue'

const props = defineProps<{
  report: IpqaNormalizedReport
}>()

const dnsbl = computed(() => {
  const mail = props.report.mail as any
  return mail?.DNSBlacklist || mail?.dnsblacklist || null
})

const blacklistedCount = computed(() => {
  if (!dnsbl.value) return 0
  const cnt = Number(dnsbl.value.Blacklisted ?? dnsbl.value.blacklisted ?? 0)
  return Number.isFinite(cnt) ? cnt : 0
})

const totalDnsbl = computed(() => {
  if (!dnsbl.value) return 0
  const cnt = Number(dnsbl.value.Count ?? dnsbl.value.count ?? 0)
  return Number.isFinite(cnt) ? cnt : 0
})
</script>

<template>
  <div class="space-y-4">
    <div class="p-4 rounded-xl bg-white/80 dark:bg-neutral-900/80 border border-neutral-200/80 dark:border-neutral-800/80 shadow-xs">
      <div class="flex items-center gap-2 mb-3">
        <Icon icon="lucide:mail" class="w-4 h-4 text-blue-500" />
        <h4 class="font-semibold text-xs text-neutral-800 dark:text-neutral-200">
          邮件服务信誉与 DNS 黑名单 (DNSBL)
        </h4>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs mb-4">
        <!-- Blacklist Counter -->
        <div class="p-3 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800/60">
          <div class="text-[11px] text-neutral-400 dark:text-neutral-500 mb-1">
            DNS 黑名单拦截数
          </div>
          <div
            class="text-xl font-bold"
            :class="blacklistedCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'"
          >
            {{ blacklistedCount }} <span class="text-xs font-normal text-neutral-400">/ {{ totalDnsbl || '--' }} 项数据库</span>
          </div>
          <div class="text-[10px] text-neutral-400 mt-0.5">
            {{ blacklistedCount === 0 ? 'IP 信誉良好，未被列入黑名单' : '已被部分反垃圾邮件数据库列入' }}
          </div>
        </div>

        <!-- Mail Ports if tested -->
        <div class="p-3 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800/60">
          <div class="text-[11px] text-neutral-400 dark:text-neutral-500 mb-1">
            端口连通性 (Port 25 / 587)
          </div>
          <div class="text-sm font-semibold text-neutral-800 dark:text-neutral-200 mt-1">
            {{ (report.mail as any)?.Port25 || (report.mail as any)?.port25 || '未测试 / 默认' }}
          </div>
          <div class="text-[10px] text-neutral-400 mt-0.5">
            出站发信端口检测
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
