import assert from 'node:assert'
import {
  calculateFleet30dUptime,
  calculateNode30dUptime,
  MAX_HEARTBEAT_GAP_SECONDS,
  SECONDS_30_DAYS,
} from '../../src/features/resource-insights/services/uptime'

console.log('--- Running 30-day uptime calculation tests ---')

const now = new Date('2026-09-21T12:00:00Z')

// 1. Complete coverage (30 full days of samples)
{
  const node: any = {
    uuid: 'node-complete',
    name: 'Complete Node',
    online: true,
    uptime: SECONDS_30_DAYS,
  }

  // Generate records spanning exactly 30 days every 2 minutes
  const records: any[] = []
  const startTime = now.getTime() - SECONDS_30_DAYS * 1000
  for (let t = startTime; t <= now.getTime(); t += 120 * 1000) {
    records.push({
      time: new Date(t).toISOString(),
      cpu: 10,
      mem: 20,
    })
  }

  const result = calculateNode30dUptime(node, records, now)
  assert.strictEqual(result.status, 'complete', 'Coverage >= 95% should be complete')
  assert.strictEqual(result.coverageText, '30 / 30 天')
  assert.ok(result.uptimeRatio! >= 0.999, 'Uptime ratio should be ~100%')
  assert.strictEqual(result.uptimeText, '100.00%')
  console.log('✓ Complete 30-day coverage test passes')
}

// 2. Partial coverage (e.g. 10 days of samples)
{
  const node: any = {
    uuid: 'node-partial',
    name: 'Partial Node',
    online: true,
    uptime: 10 * 86400,
  }

  const records: any[] = []
  const startTime = now.getTime() - 10 * 86400 * 1000
  for (let t = startTime; t <= now.getTime(); t += 120 * 1000) {
    records.push({
      time: new Date(t).toISOString(),
      cpu: 10,
      mem: 20,
    })
  }

  const result = calculateNode30dUptime(node, records, now)
  assert.strictEqual(result.status, 'partial', '10 days coverage should be partial')
  assert.ok(result.coverageText.includes('覆盖 10.0 / 30 天'), `Coverage text should be 覆盖 10.0 / 30 天, got ${result.coverageText}`)
  assert.strictEqual(result.uptimeText, '100.00%')
  console.log('✓ Partial coverage test passes')
}

// 3. Downtime detection with gaps > MAX_HEARTBEAT_GAP_SECONDS
{
  const node: any = {
    uuid: 'node-gap',
    name: 'Gap Node',
    online: true,
  }

  // 2 records separated by 2 hours (offline for 2 hours)
  const startTime = now.getTime() - 24 * 3600 * 1000
  const records = [
    { time: new Date(startTime).toISOString() },
    { time: new Date(startTime + 60 * 1000).toISOString() }, // 1 min online
    { time: new Date(startTime + 7200 * 1000).toISOString() }, // 2 hr gap (offline)
    { time: new Date(now.getTime()).toISOString() }, // gap to now
  ]

  const result = calculateNode30dUptime(node, records, now)
  // Only the 60s gap should count as online
  assert.ok(result.uptimeRatio! < 0.1, 'Uptime ratio should be very low due to large gap')
  console.log('✓ Large heartbeat gap correctly treated as downtime')
}

// 4. Offline node with no history
{
  const node: any = {
    uuid: 'node-offline',
    name: 'Offline Node',
    online: false,
    uptime: 0,
  }

  const result = calculateNode30dUptime(node, [], now)
  assert.strictEqual(result.status, 'unavailable')
  assert.strictEqual(result.uptimeText, '离线')
  console.log('✓ Offline node with no history passes')
}

// 5. Fleet aggregation weighted by coverage
{
  const nodeA: any = { uuid: 'a', name: 'A', online: true, uptime: SECONDS_30_DAYS }
  const nodeB: any = { uuid: 'b', name: 'B', online: true, uptime: SECONDS_30_DAYS }

  const fleet = calculateFleet30dUptime([nodeA, nodeB], {}, now)
  assert.strictEqual(fleet.totalNodes, 2)
  assert.strictEqual(fleet.fleetUptimeText, '100.00%')
  assert.strictEqual(fleet.completeNodes, 2)
  console.log('✓ Fleet aggregation test passes')
}

console.log('All uptime tests passed successfully!')
