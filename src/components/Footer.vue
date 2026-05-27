<script setup lang="ts">
import type { VersionInfo } from '@/utils/api'
import { computed, onMounted, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { getSharedApi } from '@/utils/api'

const appStore = useAppStore()
const api = getSharedApi()

const buildVersion = __BUILD_VERSION__
const buildGitHash = __BUILD_GIT_HASH__

const serverVersion = ref<VersionInfo | null>(null)

onMounted(async () => {
  try {
    serverVersion.value = await api.getVersion()
  }
  catch {
    // 静默失败
  }
})

const formattedServerVersion = computed(() => serverVersion.value?.version ?? null)

const showIcp = computed(() => appStore.icpEnabled && appStore.icpNumber)
const showPolice = computed(() => appStore.policeEnabled && appStore.policeNumber)
const showFiling = computed(() => showIcp.value || showPolice.value)
</script>

<template>
  <footer class="w-full sm:flex-row sm:gap-4 sm:items-center sm:justify-between max-w-[1280px] mx-auto p-4">
    <div class="flex flex-row text-xs text-muted-foreground">
      <div class="flex gap-1 items-center">
        Powered by
        <a href="https://github.com/komari-monitor/komari" target="_blank" rel="noopener noreferrer"
          class="transition-opacity hover:opacity-80"
          :title="formattedServerVersion ? formattedServerVersion : undefined">
          <span class="font-medium text-foreground">Komari Monitor</span>
        </a>
      </div>
      <div class="flex-1"></div>
      <div class="flex flex-wrap gap-1 items-center">
        Theme by
        <a href="https://github.com/lyimoexiao/komari-theme-naive" target="_blank" rel="noopener noreferrer"
          class="transition-opacity hover:opacity-80" :title="String([buildVersion, buildGitHash])">
          <span class="font-medium text-foreground">Komari Naive</span>
        </a>
      </div>
    </div>

    <div v-if="showFiling" class="flex flex-wrap gap-2 items-center justify-center sm:flex-shrink-0">
      <a v-if="showIcp" :href="appStore.icpUrl" target="_blank" rel="noopener noreferrer"
        class="transition-opacity hover:opacity-70">
        <span class="text-xs text-muted-foreground">{{ appStore.icpNumber || '' }}</span>
      </a>
      <span v-if="showIcp && showPolice" class="opacity-50 text-xs text-muted-foreground">·</span>
      <template v-if="showPolice">
        <a v-if="appStore.policeUrl" :href="appStore.policeUrl" target="_blank" rel="noopener noreferrer"
          class="transition-opacity hover:opacity-70">
          <span class="text-xs text-muted-foreground">{{ appStore.policeNumber || '' }}</span>
        </a>
        <span v-else class="text-xs text-muted-foreground">{{ appStore.policeNumber || '' }}</span>
      </template>
    </div>
  </footer>
</template>
