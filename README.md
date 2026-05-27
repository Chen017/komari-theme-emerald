<h3 align="center"> Komari Emerald </h3>
<p align="center">基于 Vue 3 + Vite + reka-ui + Tailwind CSS v4 构建的 Komari Monitor 主题
</p>
<a href="https://github.com/Tokinx/komari-theme-emerald">
<img src="docs/preview.png" alt="Komari Theme Emerald" />
</a>

## 使用

1. 从 [Release 页面](https://github.com/Tokinx/komari-theme-emerald/releases) 下载最新的 `komari-theme-emerald-build-*.zip` 文件
2. 登录 Komari Monitor 后，点击 `设置`，选择 `主题管理` 选项卡
3. 点击 `上传主题` 按钮，选择下载的 `komari-theme-emerald-build-*.zip` 文件
4. 刷新页面，即可看到新的主题

## 环境要求

- Node.js: `^20.19.0` 或 `>=22.12.0`
- pnpm: `^10.28.2`

## 开发

```bash
# 安装依赖
pnpm i

# 启动开发服务器
pnpm dev

# 代码检查
pnpm lint
```

## 构建

```bash
# 类型检查 + 生产构建
pnpm build

# 预览生产构建
pnpm preview
```

## 技术栈

| 类别       | 技术                                                         |
| ---------- | ------------------------------------------------------------ |
| 框架       | Vue 3 (Composition API + `<script setup>`)                   |
| 构建工具   | Vite 7                                                       |
| UI 组件    | reka-ui（shadcn-vue 风格组件）                               |
| 样式方案   | Tailwind CSS v4（CSS-first，OKLCH 设计令牌）+ tw-animate-css |
| 状态管理   | Pinia 3                                                      |
| 路由       | Vue Router 5                                                 |
| 提示与弹窗 | vue-sonner（Toaster）+ 自研 ModalHost                        |
| 图标       | @iconify/vue（按需 CDN）                                     |
| 图表       | ECharts + vue-echarts                                        |
| 3D 地球    | cobe                                                         |
| 实用工具   | @vueuse/core, dayjs                                          |
| 代码规范   | ESLint (@antfu/eslint-config) + oxlint                       |

## 参考

- [Komari](https://github.com/komari-monitor/komari)
- [Komari Next](https://github.com/tonyliuzj/komari-next)
- [Vue 3](https://vuejs.org/)
- [Vite](https://vitejs.dev/)
- [reka-ui](https://reka-ui.com/)
- [Tailwind CSS](https://tailwindcss.com/)

## License

[MIT](./LICENSE)
