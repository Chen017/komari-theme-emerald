<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
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
  modelValue: string
  nodes: readonly NodeData[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const selectedNode = computed(() => {
  if (props.modelValue === 'all')
    return null
  return props.nodes.find(n => n.uuid === props.modelValue) ?? null
})

function handleValueChange(val: any) {
  if (val !== undefined && val !== null) {
    emit('update:modelValue', String(val))
  }
}
</script>

<template>
  <SelectRoot :model-value="props.modelValue" @update:model-value="handleValueChange">
    <SelectTrigger
      class="group inline-flex h-8 min-w-[150px] max-w-[220px] items-center justify-between gap-2 rounded-md border border-border/60 bg-background/80 px-2.5 text-xs font-medium text-foreground shadow-xs transition-colors hover:border-emerald-500/60 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/25 data-[state=open]:border-emerald-500 data-[state=open]:ring-2 data-[state=open]:ring-emerald-500/15"
      aria-label="选择节点"
    >
      <div class="flex items-center gap-2 min-w-0 truncate">
        <template v-if="selectedNode">
          <span
            class="size-2 shrink-0 rounded-full"
            :class="selectedNode.online ? 'bg-emerald-600 dark:bg-emerald-500' : 'bg-red-600 dark:bg-red-500'"
          />
          <span class="truncate max-w-[150px]">{{ selectedNode.name }}</span>
        </template>
        <template v-else>
          <Icon icon="lucide:layers-3" class="size-3.5 text-muted-foreground shrink-0" />
          <span class="truncate">全部节点汇总</span>
        </template>
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
        class="z-50 min-w-[170px] max-w-[260px] overflow-hidden rounded-lg border border-border/70 bg-popover/95 p-1 text-foreground shadow-lg backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2"
      >
        <SelectViewport class="p-0.5 max-h-64 overflow-y-auto w-full">
          <!-- All nodes option -->
          <SelectItem
            value="all"
            class="relative flex h-8 w-full cursor-pointer select-none items-center justify-between rounded-md px-2 text-xs outline-none transition-colors data-[highlighted]:bg-emerald-500/10 data-[highlighted]:text-emerald-700 dark:data-[highlighted]:text-emerald-300 data-[state=checked]:font-medium text-foreground"
          >
            <div class="flex items-center gap-2 min-w-0">
              <Icon icon="lucide:layers-3" class="size-3.5 text-muted-foreground shrink-0" />
              <SelectItemText class="truncate">
                全部节点汇总
              </SelectItemText>
            </div>
            <SelectItemIndicator>
              <Icon icon="lucide:check" class="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 ml-2" />
            </SelectItemIndicator>
          </SelectItem>

          <!-- Per-node options -->
          <SelectItem
            v-for="node in nodes"
            :key="node.uuid"
            :value="node.uuid"
            class="relative flex h-8 w-full cursor-pointer select-none items-center justify-between rounded-md px-2 text-xs outline-none transition-colors data-[highlighted]:bg-emerald-500/10 data-[highlighted]:text-emerald-700 dark:data-[highlighted]:text-emerald-300 data-[state=checked]:font-medium text-foreground"
          >
            <div class="flex items-center gap-2 min-w-0">
              <span
                class="size-2 shrink-0 rounded-full"
                :class="node.online ? 'bg-emerald-600 dark:bg-emerald-500' : 'bg-red-600 dark:bg-red-500'"
              />
              <SelectItemText class="truncate max-w-[150px]">
                {{ node.name }}
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
</template>
