<script setup lang="ts">
import { useDark, usePreferredDark } from '@vueuse/core'
import { computed, provide, ref, watch } from 'vue'
import { BackTop } from '@/components/ui/back-top'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()

const isScrolled = ref(false)
provide('isScrolled', isScrolled)

const isDark = computed(() => appStore.isDark)

const preferredDark = usePreferredDark()
useDark({
  storageKey: 'vueuse-color-scheme',
  selector: 'html',
  attribute: 'class',
  valueDark: 'dark',
  valueLight: '',
  initialValue: () => (appStore.themeMode === 'auto' ? (preferredDark.value ? 'dark' : 'light') : appStore.themeMode),
})

const themeSettings = computed(() => appStore.publicSettings?.theme_settings as Record<string, unknown> | undefined)

const primaryColor = computed(() => isDark.value
  ? (themeSettings.value?.darkPrimaryColor as string) || ''
  : (themeSettings.value?.lightPrimaryColor as string) || '',
)
const primaryColorHover = computed(() => isDark.value
  ? (themeSettings.value?.darkPrimaryColorHover as string) || ''
  : (themeSettings.value?.lightPrimaryColorHover as string) || '',
)
const primaryColorPressed = computed(() => isDark.value
  ? (themeSettings.value?.darkPrimaryColorPressed as string) || ''
  : (themeSettings.value?.lightPrimaryColorPressed as string) || '',
)
const borderRadius = computed(() => (themeSettings.value?.borderRadius as string) || '')
const fontFamily = computed(() => (themeSettings.value?.fontFamily as string) || '')
const numberFontFamily = computed(() => (themeSettings.value?.numberFontFamily as string) || '')

watch(
  [primaryColor, primaryColorHover, primaryColorPressed, borderRadius, fontFamily, numberFontFamily],
  ([primary, hover, pressed, radius, font, numFont]) => {
    const root = document.documentElement
    const apply = (name: string, value: string) => {
      if (value)
        root.style.setProperty(name, value)
      else
        root.style.removeProperty(name)
    }
    apply('--primary', primary)
    apply('--primary-hover', hover)
    apply('--primary-active', pressed)
    apply('--primary-color', primary)
    apply('--primary-color-hover', hover)
    apply('--primary-color-pressed', pressed)
    apply('--radius', radius)
    apply('--font-sans', font)
    apply('--font-number', numFont)
  },
  { immediate: true },
)

watch(
  isDark,
  (dark) => {
    const root = document.documentElement
    if (dark)
      root.classList.add('dark')
    else root.classList.remove('dark')
  },
  { immediate: true },
)

watch(
  () => appStore.backgroundEnabled,
  (enabled) => {
    const body = document.body
    if (enabled)
      body.style.setProperty('background-color', 'transparent', 'important')
    else
      body.style.removeProperty('background-color')
  },
  { immediate: true },
)
</script>

<template>
  <slot />
  <BackTop :visibility-height="1" @scrolled="isScrolled = $event" />
</template>
