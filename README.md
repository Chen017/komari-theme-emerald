<h3 align="center"> Komari Emerald </h3>
<p align="center">
基于 Vue 3 + Vite + reka-ui + Tailwind CSS v4 构建的 Komari Monitor 主题
</p>

![preview](/docs/preview.png)

## 功能特性

- **经典监控视图**：保持 Tokinx 原版 Emerald 纯正设计语言，轻量精致的节点卡片与详情弹窗。
- **资源概览 (Resource Insights)**：
  - **每日流量趋势**：支持全部节点汇总与单节点切换，提供 7 天、30 天以及自上次流量重置（Since Reset）统计，准确处理计数器重置与重启。
  - **近 30 天在线率**：展示全集群平均在线率与各节点 30 天可用性，真实反映采样覆盖率（如 `30 / 30 天` 或 `覆盖 13.4 / 30 天`），不掩盖历史缺失。
  - **IP 质量概览**：集成 IPQA 状态概览、节点质量卡片、风险矩阵、流媒体/AI 解锁矩阵与近期质量变更动态。
  - **成本摘要**：轻量级展示集群月均成本、年度预算与近期续费提示。
- **成本与续费 (Cost & Renewal)**：
  - **多币种统一折算**：自动将 USD、EUR、JPY、HKD、GBP 等外币折算为 CNY。
  - **月均成本与年度预算**：支持月付、季付、半年付、年付与多年付等多种计费周期折算。
  - **续费时间轴与节点成本表**：支持按 7 天、30 天、90 天、已过期或无到期日多维度筛选。
- **IPQA 节点档案与历史 (/ip-quality/:uuid)**：
  - 支持按历史归档日期逐日回溯，展示 IP 归属/ASN/ISP、各大评分引擎（IP2Location、Scamalytics、ipapi、AbuseIPDB、IPQS、DB-IP）、风险因子矩阵、流媒体与 AI 服务解锁、邮件端口与 DNSBL 黑名单检测、语义变更记录及原始 JSON 查看。
- **节点详情 IPQA 快照**：
  - 在常规节点详情页嵌入轻量级 IP Quality 快照卡片，支持一键直达完整档案。

## 配套插件与依赖

- **IPQA 插件支持**：IP 质量概览、档案及变更追踪功能依赖 [komari-plugin-ipqa-alert-report](https://github.com/Chen017/komari-plugin-ipqa-alert-report)（建议版本 `>= 0.2.0`）。
  > 提示：若未安装该插件，主题仍可完整使用常规监控、流量趋势、30 天在线率和成本续费功能，IPQA 区域将展示优雅降级提示。
- **汇率服务与隐私保护**：
  - 汇率优先通过 Frankfurter (`api.frankfurter.app`) 获取，备用 open.er-api (`open.er-api.com`)，并在客户端进行 24 小时缓存。
  - **隐私承诺**：仅向公共汇率接口查询货币兑换比率，绝不发送任何节点名称、价格、账单或续费元数据。

## 使用

1. 从 [Release 页面](https://github.com/Tokinx/komari-theme-emerald/releases) 下载最新的 `komari-theme-emerald-build-*.zip` 文件
2. 登录 Komari Monitor 后，点击 `设置`，选择 `主题管理` 选项卡
3. 点击 `上传主题` 按钮，选择下载的 `komari-theme-emerald-build-*.zip` 文件
4. 刷新页面，即可看到新的主题

## 环境要求

- Node.js: `^20.19.0` 或 `>=22.12.0`
- Bun: `>=1.2.0`

## 开发

```bash
# 安装依赖
bun install

# 启动开发服务器
bun run dev

# 运行自动化测试
bun run test

# 代码检查
bun run lint
```

## 构建

```bash
# 类型检查 + 生产构建
bun run build

# 预览生产构建
bun run preview
```

## 技术栈

| 类别     | 技术                             |
| -------- | -------------------------------- |
| 框架     | Vue 3                            |
| 构建工具 | Vite 7                           |
| UI 组件  | reka-ui（shadcn-vue 风格组件）   |
| 样式方案 | Tailwind CSS v4 + tw-animate-css |
| 状态管理 | Pinia 3                          |
| 路由     | Vue Router 5                     |
| 提示系统 | vue-sonner（Toaster）            |
| 图标     | @iconify/vue                     |
| 图表     | vue-echarts                      |
| 3D 地球  | cobe                             |
| 实用工具 | @vueuse/core, dayjs              |
| 代码规范 | ESLint (@antfu/eslint-config)    |

## 鸣谢与开源致谢

- [Komari](https://github.com/komari-monitor/komari)
- [Komari Emerald (Tokinx)](https://github.com/Tokinx/komari-theme-emerald)
- [Komari Next](https://github.com/tonyliuzj/komari-next)
- [Komari Naive](https://github.com/lyimoexiao/komari-theme-naive)
- [komari-theme-emerald-globe-pro (allen0039)](https://github.com/allen0039/komari-theme-emerald-globe-pro)：资源概览、历史流量汇聚、在线率及成本续费核心逻辑参考并适配自该项目 (MIT License)，特此鸣谢。
- [IP-Quality-Archive (Chen017)](https://github.com/Chen017/IP-Quality-Archive)：IP 质量数据格式标准。

## License

[MIT](./LICENSE)

