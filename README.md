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

## 安装与使用

### 方式一：直接填入仓库地址安装（推荐）

1. 登录 Komari Monitor 后，进入 **「设置」** -> **「主题管理」**。
2. 点击 **「导入主题」**，在主题仓库地址中直接填入：
   ```text
   https://github.com/Chen017/komari-theme-emerald-insights
   ```
3. 点击确定，Komari 将自动拉取并安装最新版本。

### 方式二：手动上传安装包

1. 从 [Release 页面](https://github.com/Chen017/komari-theme-emerald-insights/releases) 下载最新的 `komari-theme-emerald-insights.zip` 文件。
2. 登录 Komari Monitor 后，点击 **「设置」** -> **「主题管理」**。
3. 点击 **「上传主题」** 按钮，选择下载的 `komari-theme-emerald-insights.zip` 文件。
4. 刷新页面，即可启用新主题。

---

## 使用与配置

Komari Emerald Insights 在传统监控基础上扩展了四大核心模块：**流量趋势**、**近 30 天在线率**、**IPQA 质量分析** 与 **成本与续费**。本节详细说明各特性的依赖关系与配置方法。

### 1. Resource Insights 快速开始

Resource Insights 汇集了集群与节点的关键资源指标，其数据来源于不同层次：

```text
┌──────────────────────────┬────────────────────────────────────────────────────────┐
│ 模块                     │ 数据来源 / 依赖项                                      │
├──────────────────────────┼────────────────────────────────────────────────────────┤
│ 7 天 / 30 天 流量趋势    │ Komari Metric Store (traffic.up / traffic.down)        │
│ 本周期 (Billing Cycle)   │ 节点 Tag (<TRD:N> <TRTZ:Zone>) + Agent net_total 累计  │
│ 近 30 天在线率           │ komari-plugin-availability-history 插件                │
│ IPQA 质量概览与档案      │ IP-Quality-Archive (VPS) + IPQA Alert Report (服务端) │
│ 成本与续费分析           │ Komari 内置节点账单字段 (price, billing_cycle 等)      │
└──────────────────────────┴────────────────────────────────────────────────────────┘
```

---

### 2. 流量趋势 (Traffic Trends)

资源概览页提供「7 天」、「30 天」与「本周期」三种时间跨度：

#### 7 天趋势
- **无需任何特殊配置**：直接读取 Komari Metric Store 中 `traffic.up` 与 `traffic.down` 指标。
- **支持汇总与单节点**：可查看全部节点流量总和，亦可切换至特定节点。
- **真实覆盖展示**：若历史保留天数不足 7 天，图表将真实展示已有天数覆盖率，绝不伪造零流量。

#### 30 天趋势
- **依赖 Metric Store 保留期**：需要 Komari Metric Store 中 `traffic.up` 与 `traffic.down` 的 `retention_days` 均至少为 30 天。
- **自动禁用保护**：若保留期不足 30 天，「30 天」按钮将自动禁用，并提示当前仅保留 X 天。
- **修改建议**：请在 Komari Metric Store 的指标定义中，将 `traffic.up` 与 `traffic.down` 的 `retention_days` 调整为至少 30 天。调大保留期后历史向前积累，之前已丢弃的旧数据无法自动追溯。

#### 本周期 (Billing Cycle)
- **仅支持单节点**：各 VPS 的月度重置日与时区各不相同，因此**必须在右上角选择单个节点**后方可切换至「本周期」。全部节点汇总状态下「本周期」不可用。
- **依赖节点重置标签**：节点标签（Tags）中需包含有效的 `<TRD:N>` 元数据。

#### 流量重置日标签 (`<TRD:N>`)
- **定义**：TRD 即 Traffic Reset Day（流量重置日）。
- **格式**：`<TRD:27>`（支持 `1` 至 `31` 的整数）。
- **短月截断规则**：若设置 `<TRD:31>`，在少于 31 天的月份（如 4 月、6 月、9 月、11 月为 30 天，2 月为 28 或 29 天），系统自动安全截断至当月最后一天计算周期起点。

#### 流量重置时区标签 (`<TRTZ:Timezone>`)
- **定义**：TRTZ 即 Traffic Reset Timezone（流量重置时区）。
- **格式**：`<TRTZ:America/New_York>`（必须为标准 IANA 时区名称，如 `Asia/Shanghai`、`America/Los_Angeles`、`Europe/London`、`UTC` 等）。
- **作用**：精确确定重置日 00:00:00 对应的绝对时刻（时间戳），妥善应对夏令时 (DST) 切换。图表展示时仍按北京时间自然日统一对齐，确保阅读直观。
- **时区回退**：若仅配置 `<TRD:27>` 而未配置 `<TRTZ:...>`，主题默认按 `Asia/Shanghai`（北京时间）计算重置边界，界面会明确提示 `重置时区：Asia/Shanghai（默认）`。

> [!WARNING]
> **重要机制说明：TRD 不会自动配置 Agent**
> `<TRD:N>` 是 Emerald Insights 的前端解析元数据，**不会**自动修改 Komari Agent 自身的 `month_rotate`。
> - 「本周期累计」读取自 Agent 实时上报的 `net_total_up` / `net_total_down`。
> - 每日趋势柱状图由 Metric Store 每日增量汇聚。
> 
> 若希望「本周期累计」与周期趋势图完全一致，请确保 Agent 启动配置中的 `--month-rotate` / `month_rotate`（或 `AGENT_MONTH_ROTATE` 环境变量）与 `<TRD:N>` 设置一致。

---

### 3. 近 30 天在线率 (Availability)

- **依赖插件**：[komari-plugin-availability-history](https://github.com/Chen017/komari-plugin-availability-history)。
- **实时事件账本**：插件基于服务端与 Agent 之间的 WebSocket 实时断连事件记录精准账本，而非通过 CPU 采样历史猜测短时离线。
- **无历史回溯**：插件自安装启用时起开始精确建账。刚安装时因无过往账本数据，在线率可能展示为 `—` 并提示 `覆盖 <1 / 30 天`，此属完全正常现象。随着时间推移，覆盖范围将逐步增长至完整的 `30 / 30 天`。
- **抖动过滤**：网络瞬断或闪断由 Availability History 插件端的离线宽限期（offline grace）进行平滑过滤，避免频繁误报。

---

### 4. IP 质量分析 (IPQA)

IPQA 体系由三层架构协同运作：

```text
┌─────────────────────────────────┐
│ 1. 监控节点 (VPS)               │
│    运行 IP-Quality-Archive      │ <- 定时检测 IP 欺诈度/风控库/流媒体/黑名单
└────────────────┬────────────────┘
                 │ 归档同步
┌────────────────▼────────────────┐
│ 2. Komari 服务端                │
│    安装 IPQA Alert Report 插件  │ <- 解析归档、变更检测、提供只读 API
└────────────────┬────────────────┘
                 │ 呈现
┌────────────────▼────────────────┐
│ 3. Komari Emerald Insights 主题 │
│    Resource Insights + 节点详情 │ <- 质量概览、风险矩阵、解锁表与历史追溯
└─────────────────────────────────┘
```

- **极简部署**：
  1. 在需监控 IP 质量的 VPS 上安装部署 [IP-Quality-Archive](https://github.com/Chen017/IP-Quality-Archive)。
  2. 在 Komari 服务端安装并启用 [komari-plugin-ipqa-alert-report](https://github.com/Chen017/komari-plugin-ipqa-alert-report) 插件。
  3. 在主题设置中开启「显示 IP 质量概览」与「节点详情展示 IP 快照」。
- **优雅降级**：若服务端未安装 IPQA 插件，资源概览中将仅展示温和的安装指引卡片；若集群中仅部分节点启用了 IPQA，主题仅展示有归档数据的节点，绝不影响其他节点或核心监控功能。

---

### 5. 成本与续费 (Cost & Renewal)

成本与续费模块完全基于 Komari 内置的节点账单字段，无需安装第三方插件：

| Komari 节点字段 | 说明 | 示例 / 支持格式 |
| :--- | :--- | :--- |
| `price` | 续费价格 | `119`, `10.8`, `40` |
| `currency` | 币种代码 | `CNY`, `USD`, `EUR`, `JPY`, `CAD`, `GBP`, `HKD` 等 |
| `billing_cycle` | 计费周期（天数） | 常见周期：~30 天（月付）、~90 天（季付）、~180 天（半年付）、~365 天（年付）、~730 天（两年付） |
| `expired_at` | 到期时间 | UNIX 时间戳或标准日期格式 |
| `auto_renewal` | 是否自动续费 | `true` (自动续费) / `false` (手动续费) |

#### 免计费（白嫖）节点标记
满足以下任一条件的节点将被归类为「免计费/白嫖」节点，不纳入集群月均与年度成本支出计算：
1. 节点标签（Tags）中包含 `白嫖中`；
2. 节点价格 `price` 填写为 `0`；
3. 节点价格 `price` 填写为 `-1`。

#### 多币种折算与隐私保证
- 支持各大主流货币统一折算为人民币 (CNY)，方便全局统筹开销。
- 汇率数据优先由 Frankfurter (`api.frankfurter.app`) 提供，备用 open.er-api，并在本地安全缓存 24 小时。
- **零隐私泄露**：查询汇率时仅请求货币兑换比率（如 USD/CNY），绝不向外泄露任何服务器资产、价格或账单信息。

---

### 6. 节点配置示例

在 Komari 后台编辑节点时，可在 **「标签 (Tags)」** 栏配置重置元数据，多个标签以英文分号或空格分隔：

#### 示例一：指定时区与重置日（推荐）
```text
Premium;US-East;<TRD:27> <TRTZ:America/New_York>
```
- **界面呈现**：
  - 普通标签徽章：`Premium`、`US-East`
  - 友好重置徽章：`流量重置日：27 · 重置时区：America/New_York`（带日历时钟图标）
  - 机器标签 `<TRD:...>` 与 `<TRTZ:...>` 被自动过滤收敛，不再原始暴露。

#### 示例二：未指定时区（默认北京时间）
```text
HK-BGP;<TRD:18>
```
- **界面呈现**：
  - 普通标签徽章：`HK-BGP`
  - 友好重置徽章：`流量重置日：18 · 重置时区：Asia/Shanghai（默认）`

#### 示例三：白嫖节点协同配置
```text
Oracle-ARM;白嫖中;<TRD:1>
```
- **界面呈现**：
  - 普通标签徽章：`Oracle-ARM`、`白嫖中`
  - 友好重置徽章：`流量重置日：1 · 重置时区：Asia/Shanghai（默认）`
  - 成本模块自动将其归类为白嫖节点，不计入费用。

---

### 7. 常见问题 (FAQ)

#### Q: 为什么流量趋势中的「本周期」按钮是灰色的，无法点击？
> A: 满足以下两点时「本周期」按钮才会激活：
> 1. 在页面右上角下拉菜单中**选中了单个节点**（全部节点汇总模式下不支持本周期）；
> 2. 该节点标签中配置了有效的 `<TRD:N>`（N 为 1 至 31 的数字）。

#### Q: 为什么「30 天」流量趋势按钮显示为不可用？
> A: 这意味着 Komari Metric Store 中 `traffic.up` 与 `traffic.down` 指标的历史保留天数（retention_days）不足 30 天。请进入 Komari 指标管理将两者的 retention_days 调整为至少 30。修改后数据会随时间持续积累，之前已被系统丢弃的历史无法追溯。

#### Q: 为什么「本周期累计」与图表里的柱状图周期感觉对不上？
> A: 请检查两项配置：
> 1. `<TRD:N>` 是前端展示标记，请确保该 VPS 上的 Komari Agent 自身的 `--month-rotate` / `month_rotate` 设为了相同的重置日；
> 2. 若 VPS 供应商的流量是以海外当地时间（如美东时间）结算，请在标签中配置 `<TRTZ:America/New_York>`，避免北京时间跨天导致的数小时时差偏移。

#### Q: 刚安装完 Availability History 在线率插件，为什么显示为 “—”？
> A: 插件采用事件账本制，仅从安装启用那一刻开始记录精确的 WebSocket 在线/离线事件，无法凭空推测过往历史。刚安装时提示 `覆盖 <1 / 30 天` 属于正常现象，随着系统持续稳定运行，覆盖天数会每日递增。

#### Q: 为什么 IP 质量 (IPQA) 区域没有任何数据？
> A: 请依次排查：
> 1. 目标 VPS 是否已部署 [IP-Quality-Archive](https://github.com/Chen017/IP-Quality-Archive) 并成功生成历史检测 json 归档；
> 2. Komari 服务端是否已安装并启用了 [komari-plugin-ipqa-alert-report](https://github.com/Chen017/komari-plugin-ipqa-alert-report) 插件；
> 3. 服务端插件是否已成功拉取或挂载归档数据。

#### Q: 为什么成本模块显示为“未设置”或费用为 0？
> A: 请检查 Komari 后台对应节点的设置：确认是否填写了 `price`（价格）与 `billing_cycle`（周期天数），以及标签中是否误包含了 `白嫖中` 标记。

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
