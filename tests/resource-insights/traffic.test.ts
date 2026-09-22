import type { MetricSeriesItem } from '../../src/features/resource-insights/traffic/types'
import assert from 'node:assert'
import { aggregateDailyTraffic } from '../../src/features/resource-insights/traffic/aggregate'
import { fetchTrafficCapability, TrafficApiError } from '../../src/features/resource-insights/traffic/api'
import {
  calculateResetWindow,
  getBeijingDates,
  parseResetMetadata,
} from '../../src/features/resource-insights/traffic/calendar'

// 1. Tag parsing: <TRD:27> and <TRTZ:America/New_York>
{
  const res1 = parseResetMetadata('web, <TRD:27>, <TRTZ:America/New_York>')
  assert.strictEqual(res1.resetDay, 27)
  assert.strictEqual(res1.resetTimezone, 'America/New_York')
  assert.strictEqual(res1.isFallbackTimezone, false)

  // Missing TRTZ falls back to Asia/Shanghai and marks isFallbackTimezone: true
  const res2 = parseResetMetadata('<TRD:15>')
  assert.strictEqual(res2.resetDay, 15)
  assert.strictEqual(res2.resetTimezone, 'Asia/Shanghai')
  assert.strictEqual(res2.isFallbackTimezone, true)

  // Invalid / no tags
  const res3 = parseResetMetadata('no tags here')
  assert.strictEqual(res3.resetDay, null)
}

// 2. Section 32 & 65: Timezone conversion and reset window calculation
{
  // Assume now is 2026-09-22 12:00 UTC (20:00 Beijing, 08:00 New York)
  const now = new Date('2026-09-22T12:00:00Z')

  // TRD = 15, TRTZ = America/New_York
  // On 2026-09-22, in New York, day is 22 >= 15.
  // Cycle started 2026-09-15 00:00:00 EDT (UTC-4 = 04:00:00 UTC = 12:00:00 Beijing).
  const window = calculateResetWindow(15, 'America/New_York', false, now)
  assert.strictEqual(window.resetDay, 15)
  assert.strictEqual(window.startDate, '2026-09-15')
  assert.strictEqual(window.endDate, '2026-09-22')
  assert.strictEqual(window.resetStartText, '09-15 12:00 BJT')
  assert.strictEqual(window.diffDays, 8)
}

// 3. Section 34 & 35 & 36: getBeijingDates
{
  const now = new Date('2026-09-22T12:00:00Z') // 2026-09-22 in Beijing
  const dates7d = getBeijingDates('7d', null, now)
  assert.strictEqual(dates7d.length, 7)
  assert.strictEqual(dates7d[0], '2026-09-16')
  assert.strictEqual(dates7d[6], '2026-09-22')

  const dates30d = getBeijingDates('30d', null, now)
  assert.strictEqual(dates30d.length, 30)
  assert.strictEqual(dates30d[29], '2026-09-22')

  const window = calculateResetWindow(20, 'Asia/Shanghai', false, now)
  const datesCycle = getBeijingDates('cycle', window, now)
  // 2026-09-20 to 2026-09-22 = 3 days
  assert.strictEqual(datesCycle.length, 3)
  assert.deepStrictEqual(datesCycle, ['2026-09-20', '2026-09-21', '2026-09-22'])
}

// 4. Case K — one-day aligned hourly point: full allocation
{
  // Beijing midnight is at 16:00 UTC (e.g. 2026-09-21 16:00 UTC = 2026-09-22 00:00 Beijing)
  // Two 1-hour buckets:
  // Bucket 1: 2026-09-21 15:00 UTC to 16:00 UTC (23:00 to 24:00 on 2026-09-21 Beijing) -> belongs to 2026-09-21
  // Bucket 2: 2026-09-21 16:00 UTC to 17:00 UTC (00:00 to 01:00 on 2026-09-22 Beijing) -> belongs to 2026-09-22
  const series: MetricSeriesItem[] = [
    {
      metric_key: 'traffic.down',
      entity_id: 'node-1',
      interval_seconds: 3600,
      points: [
        { time: '2026-09-21T15:00:00Z', value: 1000 },
        { time: '2026-09-21T16:00:00Z', value: 2000 },
      ],
    },
    {
      metric_key: 'traffic.up',
      entity_id: 'node-1',
      interval_seconds: 3600,
      points: [
        { time: '2026-09-21T15:00:00Z', value: 500 },
        { time: '2026-09-21T16:00:00Z', value: 1000 },
      ],
    },
  ]

  const dates = ['2026-09-21', '2026-09-22']
  const nowMs = Date.parse('2026-09-22T12:00:00Z')
  const result = aggregateDailyTraffic(dates, series, nowMs)

  assert.strictEqual(result.days.length, 2)
  const day21 = result.days.find(d => d.date === '2026-09-21')!
  const day22 = result.days.find(d => d.date === '2026-09-22')!

  assert.strictEqual(day21.downloadBytes, 1000)
  assert.strictEqual(day21.uploadBytes, 500)
  assert.strictEqual(day21.totalBytes, 1500)
  assert.strictEqual(day21.quality, 'complete')

  assert.strictEqual(day22.downloadBytes, 2000)
  assert.strictEqual(day22.uploadBytes, 1000)
  assert.strictEqual(day22.totalBytes, 3000)
  assert.strictEqual(result.hasCoarseRollup, false)
}

// 5. Case L — bucket crosses Beijing midnight: not assigned to either day, hasCoarseRollup = true
{
  // 23:00 to 01:00 Beijing time:
  // 2026-09-21 15:00 UTC (23:00 BJT) with 2-hour interval (7200s) -> ends at 17:00 UTC (01:00 BJT next day)
  const series: MetricSeriesItem[] = [
    {
      metric_key: 'traffic.down',
      entity_id: 'node-1',
      interval_seconds: 7200,
      points: [
        { time: '2026-09-21T15:00:00Z', value: 100 },
      ],
    },
  ]

  const dates = ['2026-09-21', '2026-09-22']
  const nowMs = Date.parse('2026-09-22T12:00:00Z')
  const result = aggregateDailyTraffic(dates, series, nowMs)

  assert.strictEqual(result.hasCoarseRollup, true)
  assert.ok(result.coarseWarning?.includes('粗粒度'))

  const day21 = result.days.find(d => d.date === '2026-09-21')!
  const day22 = result.days.find(d => d.date === '2026-09-22')!
  assert.strictEqual(day21.downloadBytes, null)
  assert.strictEqual(day21.totalBytes, null)
  assert.strictEqual(day22.downloadBytes, null)
  assert.strictEqual(day22.totalBytes, null)
}

// 6. Case M — one valid + one ambiguous bucket: valid amount retained, ambiguous amount skipped, quality = partial
{
  const series: MetricSeriesItem[] = [
    {
      metric_key: 'traffic.down',
      entity_id: 'node-1',
      interval_seconds: 3600,
      points: [
        // Valid 1h bucket on 2026-09-21 (12:00 UTC = 20:00 BJT)
        { time: '2026-09-21T12:00:00Z', value: 500 },
      ],
    },
    {
      metric_key: 'traffic.down',
      entity_id: 'node-1',
      interval_seconds: 7200,
      points: [
        // Ambiguous 2h bucket crossing midnight (15:00 UTC = 23:00 BJT to 17:00 UTC = 01:00 BJT)
        { time: '2026-09-21T15:00:00Z', value: 100 },
      ],
    },
  ]

  const dates = ['2026-09-21', '2026-09-22']
  const nowMs = Date.parse('2026-09-22T12:00:00Z')
  const result = aggregateDailyTraffic(dates, series, nowMs)

  assert.strictEqual(result.hasCoarseRollup, true)
  const day21 = result.days.find(d => d.date === '2026-09-21')!
  // Valid amount 500 retained, ambiguous 100 skipped
  assert.strictEqual(day21.downloadBytes, 500)
  assert.strictEqual(day21.totalBytes, 500)
  assert.strictEqual(day21.quality, 'partial')
  assert.strictEqual(day21.isCoarse, true)
}

// 7. Case N — only ambiguous buckets: no fabricated daily bytes, coarse warning visible, quality = partial
{
  const series: MetricSeriesItem[] = [
    {
      metric_key: 'traffic.down',
      entity_id: 'node-1',
      interval_seconds: 86400,
      points: [
        { time: '2026-09-21T00:00:00Z', value: 24000 },
      ],
    },
  ]

  const dates = ['2026-09-21', '2026-09-22']
  const nowMs = Date.parse('2026-09-22T12:00:00Z')
  const result = aggregateDailyTraffic(dates, series, nowMs)

  assert.strictEqual(result.hasCoarseRollup, true)
  assert.ok(result.coarseWarning?.includes('粗粒度'))
  for (const day of result.days) {
    assert.strictEqual(day.downloadBytes, null)
    assert.strictEqual(day.totalBytes, null)
    assert.strictEqual(day.quality, 'partial')
    assert.strictEqual(day.isCoarse, true)
  }
}

// 8. Case G — RPC throws: fetchTrafficCapability throws TrafficApiError (no fake retention)
{
  const mockFailingRpc = async () => {
    throw new Error('RPC network timeout')
  }

  await assert.rejects(
    async () => {
      await fetchTrafficCapability(mockFailingRpc as any)
    },
    (err: any) => {
      assert.ok(err instanceof TrafficApiError)
      assert.ok(err.message.includes('无法读取 Metric Store 保留策略'))
      return true
    },
  )
}

// 9. Case H — RPC succeeds with traffic.up / traffic.down: retentionDays = 30, supports7d = true, supports30d = true
{
  const mockCall30d = async () => [
    { name: 'traffic.up', retention_days: 30 },
    { name: 'traffic.down', retention_days: 30 },
  ]
  const cap30d = await fetchTrafficCapability(mockCall30d as any)
  assert.strictEqual(cap30d.retentionDays, 30)
  assert.strictEqual(cap30d.supports7d, true)
  assert.strictEqual(cap30d.supports30d, true)
}

// 10. Case I — Definitions absent: retentionDays = null, supports7d = false, supports30d = false
{
  const mockCallEmpty = async () => []
  const capEmpty = await fetchTrafficCapability(mockCallEmpty as any)
  assert.strictEqual(capEmpty.retentionDays, null)
  assert.strictEqual(capEmpty.supports7d, false)
  assert.strictEqual(capEmpty.supports30d, false)
}

// 11. Case J — Legacy fake fields only: ignored, retentionDays = null, supports7d = false, supports30d = false
{
  const mockCallLegacy = async () => [
    { metric_key: 'traffic.up', retention_days: 30 },
    { key: 'traffic.down', retention_days: 30 },
  ]
  const capLegacy = await fetchTrafficCapability(mockCallLegacy as any)
  assert.strictEqual(capLegacy.retentionDays, null)
  assert.strictEqual(capLegacy.supports7d, false)
  assert.strictEqual(capLegacy.supports30d, false)
}
