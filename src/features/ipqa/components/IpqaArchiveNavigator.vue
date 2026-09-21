<script setup lang="ts">
import { Icon } from '@iconify/vue'

defineProps<{
  dates: string[]
  currentDate: string
  hasV4: boolean
  hasV6: boolean
  activeIpVersion: 'IPv4' | 'IPv6'
}>()

defineEmits<{
  (e: 'update:date', date: string): void
  (e: 'update:ipVersion', version: 'IPv4' | 'IPv6'): void
}>()
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-white/80 dark:bg-neutral-900/80 backdrop-blur border border-neutral-200/80 dark:border-neutral-800/80 shadow-xs">
    <!-- Date selector -->
    <div class="flex items-center gap-2">
      <div class="p-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400">
        <Icon icon="lucide:calendar" class="w-4 h-4" />
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs text-neutral-500 dark:text-neutral-400">检测存档日期:</span>
        <select
          :value="currentDate"
          class="text-xs font-medium rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 px-2.5 py-1 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 cursor-pointer"
          @change="$emit('update:date', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="d in dates" :key="d" :value="d">
            {{ d }} {{ d === dates[0] ? '(最新)' : '' }}
          </option>
        </select>
      </div>
    </div>

    <!-- IPv4 / IPv6 Switch -->
    <div class="flex items-center gap-1 p-1 bg-neutral-100 dark:bg-neutral-800/80 rounded-xl">
      <button
        type="button"
        class="px-3 py-1 rounded-lg text-xs font-medium transition-all"
        :class="activeIpVersion === 'IPv4' ? 'bg-white dark:bg-neutral-700 text-neutral-800 dark:text-neutral-100 shadow-xs' : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'"
        :disabled="!hasV4"
        @click="$emit('update:ipVersion', 'IPv4')"
      >
        <span>IPv4</span>
        <span v-if="!hasV4" class="ml-1 text-[10px] opacity-60">(无)</span>
      </button>
      <button
        type="button"
        class="px-3 py-1 rounded-lg text-xs font-medium transition-all"
        :class="activeIpVersion === 'IPv6' ? 'bg-white dark:bg-neutral-700 text-neutral-800 dark:text-neutral-100 shadow-xs' : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'"
        :disabled="!hasV6"
        @click="$emit('update:ipVersion', 'IPv6')"
      >
        <span>IPv6</span>
        <span v-if="!hasV6" class="ml-1 text-[10px] opacity-60">(无)</span>
      </button>
    </div>
  </div>
</template>
