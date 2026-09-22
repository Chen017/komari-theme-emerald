import assert from 'node:assert'
import {
  aggregateDailyTraffic,
  buildZonedDayWindow,
} from '../../src/features/resource-insights/services/trafficAggregator'
import {
  buildTrafficTrendViewModel,
  calculateResetWindow,
  canRequestSinceReset,
  resolveNodeResetDay,
} from '../../src/features/resource-insights/services/trafficTrend'

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

// 5. Reset Window Calculation Tests (Section 25)
{
  const refDate = new Date('2026-09-22T10:00:00Z')

  // Node reset day 1 on Sep 22 -> Sep 1 to Sep 22 (22 days)
  const win1 = calculateResetWindow(1, refDate, 'UTC')
  assert.strictEqual(win1.startDate, '2026-09-01')
  assert.strictEqual(win1.endDate, '2026-09-22')
  assert.strictEqual(win1.diffDays, 22)
  assert.strictEqual(win1.resetDay, 1)

  // Node reset day 18 on Sep 22 -> Sep 18 to Sep 22 (5 days)
  const win18 = calculateResetWindow(18, refDate, 'UTC')
  assert.strictEqual(win18.startDate, '2026-09-18')
  assert.strictEqual(win18.endDate, '2026-09-22')
  assert.strictEqual(win18.diffDays, 5)
  assert.strictEqual(win18.resetDay, 18)

  // Node reset day 25 on Sep 22 -> Aug 25 to Sep 22 (29 days)
  const win25 = calculateResetWindow(25, refDate, 'UTC')
  assert.strictEqual(win25.startDate, '2026-08-25')
  assert.strictEqual(win25.endDate, '2026-09-22')
  assert.strictEqual(win25.diffDays, 29)
  assert.strictEqual(win25.resetDay, 25)

  // Short month: reset day 31 evaluated in March -> Feb 28 to March 10
  const marchDate = new Date('2026-03-10T12:00:00Z')
  const winShort = calculateResetWindow(31, marchDate, 'UTC')
  assert.strictEqual(winShort.startDate, '2026-02-28')
  assert.strictEqual(winShort.endDate, '2026-03-10')
  assert.strictEqual(winShort.diffDays, 11)
  assert.strictEqual(winShort.resetDay, 28) // clamped to Feb 28

  console.log('✓ Section 25 reset window calculation tests pass (Day 1, 18, 25 & short month)')
}

// 6. Resolve Node Reset Day Priority Tests (Section 20)
{
  assert.strictEqual(resolveNodeResetDay(null), null)
  assert.strictEqual(resolveNodeResetDay({}), null)
  assert.strictEqual(resolveNodeResetDay({ traffic_limit: 1000 }), null, 'traffic_limit alone must not yield a reset day')
  assert.strictEqual(resolveNodeResetDay({ traffic_reset_day: 18 }), 18)
  assert.strictEqual(resolveNodeResetDay({ month_rotate: 15 }), 15)
  assert.strictEqual(resolveNodeResetDay({ monthRotate: 12 }), 12)
  assert.strictEqual(resolveNodeResetDay({ trafficResetDay: 5 }), 5)
  assert.strictEqual(resolveNodeResetDay({ traffic_reset_day: '20' }), 20)
  assert.strictEqual(resolveNodeResetDay({ traffic_reset_day: 0 }), null)
  assert.strictEqual(resolveNodeResetDay({ traffic_reset_day: 32 }), null)

  console.log('✓ Section 20 resolveNodeResetDay tests pass')
}

// 7. 30D Traffic Range & Partial Coverage Label (Section 28 & 30)
{
  const dates30: string[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.parse('2026-09-22T00:00:00Z') - i * 86400000)
    dates30.push(d.toISOString().slice(0, 10))
  }
  assert.strictEqual(dates30.length, 30)

  // Simulate only 12 days retained (last 12 days have data, first 18 days have no data)
  const aggregatesByEntity = new Map<string, any[]>()
  const entityId = 'node-partial-30d'
  const dailyRows: any[] = []

  for (let i = 0; i < 30; i++) {
    const date = dates30[i]!
    if (i < 18) {
      // Missing retention day
      dailyRows.push({
        date,
        uploadBytes: null,
        downloadBytes: null,
        quality: 'missing',
        source: null,
        coverage: 0,
        isInProgress: false,
        reasons: ['no-data'],
      })
    }
    else {
      // Valid historical day
      dailyRows.push({
        date,
        uploadBytes: 1000 * (i + 1),
        downloadBytes: 2000 * (i + 1),
        quality: 'complete',
        source: 'metric-delta',
        coverage: 1.0,
        isInProgress: false,
        reasons: [],
      })
    }
  }
  aggregatesByEntity.set(entityId, dailyRows)

  const vm = buildTrafficTrendViewModel(aggregatesByEntity, dates30, [entityId])
  assert.strictEqual(vm.days.length, 30)
  // First 18 days must be null, NOT zero!
  for (let i = 0; i < 18; i++) {
    assert.strictEqual(vm.days[i]!.totalBytes, null, `Day ${i} must have totalBytes=null, not 0`)
    assert.strictEqual(vm.days[i]!.quality, 'missing')
  }
  // Last 12 days must have real traffic totals
  for (let i = 18; i < 30; i++) {
    assert.strictEqual(vm.days[i]!.totalBytes, 3000 * (i + 1))
    assert.strictEqual(vm.days[i]!.quality, 'complete')
  }
  // Message must show explicit coverage
  assert.strictEqual(vm.message, '历史覆盖 12 / 30 天')

  console.log('✓ Section 28 & 30: 30D traffic range and partial coverage label tests pass')
}

console.log('All traffic tests passed successfully!')

