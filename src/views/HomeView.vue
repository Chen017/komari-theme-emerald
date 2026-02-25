<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { NAlert, NDivider, NEmpty, NInput, NRadioButton, NRadioGroup, NTabPane, NTabs } from 'naive-ui'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import NodeCard from '@/components/NodeCard.vue'
import NodeGeneralCards from '@/components/NodeGeneralCards.vue'
import NodeList from '@/components/NodeList.vue'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { isRegionMatch } from '@/utils/regionHelper'

const appStore = useAppStore()
const nodesStore = useNodesStore()

const router = useRouter()

const searchText = ref('')
// 防抖后的搜索文本
const debouncedSearchText = ref('')

// 使用 VueUse 的 useDebounceFn 进行防抖，300ms 延迟
const updateDebouncedSearch = useDebounceFn((value: string) => {
  debouncedSearchText.value = value
}, 300)

// 监听原始搜索文本变化
watch(searchText, (value) => {
  updateDebouncedSearch(value)
})

const groups = computed(() => {
  return [
    {
      tab: '全部节点',
      name: 'all',
    },
    ...nodesStore.groups.map(group => ({
      tab: group,
      name: group,
    })),
  ]
})

// 验证当前选中的分组是否有效，无效则重置为 'all'
watch(
  () => nodesStore.groups,
  (groups) => {
    const currentGroup = appStore.nodeSelectedGroup
    if (currentGroup !== 'all' && !groups.includes(currentGroup)) {
      appStore.nodeSelectedGroup = 'all'
    }
  },
  { immediate: true },
)

/**
 * 检查节点是否匹配搜索词
 */
function isNodeMatchSearch(node: typeof nodesStore.nodes[number], search: string): boolean {
  if (!search.trim())
    return true

  const lowerSearch = search.toLowerCase().trim()

  // 搜索节点名称
  if (node.name.toLowerCase().includes(lowerSearch))
    return true

  // 搜索地区（使用 regionHelper 支持国家名称搜索）
  if (node.region && isRegionMatch(node.region, search))
    return true

  // 搜索操作系统
  if (node.os && node.os.toLowerCase().includes(lowerSearch))
    return true

  // 搜索分组
  if (node.group && node.group.toLowerCase().includes(lowerSearch))
    return true

  // 搜索标签
  if (node.tags && node.tags.toLowerCase().includes(lowerSearch))
    return true

  // 搜索备注
  if (node.remark && node.remark.toLowerCase().includes(lowerSearch))
    return true

  return false
}

const nodeList = computed(() => {
  // 先按分组筛选
  let filteredNodes = appStore.nodeSelectedGroup === 'all'
    ? nodesStore.nodes
    : nodesStore.nodes.filter(node => node.group === appStore.nodeSelectedGroup)

  // 再按防抖后的搜索词筛选
  if (debouncedSearchText.value.trim()) {
    filteredNodes = filteredNodes.filter(node => isNodeMatchSearch(node, debouncedSearchText.value))
  }

  return filteredNodes
})

function handleNodeClick(node: typeof nodesStore.nodes[number]) {
  router.push({ name: 'instance-detail', params: { id: node.uuid } })
}
</script>

<template>
  <div class="home-view">
    <div v-if="appStore.connectionError" class="alert px-4">
      <NAlert type="error" title="RPC 服务错误" show-icon>
        连接服务器失败，请检查网络设置或刷新页面后再试。
      </NAlert>
    </div>
    <NodeGeneralCards />
    <NDivider class="my-0! px-4!" dashed />
    <div class="node-info p-4 flex flex-col gap-4">
      <div class="search flex gap-2 items-center">
        <NInput v-model:value="searchText" placeholder="搜索节点名称、地区、系统">
          <template #prefix>
            <div class="i-icon-park-outline-search" />
          </template>
        </NInput>
        <NRadioGroup v-model:value="appStore.nodeViewMode">
          <NRadioButton value="card">
            Card
          </NRadioButton>
          <NRadioButton value="list">
            List
          </NRadioButton>
        </NRadioGroup>
      </div>
      <div class="nodes">
        <NTabs v-model:value="appStore.nodeSelectedGroup" animated>
          <NTabPane v-for="group in groups" :key="group.name" :tab="group.tab" :name="group.name">
            <!-- Card 视图 -->
            <div v-if="nodeList.length !== 0 && appStore.nodeViewMode === 'card'" class="gap-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              <NodeCard v-for="node in nodeList" :key="node.uuid" :node="node" @click="handleNodeClick(node)" />
            </div>
            <!-- List 视图 -->
            <NodeList v-else-if="nodeList.length !== 0 && appStore.nodeViewMode === 'list'" :nodes="nodeList" @click="handleNodeClick" />
            <!-- 空状态 -->
            <div v-else class="text-gray-500 text-center">
              <NEmpty description="暂无节点" />
            </div>
          </NTabPane>
        </NTabs>
      </div>
    </div>
  </div>
</template>
