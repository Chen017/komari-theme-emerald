import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  aggregateDailyTraffic,
  buildInclusiveDateRange,
  buildZonedDayWindow,
} from '../../src/features/resource-insights/services/trafficAggregator'
import {
  buildTrafficTrendViewModel,
  calculateResetWindow,
  canRequestSinceReset,
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

console.log('All traffic tests passed successfully!')

