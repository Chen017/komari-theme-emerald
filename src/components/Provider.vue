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

// 从主题配置读取设置，支持亮色/暗色模式分别配置
const themeOverride = computed<GlobalThemeOverrides>(() => {
  const settings = appStore.publicSettings?.theme_settings as Record<string, unknown> | undefined

  // 通用默认值
  const borderRadius = (settings?.borderRadius as string) || '3px'
  const fontFamily = (settings?.fontFamily as string) || '"MiSans VF", sans-serif'

  // 根据当前主题模式选择颜色配置
  const primaryColor = isDark.value
    ? (settings?.darkPrimaryColor as string) || '#63e2b6'
    : (settings?.lightPrimaryColor as string) || '#18a058'

  const primaryColorHover = isDark.value
    ? (settings?.darkPrimaryColorHover as string) || '#7fe7c4'
    : (settings?.lightPrimaryColorHover as string) || '#36ad6a'

  const primaryColorPressed = isDark.value
    ? (settings?.darkPrimaryColorPressed as string) || '#5acea7'
    : (settings?.lightPrimaryColorPressed as string) || '#0c7a43'

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
