<script setup lang="ts">
import { NButton, NLayoutFooter, NText } from 'naive-ui'

// 构建时注入的版本信息
const buildVersion = __BUILD_VERSION__
const buildGitHash = __BUILD_GIT_HASH__
</script>

<template>
  <footer>
    <NLayoutFooter class="p-4 flex flex-col gap-4">
      <div class="mx-auto flex flex-col gap-4 max-w-[1800px] w-full">
        <div>
          <NText>
            Powered by
          </NText>
          <NButton text tag="a" href="https://github.com/komari-monitor/komari" target="_blank">
            <NText type="primary">
              Komari Monitor
            </NText>
          </NButton>
        </div>
        <div>
          <NText>
            Theme by
          </NText>
          <NButton text tag="a" href="https://github.com/lyimoexiao/komari-theme-naive" target="_blank">
            <NText type="primary">
              Komari Naive
            </NText>
          </NButton>
          <NText :depth="3" class="text-xs font-mono ml-2">
            v{{ buildVersion }} ({{ buildGitHash }})
          </NText>
        </div>
      </div>
    </NLayoutFooter>
  </footer>
</template>
