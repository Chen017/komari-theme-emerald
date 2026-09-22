<h3 align="center"> Komari Emerald Insights </h3>
<p align="center">
现代化 Komari 主题，集成流量趋势、精确在线率、IPQA 可视化、成本与续费分析。
<br>
Modern Komari theme with Resource Insights, traffic trends, exact availability, IPQA visualization, cost and renewal analytics.
</p>
<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License"></a>
  <a href="https://github.com/komari-monitor"><img src="https://img.shields.io/badge/Komari-%3E%3D1.4.3-blue" alt="Komari Version"></a>
  <a href="https://github.com/Chen017/komari-emerald-suite"><img src="https://img.shields.io/badge/Komari%20Emerald-Ecosystem-10b981" alt="Komari Emerald Ecosystem"></a>
</p>

![preview](/docs/preview.png)

## 功能特性

- **经典监控视图**：保持 Tokinx 原版 Emerald 纯正设计语言，轻量精致的节点卡片与详情弹窗。
- **资源概览 (Resource Insights)**：
  - **每日流量趋势**：支持全部节点汇总与单节点切换，提供 7 天、30 天以及本周期（Billing Cycle）统计，准确处理计数器重置与重启。
  - **近 30 天在线率**：基于 Availability History 插件的 WebSocket 事件账本统计在线率，不会使用 CPU 采样历史推测短时离线。真实反映采样覆盖率（如 `30 / 30 天` 或 `覆盖 13.4 / 30 天`），不掩盖历史缺失。
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

---

## 配套插件与依赖

| 功能特性 | 依赖项 | 是否必需 | 说明 |
| :--- | :--- | :--- | :--- |
| **标准监控与节点详情** | Komari (`>= 1.4.3`) | **必需** | 经典监控视图与基础指标呈现 |
| **7 天 / 30 天 / 本周期 流量趋势** | Komari Metric Store | 内置支持 | 历史流量汇聚统计 |
| **近 30 天在线率** | [komari-plugin-availability-history](https://github.com/Chen017/komari-plugin-availability-history) | 可选 | WebSocket 实时连接事件账本 |
| **IPQA 质量概览与历史档案** | [komari-plugin-ipqa-alert-report](https://github.com/Chen017/komari-plugin-ipqa-alert-report) | 可选 | 归档同步、只读 API 与语义变更 |
| **IPQA 原始数据采集** | [IP-Quality-Archive](https://github.com/Chen017/IP-Quality-Archive) | IPQA 必需 | 运行于受监控 VPS 节点 |
| **成本与续费分析** | 无 | 内置支持 | 支持多币种汇率折算与预算分析 |

### 优雅降级说明

若未安装上述可选插件，Komari Emerald Insights 仍可完整使用常规监控、流量趋势、成本续费等内置功能；对应的插件特性区域仅会展示友好的安装指引卡片，绝不阻塞主题正常加载与运行。

### 汇率服务与隐私保护

- 汇率优先通过 Frankfurter (`api.frankfurter.app`) 获取，备用 open.er-api (`open.er-api.com`)，并在客户端进行 24 小时缓存。
- **隐私承诺**：仅向公共汇率接口查询货币兑换比率，绝不发送任何节点名称、价格、账单或续费元数据。

---

## 使用

1. 从 [Release 页面](https://github.com/Chen017/komari-theme-emerald-insights/releases) 下载最新的 `komari-theme-emerald-insights-build-*.zip` 文件
2. 登录 Komari Monitor 后，点击 `设置`，选择 `主题管理` 选项卡
3. 点击 `上传主题` 按钮，选择下载的 `komari-theme-emerald-insights-build-*.zip` 文件
4. 刷新页面，即可看到新的主题

---

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

---

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

---

## Komari Emerald Ecosystem

本主题是 **Komari Emerald Ecosystem** 的前端核心：

```text
                         Komari
                            │
               ┌────────────┴────────────┐
               │                         │
               ▼                         ▼
   Availability History          IPQA Alert Report
   WebSocket event ledger        Archive / API / Alerts
                                         │
                                         ▼
                               IP-Quality-Archive
                               on monitored VPS
               │                         │
               └────────────┬────────────┘
                            ▼
                Komari Emerald Insights
                    Resource Insights
                       (★ 本项目)
```

- [Komari Emerald Suite](https://github.com/Chen017/komari-emerald-suite)：生态聚合展示主页
- [Komari Plugin: Availability History](https://github.com/Chen017/komari-plugin-availability-history)：基于事件账本的在线率历史与 30 天可用性插件
- [Komari Plugin: IPQA Alert Report](https://github.com/Chen017/komari-plugin-ipqa-alert-report)：IP 质量归档同步与告警报告插件
- [IP-Quality-Archive](https://github.com/Chen017/IP-Quality-Archive)：节点端 IP 质量采集工具

---

## Related Projects

- [Komari Emerald Suite](https://github.com/Chen017/komari-emerald-suite)
- [Availability History](https://github.com/Chen017/komari-plugin-availability-history)
- [IPQA Alert Report](https://github.com/Chen017/komari-plugin-ipqa-alert-report)
- [IP-Quality-Archive](https://github.com/Chen017/IP-Quality-Archive)
- [Komari](https://github.com/komari-monitor/komari)

---

## 鸣谢与开源致谢

- [Komari](https://github.com/komari-monitor/komari)
- [Komari Emerald (Tokinx)](https://github.com/Tokinx/komari-theme-emerald)：本项目基于 Tokinx 的原版 Emerald 主题进行二次开发与重构，保留了其优秀的极简设计语言与经典监控视图。
- [komari-theme-emerald-globe-pro (allen0039)](https://github.com/allen0039/komari-theme-emerald-globe-pro)：资源概览 (Resource Insights)、历史流量汇聚、在线率及成本续费核心逻辑深度参考并适配自该项目 (MIT License)，特此致以诚挚敬意与感谢！
- [Komari Next](https://github.com/tonyliuzj/komari-next)
- [Komari Naive](https://github.com/lyimoexiao/komari-theme-naive)
- [IP-Quality-Archive (Chen017)](https://github.com/Chen017/IP-Quality-Archive)：IP 质量数据格式标准。

---

## License

[MIT](./LICENSE)
