# Fork2 (Globe Pro) Source Map & Reuse Strategy

> Reference: `https://github.com/allen0039/komari-theme-emerald-globe-pro` (MIT License)  
> Target: `https://github.com/Chen017/komari-theme-emerald` (`feature/resource-ipqa-analytics`)  
> Upstream: `https://github.com/Tokinx/komari-theme-emerald`  
> Date: 2026-09-21

---

## 1. Overview & Architecture Invariant

This document maps all relevant components, composables, utilities, contracts, and tests in `komari-theme-emerald-globe-pro` (fork2), categorizing them into:
- **Copy/Adapt with minimal change**: Pure algorithmic modules (FX calculation, currency normalization, history gateway, traffic daily aggregation, capability detection, error classification).
- **Adapt heavily**: Visual presentation and UI components (Resource Insights page, Cost & Renewal page, header actions, renewal timeline, summary cards) rewritten to match Chen017's Emerald aesthetic and modular isolation under `src/features/`.
- **Explicitly Excluded**: Modules not part of the product specification (pressure heatmap, live traffic hotspot, traffic quota ranking, full run summary, 3D globe changes).

---

## 2. Fork2 Source Mapping Table

| Fork2 Source Path | Responsibility | Decision | Target Path in Chen017 Fork | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Currency & Cost Analytics** | | | | |
| `src/utils/financeHelper.ts` | FX rate fetching (Frankfurter + open.er-api fallback), 24h localStorage cache, currency normalization (30+ currencies), remaining value and monthly cost formulas. | **Adapt with minimal change** | `src/features/cost-renewal/services/fx.ts`<br>`src/features/cost-renewal/calculations.ts` | Decouple personal-finance-specific logic. Focus on public CNY normalization, monthly equivalent, and annual budget. |
| `src/utils/tagHelper.ts` | Billing cycle parsing, expiry calculations, days until expired, expire status classification. | **Copy / Reuse** | `src/utils/tagHelper.ts` (or reuse existing in Emerald) | Check Emerald's existing `src/utils/tagHelper.ts` for differences and port missing cycle labels. |
| `src/features/resource-overview/cost.ts` | Cost view model builder (`buildCostOverviewViewModel`), priced node filtering (`isPricedNode`), monthly ranking, renewal window detection. | **Adapt** | `src/features/cost-renewal/calculations.ts`<br>`src/features/cost-renewal/types.ts` | Adapt to separate Cost & Renewal page needs (renewal charges vs monthly equivalent, CNY focus). |
| `src/features/resource-overview/renewal.ts` | Renewal timeline model builder (`buildRenewalTimelineViewModel`), sort by expiry/risk, upcoming/expired filters. | **Adapt** | `src/features/cost-renewal/renewal.ts` | Support filterable renewal timeline (All, 7D, 30D, 90D, Expired, No expiry). |
| `src/composables/usePublicFinance.ts` | Reactive composable coordinating node price data, FX rate loading, and cost view model generation. | **Adapt** | `src/features/cost-renewal/composables/useCostRenewal.ts` | Streamlined for standalone Cost & Renewal page and lightweight summary card. |
| `src/components/resource-overview/CostOverviewPanel.vue` | UI panel for cost summary cards and monthly ranking list. | **Rewrite / Adapt** | `src/features/cost-renewal/pages/CostRenewalPage.vue`<br>`src/features/resource-insights/components/CostSummaryCard.vue` | Split into dedicated full Cost & Renewal page and lightweight Resource Insights summary card. |
| `src/components/resource-overview/RenewalTimelinePanel.vue` | UI component for node renewal events with status dots and badges. | **Adapt** | `src/features/cost-renewal/components/RenewalTimeline.vue` | Restyle with Emerald design system; support responsive stacking. |
| `src/components/PersonalFinanceDialog.vue` | Modal dialog for client-side personal node value calculations. | **Exclude** | *(Not in product scope)* | Product specifies public `/cost-renewal` page, not a client-side selection modal. |
| **Traffic & History Analytics** | | | | |
| `src/utils/history/types.ts` | Data contracts for RPC queries (`public:queryMetrics`, `common:getRecords`), raw metrics, status records. | **Copy with minimal change** | `src/features/resource-insights/types/history.ts` | Pure TypeScript interfaces. |
| `src/utils/history/gateway.ts` | History RPC gateway: `public:queryMetrics` with sum aggregation, fallback to `common:getRecords`, capability probing. | **Copy with minimal change** | `src/features/resource-insights/services/historyGateway.ts` | Preserves fallback and abort signal handling. |
| `src/utils/history/errorPolicy.ts` | History RPC failure classification (`isRetryableHistoryFailure`, timeout vs unsupported). | **Copy with minimal change** | `src/features/resource-insights/services/historyErrorPolicy.ts` | Core error handling for history queries. |
| `src/utils/history/trafficEvidence.ts` | Normalizes metric deltas and counter readings from raw RPC responses. | **Copy with minimal change** | `src/features/resource-insights/services/trafficEvidence.ts` | Algorithmic normalization. |
| `src/utils/history/trafficAggregator.ts` | Daily traffic aggregation with timezone handling, counter reset detection, quality tracking (complete/partial/estimated/missing). | **Copy with minimal change** | `src/features/resource-insights/services/trafficAggregator.ts` | Critical invariant: negative counter deltas must never become negative traffic. |
| `src/features/resource-overview/trafficTrend.ts` | View model builder for daily traffic trends across nodes. | **Adapt** | `src/features/resource-insights/services/trafficTrend.ts` | Adapt to support fleet aggregate + single-node view and 7D / 30D / Since Reset ranges. |
| `src/features/resource-overview/trafficTrendAvailability.ts` | Retention hours and recording capability check against requested time window. | **Copy with minimal change** | `src/features/resource-insights/services/trafficTrendAvailability.ts` | Explicit unavailable / insufficient retention state. |
| `src/features/resource-overview/trafficTrendCache.ts` | Cache layer for daily traffic points. | **Adapt** | `src/features/resource-insights/services/trafficTrendCache.ts` | In-memory + localStorage caching. |
| `src/features/resource-overview/trafficTrendPresentation.ts` | Formatting helpers for bytes, percentages, quality badges. | **Adapt** | `src/features/resource-insights/formatters.ts` | Integrated with Emerald typography and color tokens. |
| `src/features/resource-overview/trafficTrendRequestPool.ts` | Concurrency limit / pooling for history RPC calls. | **Copy with minimal change** | `src/features/resource-insights/services/trafficTrendRequestPool.ts` | Prevents overloading Komari backend on multi-node queries. |
| `src/composables/useTrafficTrend.ts` | Composable managing traffic data lifecycle, entity filtering, and refresh. | **Adapt** | `src/features/resource-insights/composables/useTrafficTrend.ts` | Support fleet mode, node switching, and 7D/30D/Since Reset. |
| `src/components/resource-overview/TrafficTrendPanel.vue` | UI component with ECharts daily bar/line chart for traffic. | **Rewrite / Adapt** | `src/features/resource-insights/components/TrafficTrendCard.vue` | Re-implemented using vue-echarts with Emerald dark/light styling and controls. |
| **Resource Overview Shell & Page** | | | | |
| `src/views/ResourceOverview.vue` | Main view for `/resources` in fork2. | **Rewrite** | `src/features/resource-insights/pages/ResourceInsightsPage.vue` | Custom layout: Hero header, Traffic trend + 30D Uptime cards, IPQA Overview section, and Cost Summary card. |
| `src/components/resource-overview/ResourcePanelShell.vue` | Common container card with header, summary, and action slots. | **Adapt** | `src/features/resource-insights/components/ResourcePanelShell.vue` | Standardizes card appearance across Resource Insights. |
| `src/features/resource-overview/contract.ts` | Runtime state resolution (loading, ready, degraded, error). | **Adapt** | `src/features/resource-insights/types/contract.ts` | Tailored to Resource Insights modules. |
| **Excluded Fork2 Modules** | | | | |
| `src/components/resource-overview/PressureHeatmapPanel.vue` | CPU/Memory/Disk pressure heatmap. | **DO NOT BRING OVER** | *None* | Explicitly excluded by spec. |
| `src/components/resource-overview/QuotaRankingPanel.vue` | Traffic allowance ranking panel. | **DO NOT BRING OVER** | *None* | Explicitly excluded by spec. |
| `src/components/resource-overview/LiveTrafficPanel.vue` | Real-time traffic hotspot list. | **DO NOT BRING OVER** | *None* | Explicitly excluded by spec. |
| `src/features/resource-overview/realtime.ts` | Real-time aggregate calculations and telemetry summary. | **DO NOT BRING OVER** | *None* | Explicitly excluded by spec (replaced by IPQA summary strip). |
| `src/components/NodeEarthGlobe.vue` & related | Globe Pro 3D globe modifications. | **DO NOT BRING OVER** | *None* | Maintain Emerald's original globe/cards. |

---

## 3. Router & Header Integration Points

### 3.1 Router Additions (`src/router/index.ts`)
Add isolated route definitions with lazy loading:
```ts
{
  path: '/resource-insights',
  name: 'resource-insights',
  component: () => import('@/features/resource-insights/pages/ResourceInsightsPage.vue'),
},
{
  path: '/cost-renewal',
  name: 'cost-renewal',
  component: () => import('@/features/cost-renewal/pages/CostRenewalPage.vue'),
},
{
  path: '/ip-quality/:uuid',
  name: 'ip-quality-detail',
  component: () => import('@/features/ipqa/pages/IpqaNodeDetailPage.vue'),
},
```

### 3.2 Header Actions (`src/components/Header.vue`)
Modify the header to render exactly four logical actions on the top right:
1. `[资源概览]` -> `/resource-insights` (`lucide:chart-no-axes-combined`)
2. `[成本与续费]` -> `/cost-renewal` (`lucide:wallet-cards`)
3. `[主题设置]` -> toggleTheme / theme modal (`lucide:palette` or existing theme icon)
4. `[设置]` -> jumpToSetting (`lucide:settings` or existing admin icon)

Preserve responsive collapse rules, aria labels, and active route indicators.

---

## 4. Theme Settings Schema Additions (`komari-theme.json`)

Add theme configuration keys for feature toggles under managed settings:
```json
{ "name": "资源与成本分析", "type": "title" },
{ "key": "resourceInsightsEnabled", "name": "启用资源概览", "type": "switch", "default": true, "help": "开启顶部资源概览入口与页面" },
{ "key": "costRenewalEnabled", "name": "启用成本与续费", "type": "switch", "default": true, "help": "开启顶部成本与续费入口与页面" },
{ "key": "resourceTrafficEnabled", "name": "显示流量趋势", "type": "switch", "default": true, "help": "在资源概览中显示每日流量趋势图表" },
{ "key": "resourceUptimeEnabled", "name": "显示30天在线率", "type": "switch", "default": true, "help": "在资源概览中显示近 30 天在线率统计" },
{ "key": "resourceCostSummaryEnabled", "name": "显示成本摘要", "type": "switch", "default": true, "help": "在资源概览中显示轻量成本摘要卡片" },
{ "name": "IP Quality (IPQA)", "type": "title" },
{ "key": "ipqaEnabled", "name": "启用 IPQA 模块", "type": "switch", "default": true, "help": "开启 IP Quality 综合展示与节点档案" },
{ "key": "ipqaShowFleetSummary", "name": "显示集群状态摘要", "type": "switch", "default": true, "help": "在 IPQA 区域顶部显示集群概况指标条" },
{ "key": "ipqaShowNodeGrid", "name": "显示节点卡片网格", "type": "switch", "default": true, "help": "显示各节点的 IPQA 状态卡片" },
{ "key": "ipqaShowRisk", "name": "显示风险评分矩阵", "type": "switch", "default": true, "help": "展示多源风险引擎评分矩阵" },
{ "key": "ipqaShowType", "name": "显示 IP 类型矩阵", "type": "switch", "default": true, "help": "展示使用场景与公司类型分类" },
{ "key": "ipqaShowFactors", "name": "显示安全因子矩阵", "type": "switch", "default": true, "help": "展示 Proxy / Tor / VPN / Server / Abuser / Robot 等因子" },
{ "key": "ipqaShowMedia", "name": "显示流媒体与 AI 解锁", "type": "switch", "default": true, "help": "展示流媒体与 AI 服务解锁状态与地区" },
{ "key": "ipqaShowMail", "name": "显示邮件连通与 DNSBL", "type": "switch", "default": true, "help": "展示 25 端口、邮件服务连通性与 DNS 黑名单" },
{ "key": "ipqaShowChanges", "name": "显示近期变动记录", "type": "switch", "default": true, "help": "展示节点属性变动时间线" },
{ "key": "ipqaShowHistory", "name": "显示历史归档与趋势", "type": "switch", "default": true, "help": "支持按日期回溯历史快照及趋势分析" },
{ "key": "ipqaShowRaw", "name": "显示原始 JSON 数据", "type": "switch", "default": false, "help": "在节点详情页提供展开查看原始 JSON 存档功能" },
{ "key": "ipqaShowNodeDetailSnapshot", "name": "在常规节点页显示快照", "type": "switch", "default": true, "help": "在常规 VPS 节点详情页中插入轻量 IP Quality 概览卡片" }
```

---

## 5. Reusable Test Suites from Fork2

Fork2 test suites to port and adapt:
1. `tests/phase1/dailyTrafficAggregator.test.ts` -> Traffic aggregation, timezone, counter reset, quality evaluation.
2. `tests/phase1/historyGateway.contract.test.ts` -> History RPC gateway fallback behavior.
3. `tests/phase1/trafficEvidence.test.ts` -> Evidence extraction from raw series/records.
4. `tests/phase4/trafficTrend.test.ts` -> Traffic trend view model calculations.
5. `tests/phase4/trafficTrendCache.test.ts` -> Cache validity and expiration.
6. `tests/phase6/trafficTrendAvailability.test.ts` -> Availability resolution under insufficient retention.
7. `tests/phase6/historyErrorPolicy.test.ts` -> Error classification.
8. `tests/phase3/renewal.test.ts` -> Renewal timeline sorting and filtering.
9. `tests/phase5/cost.test.ts` -> Cost view model and currency conversion.
10. `tests/phase5/appFinanceSettings.test.ts` -> Settings parsing and fallback currency.

---

## 6. License Attribution

```text
Resource analytics and cost/renewal implementation adapted from
allen0039/komari-theme-emerald-globe-pro (MIT License).
Copyright (c) 2024 allen0039
```
All adapted files will retain appropriate copyright notices.
