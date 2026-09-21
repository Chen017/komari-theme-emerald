import assert from 'node:assert'
import type { NodeData } from '../../src/stores/nodes'
import type { NormalizedMetricPoint, NormalizedMetricSeries, RawStatusRecord } from '../../src/features/resource-insights/types/history'
import {
  calculateFleet30dUptime,
  calculateNode30dUptime,
  calculateNode30dUptimeFromMetrics,
  calculateNode30dUptimeFromRecords,
  SECONDS_30_DAYS,
} from '../../src/features/resource-insights/services/uptime'

console.log('--- Running 30-day uptime calculation tests ---')

const now = new Date('2026-09-22T08:00:00Z')

// Helper to create basic NodeData
function createMockNode(overrides: Partial<NodeData> = {}): NodeData {
  return {
    uuid: 'node-test-1',
    name: 'Test Node',
    online: true,
    uptime: 3600,
    cpu: 10,
    mem: 20,
    swap: 0,
    load: 0.5,
    disk: 30,
    net_in: 100,
    net_out: 100,
    tcp: 10,
    udp: 5,
    process: 50,
    thread: 100,
    updated_at: now.toISOString(),
    ...overrides,
  } as NodeData
}

// ---------------------------------------------------------------------------
// Section 19: Regression test — exact reported bug
// ---------------------------------------------------------------------------
{
  console.log('\n[Section 19] Exact reported bug regression test')
  const node = createMockNode({ name: 'Zouter', online: true, uptime: 86400 })

  // 1. VPS is online with normal samples
  // 2. VPS is powered off for ~10 minutes (gap / reduced sample count)
  // 3. VPS is powered on again
  // Step size: 60s per bucket for high resolution testing
  const points: NormalizedMetricPoint[] = []
  const totalMinutes = 60 // 1 hour test window
  const windowStart = now.getTime() - totalMinutes * 60 * 1000

  for (let m = 0; m < totalMinutes; m++) {
    const t = new Date(windowStart + m * 60 * 1000).toISOString()
    // Downtime: minutes 20 to 29 (10 minutes outage)
    if (m >= 20 && m < 30) {
      points.push({ time: t, value: null, count: 0 })
    }
    else {
      points.push({ time: t, value: 5.0, count: 60 }) // 60 samples per minute
    }
  }

  const series: NormalizedMetricSeries = {
    entityId: node.uuid,
    metricKey: 'cpu.usage',
    intervalSeconds: 60,
    retentionDays: 30,
    points,
  }

  // Calculate while just reconnected (uptime drops below 100%)
  const res1 = calculateNode30dUptime(node, { kind: 'metrics', series }, now)
  assert.ok(res1.uptimeRatio !== null, 'uptimeRatio should not be null')
  assert.ok(res1.uptimeRatio < 1.0, `Uptime must be < 100% after 10m outage, got ${res1.uptimeText}`)
  assert.notStrictEqual(res1.uptimeText, '100.00%', 'uptimeText must not be 100.00%')

  // Now simulate node reboot: node.uptime reset to 120s (just booted), still online
  const rebootedNode = createMockNode({ ...node, uptime: 120, online: true })
  const res2 = calculateNode30dUptime(rebootedNode, { kind: 'metrics', series }, now)
  assert.strictEqual(
    res2.uptimeRatio,
    res1.uptimeRatio,
    'Uptime ratio must NOT jump back to 100% after reboot/reconnect!',
  )
  assert.strictEqual(res2.uptimeText, res1.uptimeText)
  console.log(`✓ Section 19 passed: uptime after reboot remains ${res2.uptimeText} (< 100%)`)
}

// ---------------------------------------------------------------------------
// Section 20: Test — complete 30-day history with 10 minutes downtime
// ---------------------------------------------------------------------------
{
  console.log('\n[Section 20] Complete 30-day history with 10 minutes downtime')
  const node = createMockNode({ name: '30d-Node', online: true })

  // 30 days = 720 hours = 720 buckets of 3600s
  // Expected count per hour = 60 (1 sample/min)
  // In one bucket, 10 minutes missing -> 50 samples instead of 60
  const points: NormalizedMetricPoint[] = []
  const startTime = now.getTime() - SECONDS_30_DAYS * 1000

  for (let h = 0; h < 720; h++) {
    const t = new Date(startTime + h * 3600 * 1000).toISOString()
    if (h === 100) {
      // 10 minutes downtime in this 1-hour bucket (50 min online = count 50)
      points.push({ time: t, value: 12.0, count: 50 })
    }
    else {
      points.push({ time: t, value: 12.0, count: 60 })
    }
  }

  const series: NormalizedMetricSeries = {
    entityId: node.uuid,
    metricKey: 'cpu.usage',
    intervalSeconds: 3600,
    retentionDays: 30,
    points,
  }

  const res = calculateNode30dUptime(node, { kind: 'metrics', series }, now)
  assert.strictEqual(res.status, 'complete')
  assert.strictEqual(res.coverageText, '30 / 30 天')
  // 43200 total minutes, 10 minutes down -> 43190 / 43200 ≈ 0.9997685 -> 99.98%
  assert.ok(Math.abs(res.uptimeRatio! - 0.9997685) < 0.0001, `Expected ~0.9997685, got ${res.uptimeRatio}`)
  assert.strictEqual(res.uptimeText, '99.98%')
  console.log(`✓ Section 20 passed: complete 30d uptime with 10m down = ${res.uptimeText} (${res.uptimeRatio})`)
}

// ---------------------------------------------------------------------------
// Section 21: Test — partial retention (12 days history, 10 minutes downtime)
// ---------------------------------------------------------------------------
{
  console.log('\n[Section 21] Partial retention (12 days history, 10m downtime)')
  const node = createMockNode({ name: '12d-Node', online: true })

  // 12 days = 288 hours of 3600s buckets
  const points: NormalizedMetricPoint[] = []
  const startTime = now.getTime() - 12 * 86400 * 1000

  for (let h = 0; h < 288; h++) {
    const t = new Date(startTime + h * 3600 * 1000).toISOString()
    if (h === 50) {
      // 10 min outage
      points.push({ time: t, value: 10.0, count: 50 })
    }
    else {
      points.push({ time: t, value: 10.0, count: 60 })
    }
  }

  const series: NormalizedMetricSeries = {
    entityId: node.uuid,
    metricKey: 'cpu.usage',
    intervalSeconds: 3600,
    retentionDays: 12,
    points,
  }

  const res = calculateNode30dUptime(node, { kind: 'metrics', series }, now)
  assert.strictEqual(res.status, 'partial')
  assert.ok(res.coverageText.includes('覆盖 12.0 / 30 天'), `Coverage text was ${res.coverageText}`)
  assert.ok(res.uptimeRatio! < 1.0, 'Uptime ratio must be < 100% due to 10m outage')
  // 12 days = 17280 min, 10 min down -> 17270 / 17280 ≈ 0.99942 -> 99.94%
  assert.strictEqual(res.uptimeText, '99.94%')
  console.log(`✓ Section 21 passed: partial retention = ${res.coverageText}, uptime = ${res.uptimeText}`)
}

// ---------------------------------------------------------------------------
// Section 22: Test — newly added node (2 days ago, no outage)
// ---------------------------------------------------------------------------
{
  console.log('\n[Section 22] Newly added node (2 days ago, no outage)')
  const node = createMockNode({ name: 'New-Node', online: true })

  // 2 days = 48 hours of 3600s buckets, all healthy
  const points: NormalizedMetricPoint[] = []
  const startTime = now.getTime() - 2 * 86400 * 1000

  for (let h = 0; h < 48; h++) {
    const t = new Date(startTime + h * 3600 * 1000).toISOString()
    points.push({ time: t, value: 15.0, count: 60 })
  }

  const series: NormalizedMetricSeries = {
    entityId: node.uuid,
    metricKey: 'cpu.usage',
    intervalSeconds: 3600,
    retentionDays: 2,
    points,
  }

  const res = calculateNode30dUptime(node, { kind: 'metrics', series }, now)
  assert.strictEqual(res.status, 'partial')
  assert.ok(res.coverageText.includes('覆盖 2.0 / 30 天'), `Coverage text was ${res.coverageText}`)
  // Previous 28 days must NOT be counted as downtime!
  assert.strictEqual(res.uptimeRatio, 1.0)
  assert.strictEqual(res.uptimeText, '100.00%')
  console.log(`✓ Section 22 passed: newly added node uptime = ${res.uptimeText}, coverage = ${res.coverageText}`)
}

// ---------------------------------------------------------------------------
// Section 23: Test — full offline bucket (count = 0, value = null)
// ---------------------------------------------------------------------------
{
  console.log('\n[Section 23] Full offline bucket')
  const node = createMockNode({ name: 'Full-Offline-Bucket' })

  // 3 buckets: 1 online, 1 offline (count=0, value=null), 1 online
  const bucketSec = 3600
  const startTime = now.getTime() - 3 * bucketSec * 1000
  const points: NormalizedMetricPoint[] = [
    { time: new Date(startTime).toISOString(), value: 20, count: 60 },
    { time: new Date(startTime + bucketSec * 1000).toISOString(), value: null, count: 0 },
    { time: new Date(startTime + 2 * bucketSec * 1000).toISOString(), value: 20, count: 60 },
  ]

  const series: NormalizedMetricSeries = {
    entityId: node.uuid,
    metricKey: 'cpu.usage',
    intervalSeconds: bucketSec,
    points,
  }

  const res = calculateNode30dUptime(node, { kind: 'metrics', series }, now)
  // 2 out of 3 buckets online -> 2/3 ≈ 0.6667
  assert.ok(Math.abs(res.uptimeRatio! - 2 / 3) < 0.01, `Expected ~0.6667, got ${res.uptimeRatio}`)
  console.log(`✓ Section 23 passed: full offline bucket yielded expected fraction (ratio=${res.uptimeRatio})`)
}

// ---------------------------------------------------------------------------
// Section 24: Test — partial bucket outage (count = 400, expected = 600)
// ---------------------------------------------------------------------------
{
  console.log('\n[Section 24] Partial bucket outage (count = 400, expected = 600)')
  const node = createMockNode({ name: 'Partial-Bucket-Node' })

  // 5 buckets of 3600s:
  // 4 healthy buckets with count = 600
  // 1 bucket with count = 400 (even though value is non-null)
  const bucketSec = 3600
  const startTime = now.getTime() - 5 * bucketSec * 1000
  const points: NormalizedMetricPoint[] = [
    { time: new Date(startTime).toISOString(), value: 10, count: 600 },
    { time: new Date(startTime + bucketSec * 1000).toISOString(), value: 10, count: 600 },
    { time: new Date(startTime + 2 * bucketSec * 1000).toISOString(), value: 10, count: 400 }, // partial outage: 400/600 = 0.6667
    { time: new Date(startTime + 3 * bucketSec * 1000).toISOString(), value: 10, count: 600 },
    { time: new Date(startTime + 4 * bucketSec * 1000).toISOString(), value: 10, count: 600 },
  ]

  const series: NormalizedMetricSeries = {
    entityId: node.uuid,
    metricKey: 'cpu.usage',
    intervalSeconds: bucketSec,
    points,
  }

  const res = calculateNode30dUptime(node, { kind: 'metrics', series }, now)
  // Total online = 1 + 1 + (400/600) + 1 + 1 = 4.6667 buckets out of 5 -> 4.6667 / 5 = 0.9333
  const expectedRatio = (4 + 400 / 600) / 5
  assert.ok(Math.abs(res.uptimeRatio! - expectedRatio) < 0.001, `Expected ${expectedRatio}, got ${res.uptimeRatio}`)
  console.log(`✓ Section 24 passed: partial bucket outage ratio = ${res.uptimeRatio} (~${res.uptimeText})`)
}

// ---------------------------------------------------------------------------
// Section 25: Test — reboot/current uptime must not affect history
// ---------------------------------------------------------------------------
{
  console.log('\n[Section 25] Reboot/current uptime must not affect history')
  const baseNode = createMockNode({ name: 'Reboot-Node', online: true })

  // 10 buckets, 1 bucket completely down
  const bucketSec = 3600
  const startTime = now.getTime() - 10 * bucketSec * 1000
  const points: NormalizedMetricPoint[] = []
  for (let i = 0; i < 10; i++) {
    const t = new Date(startTime + i * bucketSec * 1000).toISOString()
    if (i === 3) {
      points.push({ time: t, value: null, count: 0 })
    }
    else {
      points.push({ time: t, value: 10, count: 60 })
    }
  }

  const series: NormalizedMetricSeries = {
    entityId: baseNode.uuid,
    metricKey: 'cpu.usage',
    intervalSeconds: bucketSec,
    points,
  }

  // Node with uptime = 120 (just rebooted)
  const nodeBoot120 = createMockNode({ ...baseNode, uptime: 120, online: true })
  const res1 = calculateNode30dUptime(nodeBoot120, { kind: 'metrics', series }, now)

  // Node with uptime = 864000 (running for 10 days)
  const nodeBoot10d = createMockNode({ ...baseNode, uptime: 864000, online: true })
  const res2 = calculateNode30dUptime(nodeBoot10d, { kind: 'metrics', series }, now)

  assert.strictEqual(res1.uptimeRatio, res2.uptimeRatio)
  assert.strictEqual(res1.uptimeText, res2.uptimeText)
  assert.ok(res1.uptimeRatio! < 1.0, 'Historical downtime must be preserved regardless of node.uptime')
  console.log(`✓ Section 25 passed: uptime unaffected by node.uptime (${res1.uptimeText})`)
}

// ---------------------------------------------------------------------------
// Section 26: Test — no history
// ---------------------------------------------------------------------------
{
  console.log('\n[Section 26] No history (Metric Store empty & legacy empty)')
  const onlineNode = createMockNode({ name: 'No-History-Online', online: true, uptime: 86400 })

  // 1. Metric Store empty
  const resMetrics = calculateNode30dUptime(onlineNode, { kind: 'metrics', series: undefined }, now)
  assert.strictEqual(resMetrics.uptimeRatio, null)
  assert.strictEqual(resMetrics.uptimeText, '--')
  assert.strictEqual(resMetrics.status, 'unavailable')
  assert.strictEqual(resMetrics.coverageText, '无历史数据')

  // 2. Legacy records empty
  const resLegacy = calculateNode30dUptime(onlineNode, { kind: 'records', records: [] }, now)
  assert.strictEqual(resLegacy.uptimeRatio, null)
  assert.strictEqual(resLegacy.uptimeText, '--')
  assert.strictEqual(resLegacy.status, 'unavailable')
  assert.strictEqual(resLegacy.coverageText, '无历史数据')

  console.log('✓ Section 26 passed: no history returns -- / 无历史数据, never 100%')
}

// ---------------------------------------------------------------------------
// Section 27: Test — legacy fallback
// ---------------------------------------------------------------------------
{
  console.log('\n[Section 27] Legacy fallback with 10-minute gap')
  const node = createMockNode({ name: 'Legacy-Node', online: true, uptime: 300 })

  // 24 hours of legacy records every 60 seconds, with a 10-minute gap in the middle
  const records: RawStatusRecord[] = []
  const startTime = now.getTime() - 24 * 3600 * 1000
  for (let t = startTime; t <= now.getTime(); t += 60 * 1000) {
    // 10-minute gap between hour 5 and hour 5:10
    const offsetMin = (t - startTime) / (60 * 1000)
    if (offsetMin >= 300 && offsetMin < 310) {
      continue
    }
    records.push({
      time: new Date(t).toISOString(),
      cpu: 10,
      mem: 20,
    })
  }

  const res = calculateNode30dUptime(node, { kind: 'records', records }, now)
  assert.strictEqual(res.source, 'legacy')
  assert.ok(res.uptimeRatio !== null)
  assert.ok(res.uptimeRatio < 1.0, `Legacy uptime must detect gap, got ${res.uptimeText}`)
  assert.notStrictEqual(res.uptimeText, '100.00%')

  // Even if node.uptime changes / node rebooted, legacy uptime remains < 100%
  const rebooted = createMockNode({ ...node, uptime: 10, online: true })
  const resReboot = calculateNode30dUptime(rebooted, { kind: 'records', records }, now)
  assert.strictEqual(resReboot.uptimeRatio, res.uptimeRatio)
  console.log(`✓ Section 27 passed: legacy fallback detected gap, uptime = ${res.uptimeText}`)
}

// ---------------------------------------------------------------------------
// Section 28: Test — Metric Store preferred over legacy
// ---------------------------------------------------------------------------
{
  console.log('\n[Section 28] Metric Store preferred over legacy')
  const node = createMockNode({ name: 'Dual-Source-Node', online: true })

  const series: NormalizedMetricSeries = {
    entityId: node.uuid,
    metricKey: 'cpu.usage',
    intervalSeconds: 3600,
    points: [
      { time: new Date(now.getTime() - 3600 * 1000).toISOString(), value: 10, count: 60 },
      { time: now.toISOString(), value: 10, count: 60 },
    ],
  }

  const fleet = calculateFleet30dUptime([node], { kind: 'metrics', seriesByNode: { [node.uuid]: series } }, now)
  assert.strictEqual(fleet.source, 'metrics')
  assert.strictEqual(fleet.nodes[0]!.source, 'metrics')
  console.log('✓ Section 28 passed: Metric Store is preferred (source=metrics)')
}

// ---------------------------------------------------------------------------
// Fleet tests
// ---------------------------------------------------------------------------
{
  console.log('\n[Fleet Tests] Multi-node aggregation')
  const nodeA = createMockNode({ uuid: 'a', name: 'Node A' })
  const nodeB = createMockNode({ uuid: 'b', name: 'Node B' })
  const nodeC = createMockNode({ uuid: 'c', name: 'Node C' })

  // Node A: complete 30d, 100%
  const pointsA: NormalizedMetricPoint[] = []
  for (let h = 0; h < 720; h++) {
    pointsA.push({
      time: new Date(now.getTime() - (720 - h) * 3600 * 1000).toISOString(),
      value: 10,
      count: 60,
    })
  }
  const seriesA: NormalizedMetricSeries = {
    entityId: 'a',
    metricKey: 'cpu.usage',
    intervalSeconds: 3600,
    points: pointsA,
  }

  // Node B: partial 10d, 100%
  const pointsB: NormalizedMetricPoint[] = []
  for (let h = 0; h < 240; h++) {
    pointsB.push({
      time: new Date(now.getTime() - (240 - h) * 3600 * 1000).toISOString(),
      value: 10,
      count: 60,
    })
  }
  const seriesB: NormalizedMetricSeries = {
    entityId: 'b',
    metricKey: 'cpu.usage',
    intervalSeconds: 3600,
    points: pointsB,
  }

  // Node C: unavailable (no points)
  const fleet = calculateFleet30dUptime(
    [nodeA, nodeB, nodeC],
    { kind: 'metrics', seriesByNode: { a: seriesA, b: seriesB } },
    now,
  )

  assert.strictEqual(fleet.totalNodes, 3)
  assert.strictEqual(fleet.completeNodes, 1)
  assert.strictEqual(fleet.partialNodes, 1)
  assert.strictEqual(fleet.unavailableNodes, 1)
  assert.strictEqual(fleet.fleetUptimeText, '100.00%')
  console.log('✓ Fleet aggregation passed successfully')
}

console.log('\n========================================')
console.log('All 30-day uptime regression tests passed!')
console.log('========================================')
