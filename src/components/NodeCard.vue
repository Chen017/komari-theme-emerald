<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { NButton, NCard, NEllipsis, NIcon, NModal, NProgress, NTag, NText, NTooltip } from 'naive-ui'
import { computed, ref } from 'vue'
import PingChart from '@/components/PingChart.vue'
import { formatBytes, formatBytesPerSecond, formatUptime, getStatus } from '@/utils/helper'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getRegionCode, getRegionDisplayName } from '@/utils/regionHelper'

const props = defineProps<{
  node: NodeData
}>()

const emit = defineEmits<{
  click: []
}>()

// 延迟图表弹窗状态
const showPingChart = ref(false)

// 计算统计信息
const cpuStatus = computed(() => getStatus(props.node.cpu ?? 0))
const memPercentage = computed(() => (props.node.ram ?? 0) / (props.node.mem_total || 1) * 100)
const memStatus = computed(() => getStatus(memPercentage.value))
const diskPercentage = computed(() => (props.node.disk ?? 0) / (props.node.disk_total || 1) * 100)
const diskStatus = computed(() => getStatus(diskPercentage.value))
</script>

<template>
  <div>
    <NCard
      hoverable
      :class="[
        'node-card min-w-72 w-full cursor-pointer transition-all duration-200',
        props.node.online ? 'hover:border-primary' : 'opacity-50 pointer-events-none',
      ]"
      @click="emit('click')"
    >
      <template #header>
        <div class="flex gap-2 items-center">
          <NIcon>
            <img :src="`/images/flags/${getRegionCode(props.node.region)}.svg`" :alt="getRegionDisplayName(props.node.region)">
          </NIcon>
          <NEllipsis class="text-lg font-bold m-0">
            {{ props.node.name }}
          </NEllipsis>
        </div>
      </template>
      <template #header-extra>
        <div class="flex gap-2 items-center">
          <NTooltip>
            <template #trigger>
              <NButton
                quaternary
                circle
                size="small"
                class="p-1.5!"
                @click.stop="showPingChart = true"
              >
                <template #icon>
                  <div class="i-icon-park-outline-area-map text-base" />
                </template>
              </NButton>
            </template>
            查看延迟图表
          </NTooltip>
          <NTag :type="props.node.online ? 'success' : 'error'">
            {{ props.node.online ? '在线' : '离线' }}
          </NTag>
        </div>
      </template>
      <template #default>
        <div class="flex flex-col gap-3">
          <!-- 操作系统 -->
          <div class="flex-between">
            <NText :depth="3" class="">
              操作系统
            </NText>
            <div class="flex gap-2 items-center">
              <NIcon>
                <img :src="getOSImage(props.node.os)" :alt="getOSName(props.node.os)">
              </NIcon>
              <NText class="">
                {{ getOSName(props.node.os) }} / {{ props.node.arch }}
              </NText>
            </div>
          </div>

          <!-- CPU -->
          <div class="flex-col gap-1">
            <div class="flex-between">
              <NText :depth="3" class="">
                CPU
              </NText>
              <NText class="">
                {{ (props.node.cpu ?? 0).toFixed(1) }}%
              </NText>
            </div>
            <NProgress :show-indicator="false" :percentage="props.node.cpu ?? 0" :status="cpuStatus" />
          </div>

          <!-- 内存 -->
          <div class="flex-col gap-1">
            <div class="flex-between">
              <NText :depth="3" class="">
                内存
              </NText>
              <NText class="">
                {{ memPercentage.toFixed(1) }}%
              </NText>
            </div>
            <NProgress :show-indicator="false" :percentage="memPercentage" :status="memStatus" />
            <NText :depth="3" class="text-xs">
              {{ formatBytes(props.node.ram ?? 0) }} / {{ formatBytes(props.node.mem_total ?? 0) }}
            </NText>
          </div>

          <!-- 硬盘 -->
          <div class="flex-col gap-1">
            <div class="flex-between">
              <NText :depth="3" class="">
                硬盘
              </NText>
              <NText class="">
                {{ diskPercentage.toFixed(1) }}%
              </NText>
            </div>
            <NProgress :show-indicator="false" :percentage="diskPercentage" :status="diskStatus" />
            <NText :depth="3" class="text-xs">
              {{ formatBytes(props.node.disk ?? 0) }} / {{ formatBytes(props.node.disk_total ?? 0) }}
            </NText>
          </div>

          <!-- 总流量 -->
          <div class="flex-between">
            <NText :depth="3" class="">
              总流量
            </NText>
            <NText class="">
              ↑ {{ formatBytes(props.node.net_total_up ?? 0) }} ｜ ↓ {{ formatBytes(props.node.net_total_down ?? 0) }}
            </NText>
          </div>

          <!-- 网络速率 -->
          <div class="flex-between">
            <NText :depth="3" class="">
              网络速率
            </NText>
            <NText class="">
              ↑ {{ formatBytesPerSecond(props.node.net_out ?? 0) }} ｜ ↓ {{ formatBytesPerSecond(props.node.net_in ?? 0) }}
            </NText>
          </div>

          <!-- 运行时间 -->
          <div class="flex-between">
            <NText :depth="3" class="">
              运行时间
            </NText>
            <NText class="">
              {{ formatUptime(props.node.uptime ?? 0) }}
            </NText>
          </div>
        </div>
      </template>
    </NCard>

    <!-- 延迟图表弹窗 -->
    <NModal
      v-model:show="showPingChart"
      preset="card"
      :title="`${props.node.name} - 延迟监控`"
      class="w-full sm:w-3/4"
      :bordered="false"
      :segmented="{ content: true, footer: 'soft' }"
    >
      <PingChart :uuid="props.node.uuid" />
    </NModal>
  </div>
</template>
