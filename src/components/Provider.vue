<script setup lang="ts">
import type { GlobalTheme, GlobalThemeOverrides } from 'naive-ui'
import {
  darkTheme,
  dateEnUS,
  dateZhCN,
  enUS,
  lightTheme,
  NBackTop,
  NConfigProvider,
  NDialogProvider,
  NGlobalStyle,
  NLoadingBarProvider,
  NMessageProvider,
  NModalProvider,
  NNotificationProvider,
  useDialog,
  useLoadingBar,
  useMessage,
  useModal,
  useNotification,
  useOsTheme,
  zhCN,
} from 'naive-ui'

import { computed, defineComponent, h } from 'vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const osTheme = useOsTheme()

const isDark = computed(() => {
  if (appStore.themeMode === 'auto') {
    return osTheme.value === 'dark'
  }
  return appStore.themeMode === 'dark'
})

const theme = computed<GlobalTheme | null>(() => {
  return isDark.value ? darkTheme : lightTheme
})

const locale = computed(() => {
  const langMap = {
    'zh-CN': zhCN,
    'en-US': enUS,
  }
  return langMap[appStore.lang] || zhCN
})

const dateLocale = computed(() => {
  const langMap = {
    'zh-CN': dateZhCN,
    'en-US': dateEnUS,
  }
  return langMap[appStore.lang] || dateZhCN
})

function setupNaiveTools() {
  window.$loadingBar = useLoadingBar()
  window.$notification = useNotification()
  window.$message = useMessage()
  window.$dialog = useDialog()
  window.$modal = useModal()
}

const NaiveProviderContent = defineComponent({
  setup() {
    setupNaiveTools()
  },
  render() {
    return h('div', { className: 'naive-tools' })
  },
})

// 从主题配置读取设置，支持基础颜色和字体配置
const themeOverride = computed<GlobalThemeOverrides>(() => {
  const settings = appStore.publicSettings?.theme_settings as Record<string, unknown> | undefined

  // 默认值
  const primaryColor = (settings?.primaryColor as string) || '#63e2b6'
  const primaryColorHover = (settings?.primaryColorHover as string) || '#7fe7c4'
  const primaryColorPressed = (settings?.primaryColorPressed as string) || '#5acea7'
  const borderRadius = (settings?.borderRadius as string) || '3px'
  const fontFamily = (settings?.fontFamily as string) || '"MiSans VF", sans-serif'

  return {
    common: {
      primaryColor,
      primaryColorHover,
      primaryColorPressed,
      primaryColorSuppl: primaryColorHover,
      borderRadius,
      fontFamily,
    },
  }
})
</script>

<template>
  <NConfigProvider :theme="theme" :theme-overrides="themeOverride" :locale="locale" :date-locale="dateLocale">
    <NBackTop :visibility-height="80" />
    <NGlobalStyle />
    <NLoadingBarProvider>
      <NDialogProvider>
        <NNotificationProvider>
          <NMessageProvider>
            <NModalProvider>
              <slot />
              <NaiveProviderContent />
            </NModalProvider>
          </NMessageProvider>
        </NNotificationProvider>
      </NDialogProvider>
    </NLoadingBarProvider>
  </NConfigProvider>
</template>
