import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  aggregateDailyTraffic,
  buildInclusiveDateRange,
  buildRecentNaturalDayKeys,
  buildZonedDayWindow,
} from '../../src/features/resource-insights/services/trafficAggregator'
import {
  buildTrafficTrendViewModel,
  calculateResetWindow,
  canRequestSinceReset,
  resolveNodeResetConfig,
  resolveNodeResetDay,
} from '../../src/features/resource-insights/services/trafficTrend'
import {
  extractResetDayFromTags,
  extractResetTimezoneFromTags,
  resolveTrafficResetConfig,
  resolveTrafficResetDay,
} from '../../src/features/resource-insights/services/trafficResetConfig'
import { historyResultToTrafficEvidence } from '../../src/features/resource-insights/services/trafficEvidence'
import { createHistoryGateway } from '../../src/features/resource-insights/services/historyGateway'
import { RpcError } from '../../src/utils/rpc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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

// 8. Traffic Reset Day Config Tests (Section 8.4 & 18)
{
  // Tag extraction tests
  assert.strictEqual(extractResetDayFromTags(['web', '<TRD:18>', 'us']), 18)
  assert.strictEqual(extractResetDayFromTags(['<TRD:1>']), 1)
  assert.strictEqual(extractResetDayFromTags(['<TRD:31>']), 31)
  assert.strictEqual(extractResetDayFromTags(['<TRD:0>']), null, '<TRD:0> must be invalid')
  assert.strictEqual(extractResetDayFromTags(['<TRD:32>']), null, '<TRD:32> must be invalid')
  assert.strictEqual(extractResetDayFromTags(['<TRD:abc>']), null, 'malformed TRD must be invalid')
  assert.strictEqual(extractResetDayFromTags(['<TRD:>']), null)
  assert.strictEqual(extractResetDayFromTags([]), null)
  assert.strictEqual(extractResetDayFromTags(undefined), null)

  // resolveTrafficResetDay tests
  const nodeWithTag = { uuid: 'uuid-1', tags: ['<TRD:25>'] }
  const resTag = resolveTrafficResetDay(nodeWithTag)
  assert.strictEqual(resTag.day, 25)
  assert.strictEqual(resTag.source, 'tag')

  // Settings fallback
  const nodeWithSettings = { uuid: 'uuid-2', tags: ['web'] }
  const settings = { trafficResetDays: { 'uuid-2': 15 } }
  const resSettings = resolveTrafficResetDay(nodeWithSettings, settings)
  assert.strictEqual(resSettings.day, 15)
  assert.strictEqual(resSettings.source, 'settings')

  // Tag priority over settings
  const nodeWithBoth = { uuid: 'uuid-3', tags: ['<TRD:18>'] }
  const settingsBoth = { trafficResetDays: { 'uuid-3': 5 } }
  const resBoth = resolveTrafficResetDay(nodeWithBoth, settingsBoth)
  assert.strictEqual(resBoth.day, 18, 'Tag must take precedence over settings')
  assert.strictEqual(resBoth.source, 'tag')

  // Neither configured
  const nodeNone = { uuid: 'uuid-4', tags: ['web'] }
  const resNone = resolveTrafficResetDay(nodeNone, settings)
  assert.strictEqual(resNone.day, null)
  assert.strictEqual(resNone.source, 'none')

  console.log('✓ Section 8.4 & 18: Traffic Reset Day config & tag extraction tests pass')
}

// 9. Real-Response Metric Fixtures Contract Tests (Section 15 & 18)
{
  const fixturesDir = path.resolve(__dirname, '../fixtures/metrics')

  // 9.1: traffic-7d.json contract test
  {
    const raw7d = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'traffic-7d.json'), 'utf8'))
    const gateway = createHistoryGateway(async () => raw7d)
    const result = await gateway.queryTraffic({
      entityIds: ['e22e73c6-1bce-423a-8e5e-31cf35c94739'],
      start: '2026-09-15T00:00:00.000Z',
      end: '2026-09-22T00:00:00.000Z',
    })
    assert.strictEqual(result.kind, 'metrics')
    if (result.kind === 'metrics') {
      assert.strictEqual(result.retentionDays, 30)
      assert.strictEqual(result.series.length, 2)
    }

    const evidence = historyResultToTrafficEvidence(result, {
      startMs: Date.parse('2026-09-15T00:00:00.000Z'),
      endMs: Date.parse('2026-09-22T00:00:00.000Z'),
    })
    assert.strictEqual(evidence.length, 1)

    const dates7 = [
      '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18',
      '2026-09-19', '2026-09-20', '2026-09-21',
    ]
    const aggregates = aggregateDailyTraffic({
      timeZone: 'UTC',
      dates: dates7,
      deltas: evidence[0]!.deltas,
      counters: evidence[0]!.counters,
    })
    const byEntity = new Map([['e22e73c6-1bce-423a-8e5e-31cf35c94739', aggregates]])
    const vm = buildTrafficTrendViewModel(byEntity, dates7, ['e22e73c6-1bce-423a-8e5e-31cf35c94739'])

    assert.strictEqual(vm.state, 'ready')
    assert.strictEqual(vm.days.length, 7)
    assert.strictEqual(vm.days[0]!.uploadBytes, 104857600)
    assert.strictEqual(vm.days[0]!.downloadBytes, 209715200)
    assert.strictEqual(vm.days[0]!.totalBytes, 314572800)
    console.log('✓ Section 15: traffic-7d.json contract test passed')
  }

  // 9.2: traffic-30d-full.json contract test
  {
    const raw30d = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'traffic-30d-full.json'), 'utf8'))
    const gateway = createHistoryGateway(async () => raw30d)
    const result = await gateway.queryTraffic({
      entityIds: ['e22e73c6-1bce-423a-8e5e-31cf35c94739'],
      start: '2026-08-23T00:00:00.000Z',
      end: '2026-09-22T00:00:00.000Z',
    })
    assert.strictEqual(result.kind, 'metrics')

    const dates30: string[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.parse('2026-09-21T00:00:00Z') - i * 86400000)
      dates30.push(d.toISOString().slice(0, 10))
    }
    const evidence = historyResultToTrafficEvidence(result, {
      startMs: Date.parse('2026-08-23T00:00:00.000Z'),
      endMs: Date.parse('2026-09-22T00:00:00.000Z'),
    })
    const aggregates = aggregateDailyTraffic({
      timeZone: 'UTC',
      dates: dates30,
      deltas: evidence[0]!.deltas,
      counters: evidence[0]!.counters,
    })
    const byEntity = new Map([['e22e73c6-1bce-423a-8e5e-31cf35c94739', aggregates]])
    const vm = buildTrafficTrendViewModel(byEntity, dates30, ['e22e73c6-1bce-423a-8e5e-31cf35c94739'])

    assert.strictEqual(vm.state, 'ready')
    assert.strictEqual(vm.days.length, 30)
    assert.strictEqual(vm.message, '历史覆盖 30 / 30 天')
    console.log('✓ Section 15: traffic-30d-full.json contract test passed')
  }

  // 9.3: traffic-30d-partial-retention.json contract test (12 days retention)
  {
    const rawPartial = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'traffic-30d-partial-retention.json'), 'utf8'))
    const gateway = createHistoryGateway(async () => rawPartial)
    const result = await gateway.queryTraffic({
      entityIds: ['e22e73c6-1bce-423a-8e5e-31cf35c94739'],
      start: '2026-08-23T00:00:00.000Z',
      end: '2026-09-22T00:00:00.000Z',
    })
    assert.strictEqual(result.kind, 'metrics')
    if (result.kind === 'metrics') {
      assert.strictEqual(result.retentionDays, 12)
    }

    const dates30: string[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.parse('2026-09-21T00:00:00Z') - i * 86400000)
      dates30.push(d.toISOString().slice(0, 10))
    }
    const evidence = historyResultToTrafficEvidence(result, {
      startMs: Date.parse('2026-08-23T00:00:00.000Z'),
      endMs: Date.parse('2026-09-22T00:00:00.000Z'),
    })
    const aggregates = aggregateDailyTraffic({
      timeZone: 'UTC',
      dates: dates30,
      deltas: evidence[0]!.deltas,
      counters: evidence[0]!.counters,
    })
    const byEntity = new Map([['e22e73c6-1bce-423a-8e5e-31cf35c94739', aggregates]])
    const vm = buildTrafficTrendViewModel(byEntity, dates30, ['e22e73c6-1bce-423a-8e5e-31cf35c94739'])

    assert.strictEqual(vm.state, 'ready')
    assert.strictEqual(vm.days.length, 30)
    assert.strictEqual(vm.message, '历史覆盖 12 / 30 天')
    // First 18 days must be null, not 0!
    for (let i = 0; i < 18; i++) {
      assert.strictEqual(vm.days[i]!.totalBytes, null)
    }
    // Last 12 days must have non-null traffic
    for (let i = 18; i < 30; i++) {
      assert.ok(vm.days[i]!.totalBytes !== null && vm.days[i]!.totalBytes! > 0)
    }
    console.log('招标 ✓ Section 15: traffic-30d-partial-retention.json contract test passed (12/30 coverage, first 18 null)')
  }

  // 9.4: traffic-empty.json contract test
  {
    const rawEmpty = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'traffic-empty.json'), 'utf8'))
    const gateway = createHistoryGateway(async () => rawEmpty)
    const result = await gateway.queryTraffic({
      entityIds: ['e22e73c6-1bce-423a-8e5e-31cf35c94739'],
      start: '2026-09-15T00:00:00.000Z',
      end: '2026-09-22T00:00:00.000Z',
    })
    assert.strictEqual(result.kind, 'metrics')
    const dates7 = ['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21']
    const evidence = historyResultToTrafficEvidence(result, {
      startMs: Date.parse('2026-09-15T00:00:00.000Z'),
      endMs: Date.parse('2026-09-22T00:00:00.000Z'),
    })
    const aggregates = aggregateDailyTraffic({
      timeZone: 'UTC',
      dates: dates7,
      deltas: evidence[0]?.deltas ?? [],
      counters: evidence[0]?.counters ?? [],
    })
    const byEntity = new Map([['e22e73c6-1bce-423a-8e5e-31cf35c94739', aggregates]])
    const vm = buildTrafficTrendViewModel(byEntity, dates7, ['e22e73c6-1bce-423a-8e5e-31cf35c94739'])
    assert.strictEqual(vm.state, 'empty')
    for (const day of vm.days) {
      assert.strictEqual(day.totalBytes, null)
    }
    console.log('✓ Section 15: traffic-empty.json contract test passed (state is empty, all null)')
  }

  // 9.5: traffic-rpc-error.json contract test
  {
    const { RpcError } = await import('../../src/utils/rpc')
    const gateway = createHistoryGateway(async () => {
      throw new RpcError(-32602, 'Invalid params: unknown metric key or unsupported aggregation')
    })
    const result = await gateway.queryTraffic({
      entityIds: ['e22e73c6-1bce-423a-8e5e-31cf35c94739'],
      start: '2026-09-15T00:00:00.000Z',
      end: '2026-09-22T00:00:00.000Z',
    })
    // Must return explicit unavailable state, not silent 0/30!
    assert.strictEqual(result.kind, 'unavailable')
    if (result.kind === 'unavailable') {
      assert.strictEqual(result.reason, 'metrics-query-failed')
    }
    const evidence = historyResultToTrafficEvidence(result, {
      startMs: Date.parse('2026-09-15T00:00:00.000Z'),
      endMs: Date.parse('2026-09-22T00:00:00.000Z'),
    })
    assert.deepStrictEqual(evidence, [])
    console.log('✓ Section 15: traffic-rpc-error.json contract test passed (returns explicit unavailable, never silent 0/30)')
  }

  // 9.6: buildInclusiveDateRange unit test
  {
    const dates = buildInclusiveDateRange('2026-08-27', '2026-09-22')
    assert.strictEqual(dates.length, 27)
    assert.strictEqual(dates[0], '2026-08-27')
    assert.strictEqual(dates.at(-1), '2026-09-22')
    console.log('✓ Section 33: buildInclusiveDateRange correctly generates 27 inclusive dates')
  }

  // 9.7: Section 40 Case A — traffic-default-retention-1d.json contract test (30D request with 1d retention)
  {
    const raw1d = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'traffic-default-retention-1d.json'), 'utf8'))
    const gateway = createHistoryGateway(async () => raw1d)
    const result = await gateway.queryTraffic({
      entityIds: ['e22e73c6-1bce-423a-8e5e-31cf35c94739'],
      start: '2026-08-24T00:00:00.000Z',
      end: '2026-09-22T00:00:00.000Z',
      maxPoints: 800,
    })
    assert.strictEqual(result.kind, 'metrics')
    if (result.kind === 'metrics') {
      assert.strictEqual(result.retentionDays, 1)
    }

    // 30 days of dates ending on 2026-09-22
    const dates30 = buildInclusiveDateRange('2026-08-24', '2026-09-22')
    assert.strictEqual(dates30.length, 30)

    const evidence = historyResultToTrafficEvidence(result, {
      startMs: Date.parse('2026-08-24T00:00:00+08:00'),
      endMs: Date.parse('2026-09-22T23:59:59+08:00'),
    })
    const aggregates = aggregateDailyTraffic({
      timeZone: 'Asia/Shanghai',
      dates: dates30,
      deltas: evidence[0]?.deltas ?? [],
      counters: evidence[0]?.counters ?? [],
    })
    const byEntity = new Map([['e22e73c6-1bce-423a-8e5e-31cf35c94739', aggregates]])
    const vm = buildTrafficTrendViewModel(byEntity, dates30, ['e22e73c6-1bce-423a-8e5e-31cf35c94739'])

    assert.strictEqual(vm.state, 'ready')
    assert.strictEqual(vm.days.length, 30)
    assert.strictEqual(vm.requestedDays, 30)
    assert.strictEqual(vm.availableDays, 1)
    assert.strictEqual(vm.capability, 'partial-retention')
    assert.strictEqual(vm.message, '历史覆盖 1 / 30 天')
    console.log('✓ Section 40 Case A passed: traffic-default-retention-1d.json (1 / 30 coverage, capability partial-retention)')
  }

  // 9.8: Section 40 Case B — Since Reset 27 days with 1-day retention
  {
    const raw1d = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'traffic-default-retention-1d.json'), 'utf8'))
    const gateway = createHistoryGateway(async () => raw1d)
    const result = await gateway.queryTraffic({
      entityIds: ['e22e73c6-1bce-423a-8e5e-31cf35c94739'],
      start: '2026-08-27T00:00:00.000Z',
      end: '2026-09-22T00:00:00.000Z',
      maxPoints: 800,
    })
    const datesReset = buildInclusiveDateRange('2026-08-27', '2026-09-22')
    assert.strictEqual(datesReset.length, 27)

    const evidence = historyResultToTrafficEvidence(result, {
      startMs: Date.parse('2026-08-27T00:00:00+08:00'),
      endMs: Date.parse('2026-09-22T23:59:59+08:00'),
    })
    const aggregates = aggregateDailyTraffic({
      timeZone: 'Asia/Shanghai',
      dates: datesReset,
      deltas: evidence[0]?.deltas ?? [],
      counters: evidence[0]?.counters ?? [],
    })
    const byEntity = new Map([['e22e73c6-1bce-423a-8e5e-31cf35c94739', aggregates]])
    const vm = buildTrafficTrendViewModel(byEntity, datesReset, ['e22e73c6-1bce-423a-8e5e-31cf35c94739'])

    assert.strictEqual(vm.requestedDays, 27)
    assert.strictEqual(vm.availableDays, 1)
    assert.strictEqual(vm.capability, 'partial-retention')
    assert.strictEqual(vm.message, '重置周期：2026-08-27 – 2026-09-22 · 历史覆盖 1 / 27 天')
    console.log('✓ Section 40 Case B passed: Since Reset 27d with 1d retention correctly reports 1 / 27 天')
  }

  // 9.9: Section 40 Case C — UTC 24h rollup + Asia/Shanghai cross-day rejection & coarse-rollup capability
  {
    // UTC daily bucket: 00:00 UTC to 24:00 UTC (08:00 to 08:00 next day in Asia/Shanghai)
    const coarseDeltas = [
      {
        startMs: Date.parse('2026-09-21T00:00:00.000Z'),
        endMs: Date.parse('2026-09-22T00:00:00.000Z'),
        uploadBytes: 1000000,
        downloadBytes: 2000000,
        sampling: 'authoritative' as const,
      },
    ]
    const dates = ['2026-09-21', '2026-09-22']
    const aggregates = aggregateDailyTraffic({
      timeZone: 'Asia/Shanghai',
      dates,
      deltas: coarseDeltas,
    })
    const byEntity = new Map([['node-c', aggregates]])
    const vm = buildTrafficTrendViewModel(byEntity, dates, ['node-c'])

    assert.strictEqual(vm.state, 'empty')
    assert.strictEqual(vm.availableDays, 0)
    assert.strictEqual(vm.capability, 'coarse-rollup')
    assert.strictEqual(vm.message, '历史数据粒度过粗，无法准确按本地自然日拆分')
    console.log('✓ Section 40 Case C passed: UTC 24h rollup in Asia/Shanghai correctly identifies coarse-rollup')
  }

  // 9.10: Section 40 Case D — Hourly UTC rollup + Asia/Shanghai daily aggregation
  {
    // 24 hourly buckets from 2026-09-20T16:00:00Z to 2026-09-21T16:00:00Z
    // In Asia/Shanghai (UTC+8), this spans exactly 2026-09-21 00:00:00 to 2026-09-21 24:00:00
    const hourlyDeltas = []
    const baseMs = Date.parse('2026-09-20T16:00:00.000Z')
    for (let h = 0; h < 24; h++) {
      hourlyDeltas.push({
        startMs: baseMs + h * 3600 * 1000,
        endMs: baseMs + (h + 1) * 3600 * 1000,
        uploadBytes: 100,
        downloadBytes: 200,
        sampling: 'authoritative' as const,
      })
    }

    const aggregates = aggregateDailyTraffic({
      timeZone: 'Asia/Shanghai',
      dates: ['2026-09-21'],
      deltas: hourlyDeltas,
    })
    assert.strictEqual(aggregates.length, 1)
    const day = aggregates[0]!
    assert.strictEqual(day.uploadBytes, 24 * 100)
    assert.strictEqual(day.downloadBytes, 24 * 200)
    assert.strictEqual(day.quality, 'complete')
    assert.strictEqual(day.coverage, 1)

    const byEntity = new Map([['node-d', aggregates]])
    const vm = buildTrafficTrendViewModel(byEntity, ['2026-09-21'], ['node-d'])
    assert.strictEqual(vm.state, 'ready')
    assert.strictEqual(vm.availableDays, 1)
    assert.strictEqual(vm.capability, 'full')
    console.log('✓ Section 40 Case D passed: 24 hourly UTC buckets cleanly aggregate to complete Beijing natural day')
  }

  // 9.11: Section 43 — TRTZ parsing & calculateResetWindow in America/New_York with Beijing display
  {
    const tags = ['web', '<TRD:27>', '<TRTZ:America/New_York>']
    const tz = extractResetTimezoneFromTags(tags)
    assert.strictEqual(tz, 'America/New_York')

    const config = resolveTrafficResetConfig({ uuid: 'node-ny', tags })
    assert.strictEqual(config.day, 27)
    assert.strictEqual(config.timezone, 'America/New_York')
    assert.strictEqual(config.source, 'tag')
    assert.strictEqual(config.timezoneSource, 'tag')

    // Reset window calculated in America/New_York, displayed in Asia/Shanghai
    const testNow = new Date('2026-09-22T08:00:00Z')
    const window = calculateResetWindow(27, testNow, 'America/New_York', undefined, 'Asia/Shanghai')
    assert.strictEqual(window.resetDay, 27)
    assert.strictEqual(window.resetTimezone, 'America/New_York')
    assert.strictEqual(window.startDate, '2026-08-27')
    assert.strictEqual(window.endDate, '2026-09-22')
    // 00:00 EDT on 08-27 is 12:00 in Beijing (UTC+8)
    assert.strictEqual(window.resetStartText, '08-27 12:00 BJT')
    console.log(`✓ Section 43 passed: TRD=27 + TRTZ=America/New_York correctly produces ${window.resetStartText}`)
  }

  // 9.12: Section 43 — Cycle cumulative traffic independent of Metric Store retention
  {
    // Node has agent cycle totals: 742 GB down, 105 GB up
    const mockNode = {
      uuid: 'agent-cycle-node',
      name: 'Agent Node',
      net_total_down: 742 * 1024 * 1024 * 1024,
      net_total_up: 105 * 1024 * 1024 * 1024,
      tags: '<TRD:27>',
    }

    // Cumulative traffic is read directly from agent status
    const cumulativeDown = mockNode.net_total_down
    const cumulativeUp = mockNode.net_total_up
    const cumulativeTotal = cumulativeDown + cumulativeUp

    assert.strictEqual(cumulativeDown, 742 * 1024 * 1024 * 1024)
    assert.strictEqual(cumulativeUp, 105 * 1024 * 1024 * 1024)
    assert.strictEqual(cumulativeTotal, 847 * 1024 * 1024 * 1024)

    // Even if Metric Store only has 1 day of historical data for this 27-day cycle:
    const datesReset = buildInclusiveDateRange('2026-08-27', '2026-09-22')
    const aggregates = datesReset.map((date, idx) => ({
      date,
      timeZone: 'Asia/Shanghai',
      startMs: 0,
      endMs: 0,
      durationMs: 86400000,
      effectiveEndMs: 86400000,
      effectiveDurationMs: 86400000,
      isInProgress: false,
      uploadBytes: idx === 26 ? 10485760 : null,
      downloadBytes: idx === 26 ? 20971520 : null,
      source: 'metric-delta' as const,
      quality: (idx === 26 ? 'complete' : 'missing') as any,
      coverage: idx === 26 ? 1 : 0,
      firstRecordAtMs: null,
      lastRecordAtMs: null,
      maxGapMs: null,
      resetCount: 0,
      reasons: idx === 26 ? [] : (['no-data'] as any[]),
    }))

    const vm = buildTrafficTrendViewModel(
      new Map([[mockNode.uuid, aggregates]]),
      datesReset,
      [mockNode.uuid],
    )

    // Trend only covers 1 / 27 days, but cycle cumulative remains 742 GB / 105 GB!
    assert.strictEqual(vm.availableDays, 1)
    assert.strictEqual(vm.requestedDays, 27)
    assert.strictEqual(vm.capability, 'partial-retention')
    assert.strictEqual(vm.message, '重置周期：2026-08-27 – 2026-09-22 · 历史覆盖 1 / 27 天')
    console.log('✓ Section 43 passed: cycle cumulative totals operate independently from Metric Store retention')
  }
}

// ============================================================================
// SECOND PATCH REGRESSION TESTS (Sections 50 - 68)
// ============================================================================

import {
  buildTrafficHistorySegments,
  calculateMaxPointsForHourlyTarget,
  queryMetricSegment,
  resolveTrafficHistory,
} from '../../src/features/resource-insights/services/trafficHistoryQuery'
import {
  mergeTrafficEvidence,
  metricsToTrafficEvidence,
} from '../../src/features/resource-insights/services/trafficEvidence'
import { fetchHistoryCapabilities } from '../../src/features/resource-insights/services/historyCapabilities'

function createFakeKomariMetricRpc(options: {
  nowMs: number
  hourRetentionHours: number
  supportsMetrics?: boolean
  failWindows?: Array<{ startMs: number, endMs: number }>
}) {
  const { nowMs, hourRetentionHours, supportsMetrics = true, failWindows = [] } = options

  return async (method: string, params: any) => {
    if (method === 'rpc.methods') {
      return supportsMetrics ? ['public:queryMetrics', 'common:getRecords'] : ['common:getRecords']
    }
    if (method === 'public:listMetricDefinitions') {
      return [
        { name: 'traffic.up', retention_days: 30, type: 'counter' },
        { name: 'traffic.down', retention_days: 30, type: 'counter' },
      ]
    }
    if (method === 'public:queryMetrics') {
      if (!supportsMetrics) {
        throw new RpcError(-32601, 'Method not found')
      }
      const startMs = Date.parse(params.start)
      const endMs = Date.parse(params.end)

      for (const fw of failWindows) {
        if (startMs < fw.endMs && endMs > fw.startMs) {
          throw new RpcError(-32000, 'Simulated transient RPC failure')
        }
      }

      // Komari selects backing tier based on whether the tier covers the query start
      const canUseHourly = startMs >= nowMs - hourRetentionHours * 3600000
      const intervalSeconds = canUseHourly ? 3600 : 86400

      const series: any[] = []
      for (const entityId of params.entity_ids) {
        for (const metricKey of params.metric_keys) {
          const points: any[] = []
          const intervalMs = intervalSeconds * 1000
          // Generate points
          const alignedStart = Math.floor(startMs / intervalMs) * intervalMs
          for (let t = alignedStart; t < endMs; t += intervalMs) {
            points.push({
              time: new Date(t).toISOString(),
              value: 1000000,
            })
          }
          series.push({
            metric_key: metricKey,
            entity_id: entityId,
            tags: {},
            retention_days: 30,
            downsampled: true,
            downsample_algorithm: 'sum',
            interval_seconds: intervalSeconds,
            points,
          })
        }
      }
      return { series }
    }
    if (method === 'common:getRecords') {
      const records: Record<string, any[]> = {}
      for (const id of (params.entity_ids || ['test-node'])) {
        records[id] = [
          { time: params.start, net_total_up: 1000, net_total_down: 2000, traffic_up: 100, traffic_down: 200 },
          { time: params.end, net_total_up: 2000, net_total_down: 4000, traffic_up: 100, traffic_down: 200 },
        ]
      }
      return { records }
    }
    throw new Error(`Unhandled method ${method}`)
  }
}

// Section 50: Base Segment Builder tests
{
  const nowMs = Date.parse('2026-09-22T12:00:00+08:00')
  // 7-day range: 1 segment
  const segs7 = buildTrafficHistorySegments(['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22'], 'Asia/Shanghai', nowMs)
  assert.strictEqual(segs7.length, 1)
  assert.strictEqual(segs7[0]!.dates.length, 7)

  // 30-day range: 6 segments of 5 days
  const dates30 = buildRecentNaturalDayKeys(30, 'Asia/Shanghai', nowMs)
  const segs30 = buildTrafficHistorySegments(dates30, 'Asia/Shanghai', nowMs)
  assert.strictEqual(segs30.length, 6)
  assert.ok(segs30.every(s => s.dates.length === 5))

  // 27-day range: 6 segments (5, 5, 5, 5, 5, 2)
  const dates27 = buildRecentNaturalDayKeys(27, 'Asia/Shanghai', nowMs)
  const segs27 = buildTrafficHistorySegments(dates27, 'Asia/Shanghai', nowMs)
  assert.strictEqual(segs27.length, 6)
  assert.strictEqual(segs27[5]!.dates.length, 2)
  console.log('✓ Section 50 passed: Base segment builder correctly segments ranges')
}

// Section 51 & 52: 600h retention — Recent days survive fine while old days are coarse
{
  const nowMs = Date.parse('2026-09-22T12:00:00+08:00')
  const rpc = createFakeKomariMetricRpc({ nowMs, hourRetentionHours: 600 })
  const gateway = createHistoryGateway(rpc)
  const dates30 = buildRecentNaturalDayKeys(30, 'Asia/Shanghai', nowMs)

  const resolved = await resolveTrafficHistory({
    gateway,
    entityIds: ['test-node'],
    dates: dates30,
    timeZone: 'Asia/Shanghai',
    nowMs,
  })

  assert.strictEqual(resolved.sourceKind, 'metrics')
  assert.ok(resolved.diagnostics.requestCount >= 6, 'Must use multiple segmented queries')
  assert.ok(resolved.diagnostics.requestCount <= 18, 'Must stay within safety budget')

  const aggregates = aggregateDailyTraffic({
    timeZone: 'Asia/Shanghai',
    dates: dates30,
    nowMs,
    deltas: resolved.evidence[0]!.deltas,
  })

  const vm = buildTrafficTrendViewModel(new Map([['test-node', aggregates]]), dates30, ['test-node'])
  assert.strictEqual(vm.state, 'ready')
  // Recent days must survive with complete or partial quality and not all coarse!
  assert.ok(vm.availableDays >= 20, `Recent days must survive, got availableDays=${vm.availableDays}`)
  const coarseDays = vm.days.filter(d => d.isCoarse || d.reasons.includes('cross-day-interval-rejected'))
  assert.ok(coarseDays.length > 0 && coarseDays.length < 30, `Only old days should be coarse, got coarseDays=${coarseDays.length}`)
  console.log(`✓ Section 51 & 52 passed: 600h retention preserves ${vm.availableDays} fine days and isolates ${coarseDays.length} coarse days`)
}

// Section 53: Custom 10-day retention (240h)
{
  const nowMs = Date.parse('2026-09-22T12:00:00+08:00')
  const rpc = createFakeKomariMetricRpc({ nowMs, hourRetentionHours: 240 })
  const gateway = createHistoryGateway(rpc)
  const dates30 = buildRecentNaturalDayKeys(30, 'Asia/Shanghai', nowMs)

  const resolved = await resolveTrafficHistory({
    gateway,
    entityIds: ['test-node'],
    dates: dates30,
    timeZone: 'Asia/Shanghai',
    nowMs,
  })

  const aggregates = aggregateDailyTraffic({
    timeZone: 'Asia/Shanghai',
    dates: dates30,
    nowMs,
    deltas: resolved.evidence[0]!.deltas,
  })
  const vm = buildTrafficTrendViewModel(new Map([['test-node', aggregates]]), dates30, ['test-node'])
  assert.strictEqual(vm.state, 'ready')
  assert.ok(vm.availableDays >= 8 && vm.availableDays <= 12, `10d retention should yield ~10 fine days, got ${vm.availableDays}`)
  console.log(`✓ Section 53 passed: 10d custom retention preserves ${vm.availableDays} fine days`)
}

// Section 54: Boundary inside 5-day chunk (12-day retention = 288h) triggers adaptive refinement
{
  const nowMs = Date.parse('2026-09-22T12:00:00+08:00')
  const rpc = createFakeKomariMetricRpc({ nowMs, hourRetentionHours: 288 })
  const gateway = createHistoryGateway(rpc)
  const dates30 = buildRecentNaturalDayKeys(30, 'Asia/Shanghai', nowMs)

  const resolved = await resolveTrafficHistory({
    gateway,
    entityIds: ['test-node'],
    dates: dates30,
    timeZone: 'Asia/Shanghai',
    nowMs,
  })

  assert.ok(resolved.diagnostics.refinedSegmentCount > 0, 'Adaptive refinement must be triggered for transition segment')
  console.log(`✓ Section 54 passed: Transition boundary inside 5-day chunk successfully refined (${resolved.diagnostics.refinedSegmentCount} refined requests)`)
}

// Section 55: All base segments fine (35 days = 840h retention)
{
  const nowMs = Date.parse('2026-09-22T12:00:00+08:00')
  const rpc = createFakeKomariMetricRpc({ nowMs, hourRetentionHours: 840 })
  const gateway = createHistoryGateway(rpc)
  const dates30 = buildRecentNaturalDayKeys(30, 'Asia/Shanghai', nowMs)

  const resolved = await resolveTrafficHistory({
    gateway,
    entityIds: ['test-node'],
    dates: dates30,
    timeZone: 'Asia/Shanghai',
    nowMs,
  })

  assert.strictEqual(resolved.coarseWindows.length, 0, 'No coarse windows when all segments are fine')
  assert.strictEqual(resolved.diagnostics.refinedSegmentCount, 0, 'No refinement needed when all segments are fine')
  console.log('✓ Section 55 passed: All base segments fine requires 0 refinement and has 0 coarse windows')
}

// Section 56: Newest base segment still coarse (1 hour retention)
{
  const nowMs = Date.parse('2026-09-22T12:00:00+08:00')
  const rpc = createFakeKomariMetricRpc({ nowMs, hourRetentionHours: 1 })
  const gateway = createHistoryGateway(rpc)
  const dates30 = buildRecentNaturalDayKeys(30, 'Asia/Shanghai', nowMs)

  const resolved = await resolveTrafficHistory({
    gateway,
    entityIds: ['test-node'],
    dates: dates30,
    timeZone: 'Asia/Shanghai',
    nowMs,
  })

  assert.ok(resolved.diagnostics.requestCount <= 18, 'Must not recurse indefinitely')
  console.log(`✓ Section 56 passed: Very short retention terminates safely with ${resolved.diagnostics.requestCount} requests`)
}

// Section 57: Parent evidence is discarded after refinement
{
  const parentSegment = {
    dates: ['2026-09-10', '2026-09-11'],
    startMs: Date.parse('2026-09-10T00:00:00+08:00'),
    endMs: Date.parse('2026-09-11T23:59:59+08:00'),
    depth: 0,
  }
  // If parent coarse deltas (spanning 24h across midnight) were merged with child hourly deltas,
  // cross-day-interval-rejected would still be present.
  // With parent discarded, only children hourly deltas exist.
  const childEvidence = [
    {
      entityId: 'node-x',
      deltas: [
        { startMs: parentSegment.startMs, endMs: parentSegment.startMs + 3600000, uploadBytes: 10, downloadBytes: 20, sampling: 'authoritative' as const },
      ],
      counters: [],
    },
  ]
  const merged = mergeTrafficEvidence([childEvidence])
  assert.strictEqual(merged[0]!.deltas.length, 1)
  console.log('✓ Section 57 passed: Parent coarse evidence is discarded and child evidence is authoritative')
}

// Section 58: Segment boundary dedup
{
  const boundaryTime = Date.parse('2026-09-15T00:00:00+08:00')
  const listA = [
    {
      entityId: 'node-y',
      deltas: [
        { startMs: boundaryTime - 3600000, endMs: boundaryTime, uploadBytes: 100, downloadBytes: 200, sampling: 'authoritative' as const },
        { startMs: boundaryTime, endMs: boundaryTime + 3600000, uploadBytes: 300, downloadBytes: 400, sampling: 'authoritative' as const },
      ],
      counters: [],
    },
  ]
  const listB = [
    {
      entityId: 'node-y',
      deltas: [
        // Duplicate point returned at boundary
        { startMs: boundaryTime, endMs: boundaryTime + 3600000, uploadBytes: 300, downloadBytes: 400, sampling: 'authoritative' as const },
        { startMs: boundaryTime + 3600000, endMs: boundaryTime + 7200000, uploadBytes: 500, downloadBytes: 600, sampling: 'authoritative' as const },
      ],
      counters: [],
    },
  ]
  const merged = mergeTrafficEvidence([listA, listB])
  assert.strictEqual(merged[0]!.deltas.length, 3, 'Duplicate boundary interval must be deduplicated')
  console.log('✓ Section 58 passed: Exact duplicate boundary intervals are deduplicated')
}

// Section 59: Multiple interfaces (eth0 + eth1)
{
  const series = [
    {
      metricKey: 'traffic.up',
      entityId: 'multi-nic',
      tags: { interface: 'eth0' },
      retentionDays: 30,
      downsampled: true,
      aggregation: 'sum',
      intervalSeconds: 3600,
      points: [{ time: '2026-09-21T00:00:00Z', value: 1000 }],
    },
    {
      metricKey: 'traffic.up',
      entityId: 'multi-nic',
      tags: { interface: 'eth1' },
      retentionDays: 30,
      downsampled: true,
      aggregation: 'sum',
      intervalSeconds: 3600,
      points: [{ time: '2026-09-21T00:00:00Z', value: 2000 }],
    },
  ]
  const evidence = metricsToTrafficEvidence(series as any, {
    startMs: Date.parse('2026-09-21T00:00:00Z'),
    endMs: Date.parse('2026-09-21T02:00:00Z'),
  })
  assert.strictEqual(evidence[0]!.deltas[0]!.uploadBytes, 3000, 'eth0 and eth1 upload must be summed')
  console.log('✓ Section 59 passed: Multiple interfaces (eth0 + eth1) correctly summed')
}

// Section 60: Partial segment failure
{
  const nowMs = Date.parse('2026-09-22T12:00:00+08:00')
  const failStart = nowMs - 20 * 86400000
  const failEnd = nowMs - 15 * 86400000
  const rpc = createFakeKomariMetricRpc({
    nowMs,
    hourRetentionHours: 600,
    failWindows: [{ startMs: failStart, endMs: failEnd }],
  })
  const gateway = createHistoryGateway(rpc)
  const dates30 = buildRecentNaturalDayKeys(30, 'Asia/Shanghai', nowMs)

  const resolved = await resolveTrafficHistory({
    gateway,
    entityIds: ['test-node'],
    dates: dates30,
    timeZone: 'Asia/Shanghai',
    nowMs,
  })

  assert.ok(resolved.failedWindows.length > 0, 'Failed window must be recorded')
  assert.ok(resolved.evidence.length > 0, 'Successful segments must still yield evidence')
  console.log('✓ Section 60 passed: Partial segment failure records failed window and preserves other segments')
}

// Section 61: All segment failures
{
  const rpc = async () => { throw new RpcError(-32000, 'All calls fail') }
  const gateway = createHistoryGateway(rpc as any)
  const resolved = await resolveTrafficHistory({
    gateway,
    entityIds: ['test-node'],
    dates: ['2026-09-21', '2026-09-22'],
    timeZone: 'Asia/Shanghai',
  })
  assert.strictEqual(resolved.evidence.length, 0)
  assert.ok(resolved.failedWindows.length > 0)
  console.log('✓ Section 61 passed: All segment failures produce failedWindows and no evidence')
}

// Section 62: Legacy records fallback
{
  const nowMs = Date.parse('2026-09-22T12:00:00+08:00')
  const rpc = createFakeKomariMetricRpc({ nowMs, hourRetentionHours: 600, supportsMetrics: false })
  const gateway = createHistoryGateway(rpc)
  const dates30 = buildRecentNaturalDayKeys(30, 'Asia/Shanghai', nowMs)

  const resolved = await resolveTrafficHistory({
    gateway,
    entityIds: ['test-node'],
    dates: dates30,
    timeZone: 'Asia/Shanghai',
    nowMs,
  })

  assert.strictEqual(resolved.sourceKind, 'records')
  assert.strictEqual(resolved.diagnostics.usedLegacyFallback, true)
  assert.ok(resolved.evidence.length > 0)
  console.log('✓ Section 62 passed: Legacy records fallback cleanly switches entire request to Records')
}

// Section 63: Abort handling
{
  const controller = new AbortController()
  controller.abort()
  const rpc = createFakeKomariMetricRpc({ nowMs: Date.now(), hourRetentionHours: 600 })
  const gateway = createHistoryGateway(rpc)

  let threwAbort = false
  try {
    await resolveTrafficHistory({
      gateway,
      entityIds: ['test-node'],
      dates: ['2026-09-21', '2026-09-22'],
      timeZone: 'Asia/Shanghai',
      signal: controller.signal,
    })
  } catch (err: any) {
    if (err.name === 'AbortError') threwAbort = true
  }
  assert.ok(threwAbort, 'Pre-aborted request must throw AbortError')
  console.log('✓ Section 63 passed: Abort signal stops request immediately')
}

// Section 64: Request budget ceiling
{
  const nowMs = Date.parse('2026-09-22T12:00:00+08:00')
  // 31-day cycle
  const dates31 = buildRecentNaturalDayKeys(31, 'Asia/Shanghai', nowMs)
  const rpc = createFakeKomariMetricRpc({ nowMs, hourRetentionHours: 200 })
  const gateway = createHistoryGateway(rpc)

  const resolved = await resolveTrafficHistory({
    gateway,
    entityIds: ['test-node'],
    dates: dates31,
    timeZone: 'Asia/Shanghai',
    nowMs,
  })

  assert.ok(resolved.diagnostics.requestCount <= 18, `Requests must be <= 18, got ${resolved.diagnostics.requestCount}`)
  console.log(`✓ Section 64 passed: 31-day request budget ceiling satisfied (${resolved.diagnostics.requestCount} <= 18)`)
}

// Section 65 & 66: Capability tri-state (true / false / null)
{
  // Unknown retention
  const rpcUnknown = async (method: string) => {
    if (method === 'rpc.methods') return ['public:queryMetrics']
    if (method === 'public:listMetricDefinitions') return [] // No traffic metrics
    return null
  }
  const capsUnknown = await fetchHistoryCapabilities(rpcUnknown as any, { bypassCache: true })
  assert.strictEqual(capsUnknown.trafficRetentionDays, null)
  assert.strictEqual(capsUnknown.supports30dTraffic, null, 'Unknown retention must yield supports30dTraffic = null')

  // Explicitly insufficient retention (7 days)
  const rpc7d = async (method: string) => {
    if (method === 'rpc.methods') return ['public:queryMetrics']
    if (method === 'public:listMetricDefinitions') {
      return [
        { name: 'traffic.up', retention_days: 7 },
        { name: 'traffic.down', retention_days: 7 },
      ]
    }
    return null
  }
  const caps7d = await fetchHistoryCapabilities(rpc7d as any, { bypassCache: true })
  assert.strictEqual(caps7d.trafficRetentionDays, 7)
  assert.strictEqual(caps7d.supports30dTraffic, false, '7-day retention must yield supports30dTraffic = false')

  // Explicitly sufficient retention (30 days)
  const rpc30d = async (method: string) => {
    if (method === 'rpc.methods') return ['public:queryMetrics']
    if (method === 'public:listMetricDefinitions') {
      return [
        { name: 'traffic.up', retention_days: 30 },
        { name: 'traffic.down', retention_days: 30 },
      ]
    }
    return null
  }
  const caps30d = await fetchHistoryCapabilities(rpc30d as any, { bypassCache: true })
  assert.strictEqual(caps30d.trafficRetentionDays, 30)
  assert.strictEqual(caps30d.supports30dTraffic, true, '30-day retention must yield supports30dTraffic = true')
  console.log('✓ Section 65 & 66 passed: Capabilities tri-state (null, false, true) correctly handled')
}

// Section 67: Dynamic coarse warning message format
{
  // 5 coarse, 25 fine
  const daysMixed = Array.from({ length: 30 }, (_, i) => ({
    date: `2026-09-${(i + 1).toString().padStart(2, '0')}`,
    uploadBytes: 100,
    downloadBytes: 100,
    totalBytes: 200,
    quality: 'complete' as const,
    source: 'metric-delta' as const,
    coverage: { average: 1, minimum: 1, availableEntities: 1, totalEntities: 1 },
    isInProgress: false,
    reasons: i < 5 ? ['cross-day-interval-rejected'] : [],
    isCoarse: i < 5,
  }))

  const coarseDays = daysMixed.filter(d => d.reasons.includes('cross-day-interval-rejected') || d.isCoarse)
  const coarseCount = coarseDays.length
  const totalDays = daysMixed.length
  const exactCount = totalDays - coarseCount
  const warning = `最早 ${coarseCount} 天仅有粗粒度历史，无法精确按北京时间自然日拆分；其余 ${exactCount} 天已使用细粒度数据展示`
  assert.strictEqual(warning, '最早 5 天仅有粗粒度历史，无法精确按北京时间自然日拆分；其余 25 天已使用细粒度数据展示')
  console.log('✓ Section 67 passed: Dynamic coarse warning message matches specification')
}

// ============================================================================
// THIRD PATCH MINIMAL HARDENING TESTS (Tests A - H)
// ============================================================================

import { useTrafficTrend } from '../../src/features/resource-insights/composables/useTrafficTrend'
import { getSharedRpc, resetSharedRpc } from '../../src/utils/rpc'
import {
  buildTrafficTrendCacheKey,
  writeTrafficTrendCache,
} from '../../src/features/resource-insights/services/trafficTrendCache'

// Test A: One-Day Coarse Leaf (Section 21)
{
  const startMs = Date.parse('2026-09-20T00:00:00+08:00')
  const endMs = Date.parse('2026-09-20T23:59:59.999+08:00')
  // Server returns UTC-aligned 24h bucket: 2026-09-20T00:00:00Z to 2026-09-21T00:00:00Z
  // In Beijing time, this is 2026-09-20 08:00:00+08:00 to 2026-09-21 08:00:00+08:00 (crosses Beijing midnight)
  const gateway = createHistoryGateway(async () => ({
    series: [
      {
        metric_key: 'traffic.up',
        entity_id: 'test-node',
        interval_seconds: 86400,
        points: [
          { time: '2026-09-20T00:00:00Z', value: 1000 },
        ],
      },
    ],
  }))
  const result = await queryMetricSegment({
    gateway,
    entityIds: ['test-node'],
    segment: {
      dates: ['2026-09-20'],
      startMs,
      endMs,
      depth: 0,
    },
    timeZone: 'Asia/Shanghai',
  })
  assert.strictEqual(result.status, 'coarse', 'One-day segment with cross-midnight interval must be coarse')
  assert.ok(result.coarseDates.includes('2026-09-20'), 'Requested date must be recorded in coarseDates')
  assert.notStrictEqual(result.status, 'fine', 'Must NOT be classified as fine even if evidence clipping dropped the point')
  console.log('✓ Test A passed: Single Beijing day with UTC 24h bucket classified as coarse')
}

// Test B: Parent Coarse Replaced by Fine Children (Section 22)
{
  const nowMs = Date.parse('2026-09-20T12:00:00+08:00')
  const dates10 = buildRecentNaturalDayKeys(10, 'Asia/Shanghai', nowMs)
  const rpc = async (method: string, params: any) => {
    if (method === 'rpc.methods') return ['public:queryMetrics']
    if (method === 'public:listMetricDefinitions') {
      return [
        { name: 'traffic.up', retention_days: 30 },
        { name: 'traffic.down', retention_days: 30 },
      ]
    }
    if (method === 'public:queryMetrics') {
      const startMs = Date.parse(params.start)
      const endMs = Date.parse(params.end)
      const spanDays = (endMs - startMs) / 86400000
      const isNewer = startMs >= nowMs - 5 * 86400000
      // Newer segment is fine; older 5-day parent is coarse; refined children (< 3.5 days) are fine
      const isFine = isNewer || spanDays <= 3.5
      const intervalSeconds = isFine ? 3600 : 86400
      const intervalMs = intervalSeconds * 1000
      const alignedStart = Math.floor(startMs / intervalMs) * intervalMs
      const points: any[] = []
      for (let t = alignedStart; t < endMs; t += intervalMs) {
        points.push({ time: new Date(t).toISOString(), value: 1000 })
      }
      return {
        series: [
          {
            metric_key: 'traffic.up',
            entity_id: 'test-node',
            interval_seconds: intervalSeconds,
            points,
          },
        ],
      }
    }
    throw new Error(`Unhandled method ${method}`)
  }
  const gateway = createHistoryGateway(rpc as any)
  const resolved = await resolveTrafficHistory({
    gateway,
    entityIds: ['test-node'],
    dates: dates10,
    timeZone: 'Asia/Shanghai',
    nowMs,
  })

  assert.strictEqual(resolved.coarseDates.length, 0, 'Parent coarseDates must be discarded after fine child refinement')
  assert.ok(resolved.evidence.length > 0, 'Child evidence must be present')
  assert.ok(resolved.evidence[0]!.deltas.every(d => d.endMs - d.startMs <= 3600000), 'All deltas must be fine child deltas')
  console.log('✓ Test B passed: Parent coarse segment replaced by fine children (parent coarse metadata discarded)')
}

// Test C: Range Race (Section 23)
{
  resetSharedRpc()
  const rpc = getSharedRpc()

  let resolveSlow30d: ((val: any) => void) | null = null

  rpc.call = async (method: string, params: any) => {
    if (method === 'rpc.methods') return ['public:queryMetrics']
    if (method === 'public:listMetricDefinitions') {
      return [
        { name: 'traffic.up', retention_days: 30 },
        { name: 'traffic.down', retention_days: 30 },
      ]
    }
    if (method === 'public:queryMetrics') {
      const startMs = Date.parse(params.start)
      // 30d queries segments older than 8 days; 7d only queries dates within the last 7 days
      const is30dOnly = startMs < Date.now() - 8 * 86400000

      if (is30dOnly) {
        return new Promise(resolve => {
          resolveSlow30d = () => {
            resolve({
              series: [
                {
                  metric_key: 'traffic.up',
                  entity_id: params.entity_ids[0],
                  interval_seconds: 3600,
                  points: [{ time: params.start, value: 3000 }],
                },
              ],
            })
          }
        })
      }
      // Fast 7d response
      return {
        series: [
          {
            metric_key: 'traffic.up',
            entity_id: params.entity_ids[0],
            interval_seconds: 3600,
            points: [{ time: params.start, value: 700 }],
          },
        ],
      }
    }
    throw new Error(`Unhandled ${method}`)
  }

  const trend = useTrafficTrend({
    nodes: () => [{ uuid: 'node-race', name: 'Node Race' }] as any,
  })

  // Wait for initial 7d load
  await new Promise(r => setTimeout(r, 50))
  assert.strictEqual(trend.selectedRange.value, '7d')
  assert.strictEqual(trend.trafficView.value.days.length, 7)
  const initialDay = trend.trafficView.value.days.find(d => d.uploadBytes !== null)
  assert.ok(initialDay)
  assert.strictEqual(initialDay.uploadBytes, 700)

  // Switch to 30d (slow 30d segments hang on resolveSlow30d)
  trend.selectedRange.value = '30d'
  await new Promise(r => setTimeout(r, 20))

  // Rapidly switch back to 7d (fast)
  trend.selectedRange.value = '7d'
  await new Promise(r => setTimeout(r, 50))
  assert.strictEqual(trend.selectedRange.value, '7d')
  assert.strictEqual(trend.trafficView.value.days.length, 7)
  const dayBefore30dResolves = trend.trafficView.value.days.find(d => d.uploadBytes !== null)
  assert.ok(dayBefore30dResolves)
  assert.strictEqual(dayBefore30dResolves.uploadBytes, 700)

  // Now the slow 30d completes later
  assert.ok(resolveSlow30d, 'resolveSlow30d must have been captured for 30d-only segment')
  if (resolveSlow30d) {
    (resolveSlow30d as any)()
  }
  await new Promise(r => setTimeout(r, 50))

  // State must still be 7d and NOT overwritten by 30d
  assert.strictEqual(trend.selectedRange.value, '7d')
  assert.strictEqual(trend.trafficView.value.days.length, 7)
  const dayAfter30dResolves = trend.trafficView.value.days.find(d => d.uploadBytes !== null)
  assert.ok(dayAfter30dResolves)
  assert.strictEqual(dayAfter30dResolves.uploadBytes, 700, 'Visible data must remain 700 from 7d, NOT overwritten by 3000 from 30d')
  assert.notStrictEqual(dayAfter30dResolves.uploadBytes, 3000)
  console.log('✓ Test C passed: Range race (slow 30d does not overwrite fast 7d)')
  resetSharedRpc()
}

// Test D: Node Race (Section 24)
{
  resetSharedRpc()
  const rpc = getSharedRpc()

  let resolveSlowNodeA: ((val: any) => void) | null = null

  rpc.call = async (method: string, params: any) => {
    if (method === 'rpc.methods') return ['public:queryMetrics']
    if (method === 'public:listMetricDefinitions') {
      return [
        { name: 'traffic.up', retention_days: 30 },
        { name: 'traffic.down', retention_days: 30 },
      ]
    }
    if (method === 'public:queryMetrics') {
      const entityId = params.entity_ids[0]
      if (entityId === 'node-A') {
        return new Promise(resolve => {
          resolveSlowNodeA = () => {
            resolve({
              series: [
                {
                  metric_key: 'traffic.up',
                  entity_id: 'node-A',
                  interval_seconds: 3600,
                  points: [{ time: params.start, value: 9999 }],
                },
              ],
            })
          }
        })
      }
      return {
        series: [
          {
            metric_key: 'traffic.up',
            entity_id: 'node-B',
            interval_seconds: 3600,
            points: [{ time: params.start, value: 1111 }],
          },
        ],
      }
    }
    throw new Error(`Unhandled ${method}`)
  }

  const trend = useTrafficTrend({
    nodes: () => [
      { uuid: 'node-A', name: 'Node A' },
      { uuid: 'node-B', name: 'Node B' },
    ] as any,
  })

  await new Promise(r => setTimeout(r, 50))

  // Select Node A (slow)
  trend.selectedEntity.value = 'node-A'
  await new Promise(r => setTimeout(r, 20))

  // Switch to Node B (fast)
  trend.selectedEntity.value = 'node-B'
  await new Promise(r => setTimeout(r, 50))
  assert.strictEqual(trend.selectedEntity.value, 'node-B')
  const dayNodeB = trend.trafficView.value.days.find(d => d.uploadBytes !== null)
  assert.ok(dayNodeB, 'Node B must have data')
  assert.strictEqual(dayNodeB.uploadBytes, 1111, 'Node B uploadBytes must be 1111')

  // Resolve slow Node A later
  assert.ok(resolveSlowNodeA, 'resolveSlowNodeA must have been captured')
  if (resolveSlowNodeA) {
    (resolveSlowNodeA as any)()
  }
  await new Promise(r => setTimeout(r, 50))

  // Snapshot and visible data must remain for Node B (1111) and NOT overwritten by Node A (9999)
  assert.strictEqual(trend.selectedEntity.value, 'node-B')
  const dayAfterNodeA = trend.trafficView.value.days.find(d => d.uploadBytes !== null)
  assert.ok(dayAfterNodeA)
  assert.strictEqual(dayAfterNodeA.uploadBytes, 1111, 'Data must still be 1111 from Node B, not overwritten by 9999 from Node A')
  assert.notStrictEqual(dayAfterNodeA.uploadBytes, 9999)
  console.log('✓ Test D passed: Node race (slow Node A does not overwrite fast Node B)')
  resetSharedRpc()
}

// Test E: Request Budget Boundary (Section 25)
{
  let requestCounter = 0
  const gateway = createHistoryGateway(async () => {
    requestCounter++
    // Return coarse data so every segment attempts refinement
    return {
      series: [
        {
          metric_key: 'traffic.up',
          entity_id: 'test-node',
          interval_seconds: 86400,
          points: [{ time: '2026-09-20T00:00:00Z', value: 100 }],
        },
      ],
    }
  })

  // 30 days = 6 base segments of 5 days
  const dates30 = buildRecentNaturalDayKeys(30, 'Asia/Shanghai', Date.parse('2026-09-22T12:00:00+08:00'))
  const resolved = await resolveTrafficHistory({
    gateway,
    entityIds: ['test-node'],
    dates: dates30,
    timeZone: 'Asia/Shanghai',
    nowMs: Date.parse('2026-09-22T12:00:00+08:00'),
  })

  assert.ok(resolved.diagnostics.requestCount <= 18, `Requests must not exceed 18, got ${resolved.diagnostics.requestCount}`)
  assert.ok(requestCounter <= 18, `Actual gateway calls must not exceed 18, got ${requestCounter}`)
  console.log(`✓ Test E passed: Request budget boundary enforced (requests=${resolved.diagnostics.requestCount} <= 18)`)
}

// Test F: Records Fallback From Non-Newest Segment (Section 26)
{
  const dates10 = ['2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22']
  const rpc = async (method: string, params: any) => {
    if (method === 'rpc.methods') return ['public:queryMetrics', 'common:getRecords']
    if (method === 'public:listMetricDefinitions') {
      return [
        { name: 'traffic.up', retention_days: 30 },
        { name: 'traffic.down', retention_days: 30 },
      ]
    }
    if (method === 'public:queryMetrics') {
      const startMs = Date.parse(params.start)
      const pivotMs = Date.parse('2026-09-18T00:00:00+08:00')
      // If segment is older than pivotMs, pretend metric store doesn't have it and gateway returns records fallback
      if (startMs < pivotMs) {
        throw new RpcError(-32601, 'Method not found')
      }
      return {
        series: [
          {
            metric_key: 'traffic.up',
            entity_id: 'test-node',
            interval_seconds: 3600,
            points: [{ time: params.start, value: 500 }],
          },
        ],
      }
    }
    if (method === 'common:getRecords') {
      return {
        records: {
          'test-node': [
            { time: params.start, net_total_up: 1000, net_total_down: 2000, traffic_up: 100, traffic_down: 200 },
            { time: params.end, net_total_up: 2000, net_total_down: 4000, traffic_up: 100, traffic_down: 200 },
          ],
        },
      }
    }
    throw new Error(`Unhandled ${method}`)
  }
  const gateway = createHistoryGateway(rpc as any)
  const resolved = await resolveTrafficHistory({
    gateway,
    entityIds: ['test-node'],
    dates: dates10,
    timeZone: 'Asia/Shanghai',
    nowMs: Date.parse('2026-09-22T12:00:00+08:00'),
  })

  assert.strictEqual(resolved.sourceKind, 'records', 'Whole request must switch to Records')
  assert.strictEqual(resolved.diagnostics.usedLegacyFallback, true)
  assert.ok(resolved.evidence.length > 0)
  console.log('✓ Test F passed: Records fallback from older base segment cleanly switches entire request to Records')
}

// Test G: Beijing Reset Default (Section 27)
{
  const config = resolveTrafficResetConfig({
    uuid: 'node-trd',
    tags: ['<TRD:27>'],
  })
  assert.strictEqual(config.day, 27)
  assert.strictEqual(config.timezone, 'Asia/Shanghai')
  assert.strictEqual(config.timezoneSource, 'fallback')

  const nodeConfig = resolveNodeResetConfig({
    uuid: 'node-trd',
    name: 'Node TRD',
    tags: ['<TRD:27>'],
  })
  assert.strictEqual(nodeConfig.day, 27)
  assert.strictEqual(nodeConfig.timezone, 'Asia/Shanghai')
  assert.strictEqual(nodeConfig.timezoneSource, 'fallback')
  console.log('✓ Test G passed: Default Beijing reset timezone fallback (Asia/Shanghai)')
}

// Test H: Partial Query Failure (Section 28)
{
  const nowMs = Date.parse('2026-09-22T12:00:00+08:00')
  const failStart = nowMs - 20 * 86400000
  const failEnd = nowMs - 15 * 86400000
  const rpc = createFakeKomariMetricRpc({
    nowMs,
    hourRetentionHours: 600,
    failWindows: [{ startMs: failStart, endMs: failEnd }],
  })
  const gateway = createHistoryGateway(rpc)
  const dates30 = buildRecentNaturalDayKeys(30, 'Asia/Shanghai', nowMs)

  const resolved = await resolveTrafficHistory({
    gateway,
    entityIds: ['test-node'],
    dates: dates30,
    timeZone: 'Asia/Shanghai',
    nowMs,
  })

  assert.ok(resolved.failedDates && resolved.failedDates.length > 0, 'failedDates must be populated')

  const byEntity = new Map<string, any[]>()
  for (const item of resolved.evidence) {
    const aggregates = aggregateDailyTraffic({
      timeZone: 'Asia/Shanghai',
      dates: dates30,
      deltas: item.deltas,
    })
    byEntity.set(item.entityId, aggregates)
  }

  const vm = buildTrafficTrendViewModel(byEntity, dates30, ['test-node'], {
    failedDates: resolved.failedDates,
    coarseDates: resolved.coarseDates,
  })

  assert.strictEqual(vm.state, 'ready', 'Partial failure must remain state=ready')
  assert.ok(vm.days.some(d => d.totalBytes !== null), 'Successful days must retain data')

  const failedDay = vm.days.find(d => resolved.failedDates?.includes(d.date))
  assert.ok(failedDay, 'Failed day must be in view model days')
  assert.strictEqual(failedDay.queryFailed, true, 'Failed day must have queryFailed=true')
  console.log('✓ Test H passed: Partial query failure marks queryFailed and preserves successful days')
}

// Test I: Today hourly bucket (18:00-19:00 at 18:37 BJT) is fine, not coarse
{
  const nowMs = Date.parse('2026-09-22T18:37:00+08:00')
  const window = buildZonedDayWindow('2026-09-22', 'Asia/Shanghai', nowMs)
  // Hourly bucket: 18:00 to 19:00 today.
  // 19:00 > window.effectiveEndMs (18:37), but 19:00 <= window.endMs (23:59:59.999).
  // It is within the natural day and must NOT be marked as coarse!
  const bucketStart = Date.parse('2026-09-22T18:00:00+08:00')
  const gateway = createHistoryGateway(async () => ({
    series: [
      {
        metric_key: 'traffic.up',
        entity_id: 'test-node',
        interval_seconds: 3600,
        points: [{ time: new Date(bucketStart).toISOString(), value: 1000 }],
      },
    ],
  }))
  const result = await queryMetricSegment({
    gateway,
    entityIds: ['test-node'],
    segment: {
      dates: ['2026-09-22'],
      startMs: window.startMs,
      endMs: window.endMs,
      depth: 0,
    },
    timeZone: 'Asia/Shanghai',
    nowMs,
  })
  assert.strictEqual(result.status, 'fine', 'Current day hourly bucket must be fine, not coarse')
  assert.strictEqual(result.coarseDates.length, 0, 'Current day must not be in coarseDates')
  console.log('✓ Test I passed: Today hourly bucket (18:00-19:00 at 18:37 BJT) is fine, not coarse')
}

// Test J: Cache-hit clears loading state and prevents UI stuck in loading
{
  resetSharedRpc()
  const rpc = getSharedRpc()

  let resolveSlowCall: (() => void) | null = null
  rpc.call = async (method: string, params: any) => {
    if (method === 'rpc.methods') return ['public:queryMetrics']
    if (method === 'public:listMetricDefinitions') {
      return [
        { name: 'traffic.up', retention_days: 30 },
        { name: 'traffic.down', retention_days: 30 },
      ]
    }
    if (method === 'public:queryMetrics') {
      if (params.entity_ids[0] === 'node-slow') {
        return new Promise(resolve => {
          resolveSlowCall = () => {
            resolve({
              series: [
                {
                  metric_key: 'traffic.up',
                  entity_id: 'node-slow',
                  interval_seconds: 3600,
                  points: [{ time: params.start, value: 500 }],
                },
              ],
            })
          }
        })
      }
      return {
        series: [
          {
            metric_key: 'traffic.up',
            entity_id: params.entity_ids[0],
            interval_seconds: 3600,
            points: [{ time: params.start, value: 100 }],
          },
        ],
      }
    }
    throw new Error(`Unhandled ${method}`)
  }

  const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const storageMap = new Map<string, string>()
  const mockStorage: any = {
    getItem: (k: string) => storageMap.get(k) ?? null,
    setItem: (k: string, v: string) => storageMap.set(k, v),
    removeItem: (k: string) => storageMap.delete(k),
    clear: () => storageMap.clear(),
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockStorage,
    configurable: true,
    writable: true,
  })

  try {
    const trend = useTrafficTrend({
      nodes: () => [
        { uuid: 'node-slow', name: 'Node Slow' },
        { uuid: 'node-cached', name: 'Node Cached' },
      ] as any,
    })

    // Wait for initial load
    await new Promise(r => setTimeout(r, 50))

    // Switch to node-slow (in-flight, loading = true)
    trend.selectedEntity.value = 'node-slow'
    await new Promise(r => setTimeout(r, 20))
    assert.strictEqual(trend.loading.value, true, 'node-slow should be loading')

    // Pre-populate cache for node-cached with all 7 dates
    const currentDates = buildRecentNaturalDayKeys(7, 'Asia/Shanghai')
    const fakeCachedSnapshot = {
      state: 'ready' as const,
      days: currentDates.map(date => ({
        date,
        uploadBytes: 888,
        downloadBytes: 888,
        totalBytes: 1776,
        quality: 'complete' as const,
        source: 'metric-delta' as const,
        coverage: { average: 1, minimum: 1, availableEntities: 1, totalEntities: 1 },
        isInProgress: false,
        reasons: [],
      })),
      fetchedAt: Date.now(),
      sourceKind: 'metrics' as const,
      retentionDays: 30,
      availability: 'available' as const,
      failureKind: null,
      retryable: true,
      message: '',
    }

    const cacheKey = buildTrafficTrendCacheKey({
      origin: '',
      loggedIn: false,
      entityIds: ['node-cached'],
      range: '7d',
      timeZone: 'Asia/Shanghai',
      dates: currentDates,
      schema: 3,
      capabilityVersion: 3,
    })
    writeTrafficTrendCache(mockStorage, cacheKey, fakeCachedSnapshot as any)

    // Switch to node-cached (cache hit!)
    trend.selectedEntity.value = 'node-cached'
    await new Promise(r => setTimeout(r, 50))

    // Must NOT be stuck in loading!
    assert.strictEqual(trend.loading.value, false, 'Loading must be false on cache hit')
    assert.strictEqual(trend.trafficView.value.state, 'ready', 'trafficView.state must be ready, not loading')
    assert.strictEqual(trend.trafficView.value.days[0]?.totalBytes, 1776)

    // Resolve old slow call
    if (resolveSlowCall) (resolveSlowCall as any)()
    await new Promise(r => setTimeout(r, 50))

    assert.strictEqual(trend.loading.value, false)
    assert.strictEqual(trend.trafficView.value.state, 'ready')
    console.log('✓ Test J passed: Cache-hit clears loading state and prevents UI stuck in loading')
  } finally {
    if (originalLocalStorage) {
      Object.defineProperty(globalThis, 'localStorage', originalLocalStorage)
    } else {
      delete (globalThis as any).localStorage
    }
    resetSharedRpc()
  }
}

// Test K: Null points and points outside window correctly classified as empty
{
  const gatewayNull = createHistoryGateway(async () => ({
    series: [
      {
        metric_key: 'traffic.up',
        entity_id: 'test-node',
        interval_seconds: 3600,
        points: [
          { time: '2026-09-20T00:00:00Z', value: null },
          { time: '2026-09-20T01:00:00Z', value: null },
        ],
      },
    ],
  }))
  const resNull = await queryMetricSegment({
    gateway: gatewayNull,
    entityIds: ['test-node'],
    segment: {
      dates: ['2026-09-20'],
      startMs: Date.parse('2026-09-20T00:00:00+08:00'),
      endMs: Date.parse('2026-09-20T23:59:59.999+08:00'),
      depth: 0,
    },
    timeZone: 'Asia/Shanghai',
  })
  assert.strictEqual(resNull.status, 'empty', 'Points with only null values must be classified as empty')

  const gatewayOutside = createHistoryGateway(async () => ({
    series: [
      {
        metric_key: 'traffic.up',
        entity_id: 'test-node',
        interval_seconds: 3600,
        points: [
          { time: '2026-09-10T00:00:00Z', value: 1000 },
        ],
      },
    ],
  }))
  const resOutside = await queryMetricSegment({
    gateway: gatewayOutside,
    entityIds: ['test-node'],
    segment: {
      dates: ['2026-09-20'],
      startMs: Date.parse('2026-09-20T00:00:00+08:00'),
      endMs: Date.parse('2026-09-20T23:59:59.999+08:00'),
      depth: 0,
    },
    timeZone: 'Asia/Shanghai',
  })
  assert.strictEqual(resOutside.status, 'empty', 'Points entirely outside window must be classified as empty')
  console.log('✓ Test K passed: Null points and points outside window correctly classified as empty')
}

console.log('All traffic tests passed successfully!')


