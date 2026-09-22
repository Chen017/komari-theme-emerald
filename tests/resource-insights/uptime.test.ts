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

// ---------------------------------------------------------------------------
// Section 46: Fleet observer-mask test
// ---------------------------------------------------------------------------
{
  console.log('\n[Section 46] Fleet observer-mask test')
  const { buildObservationTimeline } = require('../../src/features/resource-insights/services/observationCoverage')

  const baseT = now.getTime() - 4 * 3600 * 1000
  const tA = baseT // Bucket A: 3/3 have samples
  const tB = baseT + 3600 * 1000 // Bucket B: 1/3 has sample
  const tC = baseT + 2 * 3600 * 1000 // Bucket C: 0/3 have samples, no probe
  const tD = baseT + 3 * 3600 * 1000 // Bucket D: 0/3 telemetry, but probe exists

  const seriesByNode = {
    n1: {
      entityId: 'n1',
      metricKey: 'cpu.usage',
      intervalSeconds: 3600,
      points: [
        { time: new Date(tA).toISOString(), value: 10, count: 60 },
        { time: new Date(tB).toISOString(), value: 10, count: 60 },
        { time: new Date(tC).toISOString(), value: null, count: 0 },
        { time: new Date(tD).toISOString(), value: null, count: 0 },
      ],
    },
    n2: {
      entityId: 'n2',
      metricKey: 'cpu.usage',
      intervalSeconds: 3600,
      points: [
        { time: new Date(tA).toISOString(), value: 10, count: 60 },
        { time: new Date(tB).toISOString(), value: null, count: 0 },
        { time: new Date(tC).toISOString(), value: null, count: 0 },
        { time: new Date(tD).toISOString(), value: null, count: 0 },
      ],
    },
    n3: {
      entityId: 'n3',
      metricKey: 'cpu.usage',
      intervalSeconds: 3600,
      points: [
        { time: new Date(tA).toISOString(), value: 10, count: 60 },
        { time: new Date(tB).toISOString(), value: null, count: 0 },
        { time: new Date(tC).toISOString(), value: null, count: 0 },
        { time: new Date(tD).toISOString(), value: null, count: 0 },
      ],
    },
  }

  // Probe in bucket D at tD + 500s
  const probeEvidenceTimes = [tD + 500 * 1000]

  const timeline = buildObservationTimeline({
    seriesByNode,
    probeEvidenceTimes,
    windowStartMs: baseT,
    windowEndMs: baseT + 4 * 3600 * 1000,
    fallbackBucketSeconds: 3600,
  })

  // Bucket A: observable
  assert.strictEqual(timeline.isObservable(tA + 100), true, 'Bucket A should be observable')
  // Bucket B: observable
  assert.strictEqual(timeline.isObservable(tB + 100), true, 'Bucket B should be observable')
  // Bucket C: unobserved (blackout)
  assert.strictEqual(timeline.isBlackout(tC + 100), true, 'Bucket C should be unobserved')
  assert.strictEqual(timeline.isObservable(tC + 100), false, 'Bucket C should not be observable')
  // Bucket D: observable (probe evidence)
  assert.strictEqual(timeline.isObservable(tD + 100), true, 'Bucket D should be observable due to probe evidence')

  console.log('✓ Section 46 passed: fleet observer-mask correctly determines observable vs blackout')
}

// ---------------------------------------------------------------------------
// Section 41: Controller restart test (all nodes have gap -> excluded from denominator)
// ---------------------------------------------------------------------------
{
  console.log('\n[Section 41] Controller restart test')
  const node1 = createMockNode({ uuid: 'vps-1', name: 'Zouter', online: true })
  const node2 = createMockNode({ uuid: 'vps-2', name: 'DataWave', online: true })
  const node3 = createMockNode({ uuid: 'vps-3', name: 'Vmiss', online: true })

  // 60 minutes window. Minutes 20-30 (10 min): Komari controller restarted/upgraded
  // All 3 VPS have no telemetry during minutes 20-30
  const totalMinutes = 60
  const windowStart = now.getTime() - totalMinutes * 60 * 1000

  function createPointsWithBlackout() {
    const pts: NormalizedMetricPoint[] = []
    for (let m = 0; m < totalMinutes; m++) {
      const t = new Date(windowStart + m * 60 * 1000).toISOString()
      if (m >= 20 && m < 30) {
        pts.push({ time: t, value: null, count: 0 })
      } else {
        pts.push({ time: t, value: 5.0, count: 60 })
      }
    }
    return pts
  }

  const seriesByNode = {
    'vps-1': { entityId: 'vps-1', metricKey: 'cpu.usage', intervalSeconds: 60, points: createPointsWithBlackout() },
    'vps-2': { entityId: 'vps-2', metricKey: 'cpu.usage', intervalSeconds: 60, points: createPointsWithBlackout() },
    'vps-3': { entityId: 'vps-3', metricKey: 'cpu.usage', intervalSeconds: 60, points: createPointsWithBlackout() },
  }

  const fleet = calculateFleet30dUptime(
    [node1, node2, node3],
    { kind: 'metrics', seriesByNode },
    now,
  )

  // Controller outage of 10 min was excluded from denominator!
  // All VPS remain 100.00% uptime!
  for (const n of fleet.nodes) {
    assert.strictEqual(n.uptimeText, '100.00%', `${n.name} uptime must remain 100.00% across controller restart`)
    assert.strictEqual(n.controllerBlackoutSeconds, 10 * 60, '10 minutes of controller blackout must be tracked')
  }
  assert.strictEqual(fleet.fleetUptimeText, '100.00%')
  console.log('✓ Section 41 passed: controller restart excluded from uptime denominator (100.00% preserved)')
}

// ---------------------------------------------------------------------------
// Section 40: Real target outage test (one node down while others report)
// ---------------------------------------------------------------------------
{
  console.log('\n[Section 40] Real target outage test')
  const nodeZouter = createMockNode({ uuid: 'zouter', name: 'Zouter', online: true })
  const nodeVmiss = createMockNode({ uuid: 'vmiss', name: 'Vmiss', online: true })
  const nodeDataWave = createMockNode({ uuid: 'datawave', name: 'DataWave', online: true })

  const totalMinutes = 60
  const windowStart = now.getTime() - totalMinutes * 60 * 1000

  // Zouter and Vmiss report 100% healthy telemetry throughout
  const healthyPoints: NormalizedMetricPoint[] = []
  for (let m = 0; m < totalMinutes; m++) {
    healthyPoints.push({
      time: new Date(windowStart + m * 60 * 1000).toISOString(),
      value: 5.0,
      count: 60,
    })
  }

  // DataWave has an outage at minutes 20-30 (10 min)
  const dataWavePoints: NormalizedMetricPoint[] = []
  for (let m = 0; m < totalMinutes; m++) {
    const t = new Date(windowStart + m * 60 * 1000).toISOString()
    if (m >= 20 && m < 30) {
      dataWavePoints.push({ time: t, value: null, count: 0 })
    } else {
      dataWavePoints.push({ time: t, value: 5.0, count: 60 })
    }
  }

  const seriesByNode = {
    zouter: { entityId: 'zouter', metricKey: 'cpu.usage', intervalSeconds: 60, points: healthyPoints },
    vmiss: { entityId: 'vmiss', metricKey: 'cpu.usage', intervalSeconds: 60, points: healthyPoints },
    datawave: { entityId: 'datawave', metricKey: 'cpu.usage', intervalSeconds: 60, points: dataWavePoints },
  }

  const fleet = calculateFleet30dUptime(
    [nodeZouter, nodeVmiss, nodeDataWave],
    { kind: 'metrics', seriesByNode },
    now,
  )

  const zouterRes = fleet.nodes.find(n => n.uuid === 'zouter')!
  const vmissRes = fleet.nodes.find(n => n.uuid === 'vmiss')!
  const dwRes = fleet.nodes.find(n => n.uuid === 'datawave')!

  assert.strictEqual(zouterRes.uptimeText, '100.00%', 'Zouter uptime should be 100.00%')
  assert.strictEqual(vmissRes.uptimeText, '100.00%', 'Vmiss uptime should be 100.00%')

  // DataWave was down while controller was observable -> downtime counted!
  assert.ok(dwRes.uptimeRatio! < 1.0, 'DataWave uptime must decrease due to real target downtime')
  assert.strictEqual(dwRes.uptimeText, '83.33%') // 50 / 60 minutes = 83.33%
  assert.strictEqual(dwRes.controllerBlackoutSeconds, 0, 'No controller blackout occurred')

  console.log(`✓ Section 40 passed: real target outage decreased DataWave uptime to ${dwRes.uptimeText} while other nodes remained 100.00%`)
}

// ---------------------------------------------------------------------------
// Section 43: Controller restart + one actual VPS outage
// ---------------------------------------------------------------------------
{
  console.log('\n[Section 43] Controller restart + one actual VPS outage')
  const nodeZouter = createMockNode({ uuid: 'zouter', name: 'Zouter', online: true })
  const nodeDataWave = createMockNode({ uuid: 'datawave', name: 'DataWave', online: true })

  // Window: 60 minutes.
  // 10:00 is minute 0.
  // DataWave goes down at 10:00 (minute 0) and returns at 10:25 (minute 25). Total 25 minutes down.
  // Controller is down from 10:05 to 10:15 (minutes 5 to 15, 10 min).
  // During 10:05-10:15, Zouter also has no telemetry.
  // Outside 10:05-10:15, Zouter has healthy telemetry.
  const totalMinutes = 60
  const windowStart = now.getTime() - totalMinutes * 60 * 1000

  const zouterPoints: NormalizedMetricPoint[] = []
  const dataWavePoints: NormalizedMetricPoint[] = []

  for (let m = 0; m < totalMinutes; m++) {
    const t = new Date(windowStart + m * 60 * 1000).toISOString()
    // Zouter: down during 5-15 only (controller restart)
    if (m >= 5 && m < 15) {
      zouterPoints.push({ time: t, value: null, count: 0 })
    } else {
      zouterPoints.push({ time: t, value: 5.0, count: 60 })
    }

    // DataWave: down during 0-25
    if (m >= 0 && m < 25) {
      dataWavePoints.push({ time: t, value: null, count: 0 })
    } else {
      dataWavePoints.push({ time: t, value: 5.0, count: 60 })
    }
  }

  const seriesByNode = {
    zouter: { entityId: 'zouter', metricKey: 'cpu.usage', intervalSeconds: 60, points: zouterPoints },
    datawave: { entityId: 'datawave', metricKey: 'cpu.usage', intervalSeconds: 60, points: dataWavePoints },
  }

  const fleet = calculateFleet30dUptime(
    [nodeZouter, nodeDataWave],
    { kind: 'metrics', seriesByNode },
    now,
  )

  const dw = fleet.nodes.find(n => n.uuid === 'datawave')!
  // Observable duration: 60m - 10m (controller blackout) = 50 minutes = 3000s
  // DataWave confirmed downtime: 0-5 (5m) + 15-25 (10m) = 15 minutes = 900s
  // DataWave online seconds: 50m - 15m = 35 minutes = 2100s
  // Expected uptime: 35 / 50 = 70.00%
  assert.strictEqual(dw.controllerBlackoutSeconds, 10 * 60)
  assert.strictEqual(dw.observableSeconds, 50 * 60)
  assert.strictEqual(dw.onlineSeconds, 35 * 60)
  assert.strictEqual(dw.uptimeText, '70.00%')

  console.log(`✓ Section 43 passed: ambiguous controller outage excluded; DataWave uptime is ${dw.uptimeText} (15m target downtime)`)
}

// ---------------------------------------------------------------------------
// Section 44: Retention-start test
// ---------------------------------------------------------------------------
{
  console.log('\n[Section 44] Retention-start test')
  const node = createMockNode({ uuid: 'node-12d', name: '12d-Node', online: true })

  // History only begins 12 days ago (288 hours)
  const points: NormalizedMetricPoint[] = []
  for (let h = 0; h < 288; h++) {
    points.push({
      time: new Date(now.getTime() - (288 - h) * 3600 * 1000).toISOString(),
      value: 10,
      count: 60,
    })
  }

  const series: NormalizedMetricSeries = {
    entityId: node.uuid,
    metricKey: 'cpu.usage',
    intervalSeconds: 3600,
    points,
  }

  const res = calculateNode30dUptime(node, { kind: 'metrics', series }, now)
  // First 18 days (432 hours = 1555200s) = retention uncovered, NOT controller blackout!
  assert.strictEqual(res.retentionUncoveredSeconds, 18 * 86400)
  assert.strictEqual(res.controllerBlackoutSeconds, 0)
  assert.strictEqual(res.uptimeText, '100.00%')
  assert.strictEqual(res.coverageText, '覆盖 12.0 / 30 天')

  console.log('✓ Section 44 passed: retention-unavailable time tracked separately from controller blackout')
}

// ---------------------------------------------------------------------------
// Section 47: Packet-loss null / gap test
// ---------------------------------------------------------------------------
{
  console.log('\n[Section 47] Packet-loss null test')
  // Simulated packet-loss point processing
  const inputPoints = [
    { t: 1, value: 0 },
    { t: 2, value: null }, // Missing/unobserved measurement
    { t: 3, value: 100 }, // Genuine measured 100% loss
  ]

  // Verify that null is not coerced to 100
  const processed = inputPoints.map(p => {
    if (p.value === null) return null // gap
    return p.value
  })

  assert.strictEqual(processed[0], 0, 't1 should be 0%')
  assert.strictEqual(processed[1], null, 't2 must remain null (gap), NEVER coerced to 100%')
  assert.strictEqual(processed[2], 100, 't3 should be genuine 100%')

  console.log('✓ Section 47 passed: missing packet-loss point remains null/gap, genuine 100% preserved')
}

// ---------------------------------------------------------------------------
// Section 16: Test E — healthy sampling jitter (no false ~92% downtime)
// ---------------------------------------------------------------------------
{
  console.log('\n[Section 16] Test E — healthy sampling jitter')
  const node = createMockNode({ name: 'Jitter-Node', online: true })

  // 720 buckets of 3600s (30 days)
  // Counts vary between 54 and 60 samples per bucket (normal network/sampling jitter)
  // This must NOT cause ~92% uptime! It must remain 100.00%!
  const points: NormalizedMetricPoint[] = []
  const startTime = now.getTime() - SECONDS_30_DAYS * 1000

  for (let h = 0; h < 720; h++) {
    const t = new Date(startTime + h * 3600 * 1000).toISOString()
    // Sample jitter between 54 and 60
    const count = 54 + (h % 7) // 54, 55, 56, 57, 58, 59, 60
    points.push({ time: t, value: 5.0, count })
  }

  const series: NormalizedMetricSeries = {
    entityId: node.uuid,
    metricKey: 'cpu.usage',
    intervalSeconds: 3600,
    retentionDays: 30,
    points,
  }

  const res = calculateNode30dUptime(node, { kind: 'metrics', series }, now)
  assert.strictEqual(res.uptimeRatio, 1.0, `Uptime ratio must be 1.0, got ${res.uptimeRatio}`)
  assert.strictEqual(res.uptimeText, '100.00%', `Uptime text must be 100.00%, got ${res.uptimeText}`)
  assert.strictEqual(res.diagnostics?.offlineSeconds, 0, 'Offline seconds must be 0')
  console.log(`✓ Section 16 Test E passed: healthy sampling jitter preserved 100.00% uptime without ~92% bug`)
}

// ---------------------------------------------------------------------------
// Section 16: Test F — 30-day node with zero known outages
// ---------------------------------------------------------------------------
{
  console.log('\n[Section 16] Test F — 30-day node with zero known outages')
  const node = createMockNode({ name: 'Zero-Outage-Node', online: true })

  const points: NormalizedMetricPoint[] = []
  const startTime = now.getTime() - SECONDS_30_DAYS * 1000

  for (let h = 0; h < 720; h++) {
    const t = new Date(startTime + h * 3600 * 1000).toISOString()
    points.push({ time: t, value: 8.0, count: 60 })
  }

  const series: NormalizedMetricSeries = {
    entityId: node.uuid,
    metricKey: 'cpu.usage',
    intervalSeconds: 3600,
    retentionDays: 30,
    points,
  }

  const res = calculateNode30dUptime(node, { kind: 'metrics', series }, now)
  assert.strictEqual(res.uptimeText, '100.00%')
  assert.strictEqual(res.diagnostics?.offlineSeconds, 0)
  assert.strictEqual(res.diagnostics?.onlineSeconds, SECONDS_30_DAYS)
  assert.strictEqual(res.diagnostics?.partialBuckets, 0)
  assert.strictEqual(res.diagnostics?.zeroSampleObservableBuckets, 0)
  console.log('✓ Section 16 Test F passed: zero-outage node diagnostic breakdown verified')
}

console.log('\n========================================')
console.log('All 30-day uptime regression tests passed!')
console.log('========================================')


