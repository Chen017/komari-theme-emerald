<script setup lang="ts">
import type { VersionInfo } from '@/utils/api'
import { NLayoutFooter, NText } from 'naive-ui'
import { computed, onMounted, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { getSharedApi } from '@/utils/api'

const appStore = useAppStore()
const api = getSharedApi()

// 构建时注入的版本信息
const buildVersion = __BUILD_VERSION__
const buildGitHash = __BUILD_GIT_HASH__

// Komari Monitor 服务端版本信息
const serverVersion = ref<VersionInfo | null>(null)

// 获取服务端版本信息
onMounted(async () => {
  try {
    serverVersion.value = await api.getVersion()
  }
  catch {
    // 忽略错误，保持为 null
  }
})

// 格式化版本号显示
const formattedServerVersion = computed(() => {
  if (!serverVersion.value)
    return null
  return serverVersion.value.version
})

// 计算页面容器的样式
const containerStyle = computed(() => {
  if (appStore.fullWidth) {
    return {}
  }
  return {
    maxWidth: appStore.maxPageWidth,
    marginInline: 'auto',
  }
})

// 是否显示备案信息
const showIcp = computed(() => appStore.icpEnabled && appStore.icpNumber)
const showPolice = computed(() => appStore.policeEnabled && appStore.policeNumber)
</script>

<template>
  <footer class="footer">
    <NLayoutFooter class="footer__content">
      <div class="footer__inner" :style="containerStyle">
        <!-- 主信息区域 -->
        <div class="footer__main">
          <!-- Komari Monitor 信息 -->
          <div class="footer__item">
            <NText :depth="3" class="text-sm">
              Powered by
            </NText>
            <a
              href="https://github.com/komari-monitor/komari"
              target="_blank"
              rel="noopener noreferrer"
              class="footer__link"
            >
              <NText type="primary" class="text-sm font-medium">
                Komari Monitor
              </NText>
            </a>
            <NText v-if="formattedServerVersion" :depth="3" class="text-xs font-mono ml-1">
              v{{ formattedServerVersion }}
            </NText>
          </div>

          <!-- 主题信息 -->
          <div class="footer__item">
            <NText :depth="3" class="text-sm">
              Theme by
            </NText>
            <a
              href="https://github.com/lyimoexiao/komari-theme-naive"
              target="_blank"
              rel="noopener noreferrer"
              class="footer__link"
            >
              <NText type="primary" class="text-sm font-medium">
                Komari Naive
              </NText>
            </a>
            <NText :depth="3" class="text-xs font-mono ml-1">
              v{{ buildVersion }} ({{ buildGitHash }})
            </NText>
          </div>
        </div>

        <!-- 备案信息区域 -->
        <div v-if="showIcp || showPolice" class="footer__filing">
          <!-- ICP 备案 -->
          <a
            v-if="showIcp"
            :href="appStore.icpUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="footer__filing-link"
          >
            <NText :depth="3" class="text-xs">
              {{ appStore.icpNumber }}
            </NText>
          </a>

          <!-- 公安备案 -->
          <template v-if="showPolice">
            <span v-if="showIcp" class="footer__filing-divider">
              <NText :depth="3" class="text-xs">|</NText>
            </span>
            <a
              v-if="appStore.policeUrl"
              :href="appStore.policeUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="footer__filing-link"
            >
              <NText :depth="3" class="text-xs">
                {{ appStore.policeNumber }}
              </NText>
            </a>
            <NText v-else :depth="3" class="text-xs">
              {{ appStore.policeNumber }}
            </NText>
          </template>
        </div>
      </div>
    </NLayoutFooter>
  </footer>
</template>

<style scoped lang="scss">
.footer {
  width: 100%;

  &__content {
    padding: 1rem;
  }

  &__inner {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;

    @media (min-width: 640px) {
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
    }
  }

  &__main {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    @media (min-width: 640px) {
      flex-direction: row;
      gap: 1.5rem;
    }
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  &__link {
    text-decoration: none;
    transition: opacity 0.2s ease;

    &:hover {
      opacity: 0.8;
    }
  }

  &__filing {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;

    @media (min-width: 640px) {
      flex-shrink: 0;
    }
  }

  &__filing-link {
    text-decoration: none;
    transition: opacity 0.2s ease;

    &:hover {
      opacity: 0.7;
    }
  }

  &__filing-divider {
    opacity: 0.5;
  }
}
</style>
