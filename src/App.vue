<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { ModalHost } from '@/components/ui/modal-x'
import { Toaster } from '@/components/ui/sonner'
import { useAppStore } from '@/stores/app'
import { destroyInitManager, initApp } from '@/utils/init'
import { registerModalHost } from '@/utils/modal'
import Background from './components/Background.vue'
import Footer from './components/Footer.vue'
import Header from './components/Header.vue'
import LoadingCover from './components/LoadingCover.vue'
import Provider from './components/Provider.vue'

const appStore = useAppStore()

const isReady = ref(false)

const modalHostRef = ref<InstanceType<typeof ModalHost> | null>(null)

onMounted(async () => {
  if (modalHostRef.value) {
    registerModalHost(modalHostRef.value)
  }
  try {
    await initApp()
    await nextTick()
    isReady.value = true
  }
  catch (error) {
    console.error('[App] Initialization failed:', error)
    isReady.value = true
  }
})

onUnmounted(() => {
  destroyInitManager()
})
</script>

<template>
  <Provider>
    <Background />
    <Transition enter-active-class="transition-all duration-100 ease-out" enter-from-class="opacity-0 backdrop-blur-0"
      enter-to-class="opacity-100 backdrop-blur-sm" leave-active-class="transition-all duration-100 ease-in"
      leave-from-class="opacity-100 backdrop-blur-sm" leave-to-class="opacity-0 backdrop-blur-0">
      <LoadingCover v-if="appStore.loading" />
    </Transition>
    <div class="fixed inset-0 -z-10 mx-0 max-w-none overflow-hidden zoom-200 bg-slate-200/50 dark:bg-slate-900/50">
      <div class="absolute top-0 left-1/2 -ml-152 h-100 w-325 dark:mask-[linear-gradient(white,transparent)]">
        <div
          class="absolute inset-0 bg-linear-to-r from-emerald-500 to-lime-300 mask-[radial-gradient(farthest-side_at_top,white,transparent)] opacity-40 dark:from-emerald-500/30 dark:to-lime-300/30 dark:opacity-100">
          <svg aria-hidden="true"
            class="absolute inset-x-0 inset-y-[-50%] h-[200%] w-full skew-y-[-18deg] fill-black/40 stroke-black/50 mix-blend-overlay dark:fill-white/2.5 dark:stroke-white/5">
            <defs>
              <pattern id="_S_1_" width="72" height="56" patternUnits="userSpaceOnUse" x="-12" y="4">
                <path d="M.5 56V.5H72" fill="none" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" stroke-width="0" fill="url(#_S_1_)" /><svg x="-12" y="4"
              class="overflow-visible">
              <rect stroke-width="0" width="73" height="57" x="288" y="168" />
              <rect stroke-width="0" width="73" height="57" x="144" y="56" />
              <rect stroke-width="0" width="73" height="57" x="504" y="168" />
              <rect stroke-width="0" width="73" height="57" x="720" y="336" />
            </svg>
          </svg>
        </div>
        <svg viewBox="0 0 1113 440" aria-hidden="true"
          class="absolute top-0 left-1/2 -ml-76 w-278.25 fill-white blur-[26px] dark:hidden">
          <path d="M.016 439.5s-9.5-300 434-300S882.516 20 882.516 20V0h230.004v439.5H.016Z" />
        </svg>
      </div>
    </div>
    <Header />
    <main v-if="!appStore.loading" class="min-h-screen overflow-hidden">
      <div class="max-w-[1280px] mx-auto">
        <RouterView v-slot="{ Component }">
          <Transition enter-active-class="transition-all duration-200 ease-out"
            enter-from-class="opacity-0 translate-x-4 blur-sm" enter-to-class="opacity-100 translate-x-0 blur-0"
            leave-active-class="transition-all duration-200 ease-in" leave-from-class="opacity-100 translate-x-0 blur-0"
            leave-to-class="opacity-0 -translate-x-4 blur-sm" mode="out-in">
            <KeepAlive :include="['HomeView']">
              <component :is="Component" />
            </KeepAlive>
          </Transition>
        </RouterView>
      </div>
    </main>
    <Footer v-if="!appStore.loading" />
    <Toaster rich-colors close-button position="top-center" />
    <ModalHost ref="modalHostRef" />
  </Provider>
</template>
