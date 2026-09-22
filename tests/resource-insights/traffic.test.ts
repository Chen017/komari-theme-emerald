import type { MetricSeriesItem } from '../../src/features/resource-insights/traffic/types'
import assert from 'node:assert'
import { aggregateDailyTraffic } from '../../src/features/resource-insights/traffic/aggregate'
import { fetchTrafficCapability } from '../../src/features/resource-insights/traffic/api'
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

// 4. Section 65: Hourly UTC metrics crossing Beijing midnight correctly aggregate into Asia/Shanghai days
{
  // Beijing midnight is at 16:00 UTC (e.g. 2026-09-21 16:00 UTC = 2026-09-22 00:00 Beijing)
  // Let's create two 1-hour buckets:
  // Bucket 1: 2026-09-21 15:00 UTC to 16:00 UTC (23:00 to 24:00 on 2026-09-21 Beijing) -> should belong to 2026-09-21
  // Bucket 2: 2026-09-21 16:00 UTC to 17:00 UTC (00:00 to 01:00 on 2026-09-22 Beijing) -> should belong to 2026-09-22
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

  assert.strictEqual(day22.downloadBytes, 2000)
  assert.strictEqual(day22.uploadBytes, 1000)
  assert.strictEqual(day22.totalBytes, 3000)
}

// 5. Section 40 & 41 & 66: Coarse rollup warning and no proportional split
{
  // A 24-hour bucket starting at 2026-09-21 00:00 UTC (08:00 Beijing) to 2026-09-22 00:00 UTC (08:00 Beijing)
  // This crosses Beijing midnight (16:00 UTC) with an interval > 1 hour (24 hours).
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
}

// 6. Hard coding rule 8: Missing history is not zero traffic
{
  const series: MetricSeriesItem[] = []
  const dates = ['2026-09-21']
  const result = aggregateDailyTraffic(dates, series, Date.parse('2026-09-22T00:00:00Z'))

  assert.strictEqual(result.days.length, 1)
  assert.strictEqual(result.days[0]!.downloadBytes, null)
  assert.strictEqual(result.days[0]!.uploadBytes, null)
  assert.strictEqual(result.days[0]!.totalBytes, null)
  assert.strictEqual(result.days[0]!.quality, 'missing')
}

// 7. Section 38 & 61 & 62: Capability detection (retention = 7 vs retention = 30)
{
  const mockCall7d = async () => [
    { name: 'traffic.up', retention_days: 7 },
    { name: 'traffic.down', retention_days: 7 },
  ]
  const cap7d = await fetchTrafficCapability(mockCall7d as any)
  assert.strictEqual(cap7d.retentionDays, 7)
  assert.strictEqual(cap7d.supports7d, true)
  assert.strictEqual(cap7d.supports30d, false)

  const mockCall30d = async () => [
    { name: 'traffic.up', retention_days: 30 },
    { name: 'traffic.down', retention_days: 30 },
  ]
  const cap30d = await fetchTrafficCapability(mockCall30d as any)
  assert.strictEqual(cap30d.retentionDays, 30)
  assert.strictEqual(cap30d.supports7d, true)
  assert.strictEqual(cap30d.supports30d, true)
}
