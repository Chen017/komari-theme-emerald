<script setup lang="ts">
import { Icon } from '@iconify/vue'
import {
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectViewport,
} from 'reka-ui'

const props = defineProps<{
  dates: string[]
  currentDate: string
  hasV4: boolean
  hasV6: boolean
  activeIpVersion: 'IPv4' | 'IPv6'
}>()

const emit = defineEmits<{
  (e: 'update:date', date: string): void
  (e: 'update:ipVersion', version: 'IPv4' | 'IPv6'): void
}>()

function handleDateChange(val: any) {
  if (val !== undefined && val !== null) {
    emit('update:date', String(val))
  }
}
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-card/80 backdrop-blur border border-border/70 shadow-xs">
    <!-- Date selector -->
    <div class="flex items-center gap-2">
      <div class="p-1.5 rounded-lg bg-muted text-muted-foreground">
        <Icon icon="lucide:calendar" class="w-4 h-4" />
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs text-muted-foreground">检测存档日期:</span>
        <SelectRoot :model-value="props.currentDate" @update:model-value="handleDateChange">
          <SelectTrigger
            class="group inline-flex h-8 min-w-[150px] items-center justify-between gap-2 rounded-md border border-border/60 bg-background/80 px-2.5 text-xs font-medium text-foreground shadow-xs transition-colors hover:border-emerald-500/60 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/25 data-[state=open]:border-emerald-500 data-[state=open]:ring-2 data-[state=open]:ring-emerald-500/15 cursor-pointer"
            aria-label="选择检测存档日期"
          >
            <div class="flex items-center gap-1.5 min-w-0 truncate">
              <span class="truncate">{{ props.currentDate }} {{ props.currentDate === props.dates[0] ? '(最新)' : '' }}</span>
            </div>
            <SelectIcon as-child>
              <Icon
                icon="lucide:chevron-down"
                class="size-3.5 text-muted-foreground shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180"
              />
            </SelectIcon>
          </SelectTrigger>

          <SelectPortal>
            <SelectContent
              position="popper"
              :side-offset="6"
              class="z-50 min-w-[160px] max-w-[240px] overflow-hidden rounded-lg border border-border/70 bg-popover/95 p-1 text-foreground shadow-lg backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2"
            >
              <SelectViewport class="p-0.5 max-h-64 overflow-y-auto w-full">
                <SelectItem
                  v-for="d in dates"
                  :key="d"
                  :value="d"
                  class="relative flex h-8 w-full cursor-pointer select-none items-center justify-between rounded-md px-2 text-xs outline-none transition-colors data-[highlighted]:bg-emerald-500/10 data-[highlighted]:text-emerald-700 dark:data-[highlighted]:text-emerald-300 data-[state=checked]:font-medium text-foreground"
                >
                  <div class="flex items-center gap-1.5 min-w-0">
                    <SelectItemText class="truncate">
                      {{ d }} {{ d === dates[0] ? '(最新)' : '' }}
                    </SelectItemText>
                  </div>
                  <SelectItemIndicator>
                    <Icon icon="lucide:check" class="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 ml-2" />
                  </SelectItemIndicator>
                </SelectItem>
              </SelectViewport>
            </SelectContent>
          </SelectPortal>
        </SelectRoot>
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
