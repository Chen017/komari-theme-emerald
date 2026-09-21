import assert from 'node:assert'
import {
  aggregateDailyTraffic,
  buildZonedDayWindow,
} from '../../src/features/resource-insights/services/trafficAggregator'
import { canRequestSinceReset } from '../../src/features/resource-insights/services/trafficTrend'

console.log('--- Running traffic aggregator & trend tests ---')

// 1. Counter reset handling: negative counter deltas must never become negative traffic
{
  // Sample series with a reboot / counter reset:
  // 100 -> 300 (delta 200) -> 50 (reset! delta 50) -> 150 (delta 100)
  const counters = [
    { atMs: Date.parse('2026-09-21T00:00:00Z'), downloadBytes: 100, uploadBytes: 50 },
    { atMs: Date.parse('2026-09-21T06:00:00Z'), downloadBytes: 300, uploadBytes: 150 },
    { atMs: Date.parse('2026-09-21T12:00:00Z'), downloadBytes: 50, uploadBytes: 30 }, // Reset occurred here
    { atMs: Date.parse('2026-09-21T18:00:00Z'), downloadBytes: 150, uploadBytes: 80 },
  ]

  const results = aggregateDailyTraffic({
    timeZone: 'UTC',
    dates: ['2026-09-21'],
    counters,
    nowMs: Date.parse('2026-09-21T23:59:59Z'),
  })

  assert.strictEqual(results.length, 1)
  const day = results[0]!
  assert.ok(day.downloadBytes! >= 0, 'Download traffic must never be negative')
  assert.ok(day.uploadBytes! >= 0, 'Upload traffic must never be negative')
  // Download = (300 - 100) + 50 (reset) + (150 - 50) = 200 + 50 + 100 = 350
  assert.strictEqual(day.downloadBytes, 350, 'Download should be sum of delta before reset + new base + delta after reset')
  // Upload = (150 - 50) + 30 (reset) + (80 - 30) = 100 + 30 + 50 = 180
  assert.strictEqual(day.uploadBytes, 180, 'Upload should be sum of delta before reset + new base + delta after reset')
  assert.strictEqual(day.resetCount, 1, 'Should record 1 reset count')
  assert.ok(day.reasons.includes('counter-reset'), 'Should include counter-reset reason')
  assert.strictEqual(day.quality, 'estimated', 'Counter diff source is classified as estimated')
  console.log('✓ Counter reset delta calculation passes without negative traffic')
}

// 2. Quality classification: missing, estimated, complete, partial
{
  // No data -> quality: missing
  const emptyResults = aggregateDailyTraffic({
    timeZone: 'UTC',
    dates: ['2026-09-20'],
    counters: [],
    nowMs: Date.parse('2026-09-21T00:00:00Z'),
  })
  assert.strictEqual(emptyResults[0]!.quality, 'missing')
  assert.strictEqual(emptyResults[0]!.downloadBytes, null)
  assert.strictEqual(emptyResults[0]!.uploadBytes, null)

  // Full day authoritative metric delta -> complete
  const completeDeltas = [
    {
      startMs: Date.parse('2026-09-21T00:00:00Z'),
      endMs: Date.parse('2026-09-22T00:00:00Z'),
      downloadBytes: 5000,
      uploadBytes: 2500,
      sampling: 'authoritative' as const,
    },
  ]
  const completeResults = aggregateDailyTraffic({
    timeZone: 'UTC',
    dates: ['2026-09-21'],
    deltas: completeDeltas,
    nowMs: Date.parse('2026-09-22T00:00:00Z'),
  })
  assert.strictEqual(completeResults[0]!.quality, 'complete', 'Full coverage authoritative delta is complete')

  // Partial day authoritative metric delta (00:00 to 12:00 of an ended day) -> partial
  const partialDeltas = [
    {
      startMs: Date.parse('2026-09-21T00:00:00Z'),
      endMs: Date.parse('2026-09-21T12:00:00Z'),
      downloadBytes: 2500,
      uploadBytes: 1250,
      sampling: 'authoritative' as const,
    },
  ]
  const partialResults = aggregateDailyTraffic({
    timeZone: 'UTC',
    dates: ['2026-09-21'],
    deltas: partialDeltas,
    nowMs: Date.parse('2026-09-22T00:00:00Z'),
  })
  assert.strictEqual(partialResults[0]!.quality, 'partial', 'Partial day authoritative delta is partial')

  console.log('✓ Quality classification (missing, estimated, complete, partial) passes')
}

// 3. Since Reset availability rules
{
  // Fleet aggregate should never allow since_reset
  assert.strictEqual(
    canRequestSinceReset('all', null),
    false,
    'Fleet aggregate must not allow since_reset',
  )

  // Single node without reset metadata should not allow since_reset
  const nodeWithoutReset: any = {
    uuid: 'node-1',
    name: 'Node 1',
    traffic_reset_day: undefined,
  }
  assert.strictEqual(
    canRequestSinceReset('node-1', nodeWithoutReset),
    false,
    'Node without reset config should not allow since_reset',
  )

  // Single node with reset day should allow since_reset
  const nodeWithReset: any = {
    uuid: 'node-2',
    name: 'Node 2',
    traffic_reset_day: 1,
  }
  assert.strictEqual(
    canRequestSinceReset('node-2', nodeWithReset),
    true,
    'Node with reset day should allow since_reset',
  )

  console.log('✓ Since Reset availability rules pass')
}

// 4. Metric delta evidence aggregation
{
  const deltas = [
    {
      startMs: Date.parse('2026-09-21T00:00:00Z'),
      endMs: Date.parse('2026-09-21T06:00:00Z'),
      downloadBytes: 1000,
      uploadBytes: 500,
      sampling: 'authoritative' as const,
    },
    {
      startMs: Date.parse('2026-09-21T06:00:00Z'),
      endMs: Date.parse('2026-09-21T12:00:00Z'),
      downloadBytes: 2000,
      uploadBytes: 1000,
      sampling: 'authoritative' as const,
    },
  ]

  const deltaResults = aggregateDailyTraffic({
    timeZone: 'UTC',
    dates: ['2026-09-21'],
    deltas,
    nowMs: Date.parse('2026-09-21T23:59:59Z'),
  })

  assert.strictEqual(deltaResults[0]!.downloadBytes, 3000)
  assert.strictEqual(deltaResults[0]!.uploadBytes, 1500)
  assert.strictEqual(deltaResults[0]!.source, 'metric-delta')

  console.log('✓ Metric delta evidence aggregation passes')
}

console.log('All traffic tests passed successfully!')
