# Komari Emerald — Resource Insights Small Cleanup Plan

> Repository: `Chen017/komari-theme-emerald`
>
> Current baseline: `master` around commit `d2952e0`
>
> Scope: **small correctness + hygiene pass only**
>
> Do **not** do another architecture rewrite.
>
> The current `availability/` and `traffic/` module split is already acceptable.

---

# 1. Goal

The major refactor is already complete.

This pass should only fix a handful of remaining issues:

```text
Availability
1. 0 coverage must not visually look like 100% uptime.
2. 404 plugin-missing must be distinguished from 502/503/server failures.
3. Support nullable uptimeRatio from the plugin.

Traffic
4. Capability query failure must not pretend retentionDays = 1.
5. Metric definition parsing should use the real Komari contract only.
6. Coarse cross-midnight buckets must not be force-assigned to a day.
```

No new abstractions.

No new fallback layers.

---

# 2. Current Good State — Do Not Disturb

Keep:

```text
availability/
  api.ts
  types.ts
  useAvailability30d.ts
  Availability30dCard.vue

traffic/
  api.ts
  types.ts
  calendar.ts
  aggregate.ts
  useTrafficTrend.ts
  TrafficTrendCard.vue
```

Do not reintroduce:

```text
historyGateway
observationCoverage
trafficTrendCache
trafficTrendRequestPool
metricDiagnostics
common:getRecords fallback
CPU-derived uptime
```

---

# Part A — Availability UI Cleanup

# 3. Problem A1 — `0 / 30 天` should not look like `100.00%`

Current screenshot can show:

```text
Fleet 100.00%
Zouter 100.00%
覆盖 0 / 30 天
```

This is misleading.

A freshly installed Availability History plugin has almost no historical coverage.

The UI should not visually imply:

```text
past 30 days were 100% online
```

when there is effectively no historical evidence.

---

# 4. Desired Availability Display Semantics

Use:

```text
observableSeconds <= 0
→ uptime = unknown
→ display "--"
```

For very small non-zero coverage:

Recommended threshold:

```text
coverageDays < 1
→ uptime may be computed internally
→ do not present it as a mature 30-day statistic
```

Preferred display:

```text
Zouter       --
覆盖 <1 / 30 天
```

After at least one day:

```text
Zouter       100.00%
覆盖 1.0 / 30 天
```

This avoids false precision during initial tracking.

---

# 5. Implement Coverage Formatting

In:

```text
availability/useAvailability30d.ts
```

do not round:

```ts
0.2 days
```

into a visually confusing:

```text
0 / 30 天
```

Use:

```ts
function formatCoverageDays(seconds: number): string
```

Suggested behavior:

```text
0 seconds       → 未观测
0–1 day         → 覆盖 <1 / 30 天
>=1 day         → 覆盖 X.X / 30 天
```

Example:

```ts
if (seconds <= 0) {
  return '未观测'
}

const days = seconds / 86400

if (days < 1) {
  return '覆盖 <1 / 30 天'
}

return `覆盖 ${days.toFixed(1)} / 30 天`
```

---

# 6. Hide Uptime Under Minimal Coverage

Recommended:

```text
coverageDays < 1
→ uptimeText = '--'
→ uptimeRatio for UI = null
```

The plugin may still return a mathematically valid ratio.

The theme should distinguish:

```text
mathematically computable
```

from:

```text
worth displaying as a 30-day statistic
```

---

# 7. Fleet Uptime Should Follow Same Rule

Currently Fleet can show:

```text
Fleet 100.00%
```

immediately after install.

Change fleet aggregation so nodes with insufficient display coverage do not produce a visible Fleet percentage.

Recommended:

```text
if no node has >= 1 day observable history
→ Fleet badge hidden / "--"
```

Once valid tracked history exists:

```text
Fleet =
sum online seconds
/
sum observable seconds
```

Do not average node percentages.

---

# 8. Availability Footer

Current footer:

```text
30 天在线率 100.00%
```

should also disappear or show:

```text
30 天在线率 --
```

when history is immature.

Do not call a few minutes of tracking a "30 天在线率".

---

# Part B — Availability API Error Classification

# 9. Problem A2 — 404 and 502/503 are incorrectly merged

Current:

```ts
if (res.status === 404 || res.status === 502 || res.status === 503) {
  throw new AvailabilityPluginUnavailableError(...)
}
```

This means:

```text
plugin missing
```

and:

```text
reverse proxy / Komari temporarily unavailable
```

are shown as the same error.

That is incorrect.

---

# 10. Correct Classification

Use:

```text
404
→ plugin route not present
→ AvailabilityPluginUnavailableError

502 / 503
→ temporary server/API failure
→ AvailabilityApiError
```

Suggested:

```ts
if (res.status === 404) {
  throw new AvailabilityPluginUnavailableError(
    '在线率历史不可用：需要 Availability History 插件'
  )
}

if (res.status === 502 || res.status === 503) {
  throw new AvailabilityApiError(
    `在线率服务暂时不可用 (${res.status})`,
    res.status,
  )
}
```

Network failure also should not automatically mean plugin missing.

For:

```text
fetch failed
```

prefer:

```text
在线率接口连接失败
```

rather than:

```text
需要插件
```

unless 404 actually proves the route is missing.

---

# 11. Availability Error UI

Keep:

```text
unsupported
```

only for:

```text
plugin missing / route missing
```

Use:

```text
error
```

for:

```text
502
503
network failure
invalid JSON
invalid API contract
```

This makes future debugging much easier.

---

# Part C — Nullable `uptimeRatio`

# 12. Plugin Contract Update

The repaired Availability plugin should use:

```text
uptimeRatio = null
```

when:

```text
observableSeconds == 0
```

because:

```text
zero evidence != 100% uptime
```

The theme should support this cleanly.

---

# 13. Update Theme Type

Change:

```ts
uptimeRatio: number
```

to:

```ts
uptimeRatio: number | null
```

in:

```text
availability/types.ts
```

Then in:

```text
useAvailability30d.ts
```

handle:

```ts
summary.uptimeRatio === null
```

as:

```text
no uptime value
```

Do not multiply null.

---

# 14. `hasData` Rule

Recommended:

```ts
hasData =
  summary.observableSeconds > 0
  && summary.uptimeRatio !== null
```

Optional display threshold:

```text
hasDisplayData =
  observableSeconds >= 86400
```

Do not overload one boolean with both meanings unless needed.

Keep implementation simple.

---

# Part D — Traffic Capability Cleanup

# 15. Problem T1 — RPC failure pretends retention = 1 day

Current:

```ts
catch {
  return {
    retentionDays: 1,
    supports7d: false,
    supports30d: false
  }
}
```

This is semantically wrong.

It converts:

```text
RPC failed
```

into:

```text
server has exactly 1 day retention
```

These are completely different states.

---

# 16. Correct Behavior

`fetchTrafficCapability()` should throw on RPC failure.

Example:

```ts
export async function fetchTrafficCapability(
  call: RpcCall = defaultRpcCall,
): Promise<TrafficCapability> {
  const defs = await call<MetricDefinitionItem[]>(
    'public:listMetricDefinitions',
  )

  if (!Array.isArray(defs)) {
    throw new TrafficApiError(
      'public:listMetricDefinitions 响应无效',
    )
  }

  ...
}
```

No fake retention value.

---

# 17. Missing Definitions != RPC Failure

If RPC succeeds but:

```text
traffic.up
traffic.down
```

definitions are missing:

return:

```ts
{
  retentionDays: null,
  supports7d: false,
  supports30d: false,
}
```

Then UI may say:

```text
无法确定流量历史保留策略
```

Do not say:

```text
历史保留 1 天
```

unless the backend explicitly reports 1.

---

# 18. Capability Error State

If capability query fails:

```text
traffic card → error
```

Suggested text:

```text
无法读取 Metric Store 保留策略
```

Do not disable 30d based on fabricated data.

---

# Part E — Remove Legacy Metric Definition Guessing

# 19. Problem T2 — `MetricDefinitionItem` still contains legacy guesses

Current type:

```ts
interface MetricDefinitionItem {
  name?: string
  metric_key?: string
  key?: string
  retention_days?: number
}
```

Current parsing:

```ts
const name =
  item.name
  || item.metric_key
  || item.key
```

Komari 1.5.0-fix1 real contract is:

```text
name
retention_days
```

This compatibility guessing is no longer needed.

---

# 20. Simplify Type

Change to:

```ts
export interface MetricDefinitionItem {
  name: string
  retention_days: number
}
```

If defensive typing is desired:

```ts
export interface MetricDefinitionItem {
  name?: unknown
  retention_days?: unknown
}
```

but do not support unrelated alternate field names.

---

# 21. Strict Parsing

Use:

```ts
if (
  typeof item.name !== 'string'
  || typeof item.retention_days !== 'number'
) {
  continue
}
```

Then:

```ts
if (item.name === 'traffic.up') ...
if (item.name === 'traffic.down') ...
```

Delete:

```text
metric_key fallback
key fallback
```

---

# Part F — Coarse Traffic Bucket Correctness

# 22. Problem T3 — coarse cross-midnight bucket is still assigned to one day

Current `aggregate.ts` behavior:

```text
bucket crosses Beijing midnight
→ detect coarse
→ find day with largest overlap
→ assign entire value to that day anyway
```

This contradicts the intended rule:

```text
cannot accurately split
→ do not invent
```

Example:

```text
24h bucket = 24 GB
08:00 BJT → next day 08:00 BJT
```

Current code can assign all 24 GB to whichever local date has the largest overlap.

That is inaccurate.

---

# 23. Correct Coarse-Bucket Rule

If a metric interval:

```text
crosses Asia/Shanghai midnight
AND
cannot be exactly allocated
```

then:

```text
do not add pt.value to any day
```

Mark affected days / result as:

```text
coarse limitation
```

---

# 24. Suggested Aggregation Logic

For each point:

```text
calculate interval
find all overlapping Beijing days
```

If exactly one day overlaps:

```text
safe → add full value
```

If multiple days overlap:

```text
unsafe → skip allocation
set hasCoarseRollup = true
mark overlapping days as coarse
```

Do not use:

```text
maxOverlap winner
```

---

# 25. Do Not Require `> 1h` for Coarse Detection

The real condition is:

```text
interval overlaps more than one Beijing day
```

not:

```text
interval_seconds > 3600
```

A weirdly aligned interval could theoretically cross midnight even if shorter.

Use actual boundary overlap.

---

# 26. Day Quality

If a day has some valid points but also one or more skipped coarse cross-midnight points:

```text
quality = partial
isCoarse = true
```

If a day has no safely assignable data but only skipped coarse data:

```text
totalBytes = null
quality = missing or partial
isCoarse = true
```

Recommended:

```text
partial
```

if evidence exists but is unusable.

---

# 27. Warning Message

Keep:

```text
存在跨越午夜的粗粒度历史聚合，无法精确切分
```

But make it truthful by actually excluding those ambiguous values.

---

# Part G — Small UI Hygiene

# 28. 30-Day Tooltip

Current fallback:

```ts
retentionDays ?? 1
```

appears in user-visible text.

Remove fake fallback.

Use:

```ts
if (retentionDays === null) {
  return '无法确定当前 Metric Store 的流量历史保留天数'
}
```

Otherwise:

```text
当前 Komari 仅保留 X 天流量历史
```

---

# 29. Unsupported Message

Same rule in:

```text
useTrafficTrend.ts
```

Do not generate:

```text
当前 Komari 仅保留 1 天
```

from `null`.

Use:

```text
retention unknown
```

as a separate message.

---

# 30. Keep Card Root Mounted

Do not change this.

Current design:

```text
TrafficTrendCard root always mounted
```

is correct.

Do not reintroduce conditional card removal.

---

# Part H — Tests

# 31. Availability Tests

Add:

### Case A

```text
observableSeconds = 0
uptimeRatio = null
```

Expected:

```text
uptimeText = --
Fleet hidden / --
coverage = 未观测
```

---

### Case B

```text
observableSeconds = 2 hours
uptimeRatio = 1
```

Expected:

```text
coverage = 覆盖 <1 / 30 天
uptime display = --
```

if adopting 1-day minimum display threshold.

---

### Case C

```text
observableSeconds = 1.5 days
uptimeRatio = 0.99
```

Expected:

```text
99.00%
覆盖 1.5 / 30 天
```

---

### Case D

HTTP:

```text
404
```

Expected:

```text
state = unsupported
```

---

### Case E

HTTP:

```text
503
```

Expected:

```text
state = error
```

not:

```text
unsupported
```

---

### Case F

Network failure.

Expected:

```text
state = error
```

---

# 32. Traffic Capability Tests

### Case G

`public:listMetricDefinitions` RPC throws.

Expected:

```text
TrafficApiError
```

No fake retention.

---

### Case H

RPC succeeds with:

```json
[
  { "name": "traffic.up", "retention_days": 30 },
  { "name": "traffic.down", "retention_days": 30 }
]
```

Expected:

```text
retentionDays = 30
supports7d = true
supports30d = true
```

---

### Case I

Definitions absent.

Expected:

```text
retentionDays = null
supports7d = false
supports30d = false
```

---

### Case J

Legacy fake fields only:

```json
[
  { "metric_key": "traffic.up", "retention_days": 30 }
]
```

Expected:

```text
ignored
```

This confirms old compatibility parsing is gone.

---

# 33. Traffic Aggregation Tests

### Case K — one-day aligned hourly point

Expected:

```text
full allocation
```

---

### Case L — bucket crosses Beijing midnight

Example:

```text
23:00 → 01:00
value = 100
```

Expected:

```text
100 is not assigned to either day
hasCoarseRollup = true
```

---

### Case M — one valid + one ambiguous bucket

Expected:

```text
valid amount retained
ambiguous amount skipped
day quality = partial
```

---

### Case N — only ambiguous buckets

Expected:

```text
no fabricated daily bytes
coarse warning visible
```

---

# Part I — Files To Touch

Expected files only:

```text
src/features/resource-insights/availability/api.ts
src/features/resource-insights/availability/types.ts
src/features/resource-insights/availability/useAvailability30d.ts
src/features/resource-insights/availability/Availability30dCard.vue

src/features/resource-insights/traffic/api.ts
src/features/resource-insights/traffic/types.ts
src/features/resource-insights/traffic/aggregate.ts
src/features/resource-insights/traffic/useTrafficTrend.ts
src/features/resource-insights/traffic/TrafficTrendCard.vue

tests/resource-insights/...
```

No unrelated files.

---

# Part J — Do Not Do

Do not:

```text
create new generic services
split calendar.ts just for line count
split TrafficTrendCard just for line count
add persistent cache
add request pool
add common:getRecords fallback
add Metric Store uptime fallback
change plugin architecture
change IPQA
change cost/renewal
```

---

# Part K — Acceptance Criteria

- [ ] Newly installed Availability plugin with 0 history does not show 100% uptime.
- [ ] `<1 day` coverage is displayed clearly.
- [ ] Fleet uptime is hidden/unknown until enough actual history exists.
- [ ] 404 means plugin unavailable.
- [ ] 502/503/network failures mean API error.
- [ ] Theme accepts `uptimeRatio: null`.
- [ ] Capability RPC failure does not become `retentionDays=1`.
- [ ] User-visible text never invents `1 day` retention from unknown.
- [ ] Metric definitions use `name` + `retention_days` only.
- [ ] Legacy `metric_key/key` compatibility parsing is removed.
- [ ] Cross-midnight coarse buckets are excluded, not assigned to a guessed day.
- [ ] Coarse warning remains visible.
- [ ] Single-node traffic card always remains mounted.
- [ ] Existing `7 天 / 30 天 / 本周期` behavior remains intact.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm build` passes.
- [ ] Resource Insights regression tests pass.

---

# 34. Final Rule

This is a **cleanup pass, not a refactor pass**.

The implementation should become slightly smaller and semantically clearer.

If the coding AI starts introducing new architectural layers to solve these six issues, stop and simplify.
