import type { TrafficHistoryResult } from './historyGateway'
import type { EntityTrafficEvidence } from './trafficEvidence'
import {
  aggregateDailyTraffic,
  buildZonedDayWindow,
} from './trafficAggregator'
import {
  mergeTrafficEvidence,
  metricsToTrafficEvidence,
  recordsToTrafficEvidence,
} from './trafficEvidence'

export const BASE_SEGMENT_DAYS = 5
export const MAX_CONCURRENCY = 2
export const MAX_REFINEMENT_DEPTH = 4
export const MAX_TOTAL_METRIC_REQUESTS = 18

export interface TrafficHistoryWindow {
  startMs: number
  endMs: number
  startDate?: string
  endDate?: string
  reason?: string
}

export interface TrafficHistorySegment {
  dates: string[]
  startMs: number
  endMs: number
  depth: number
}

export interface SegmentResolution {
  segment: TrafficHistorySegment
  status: 'fine' | 'coarse' | 'empty' | 'failed' | 'records'
  evidence: EntityTrafficEvidence[]
  retentionDays: number | null
  maxObservedIntervalSeconds: number | null
  coarseDates: string[]
  failedDates?: string[]
  error?: unknown
}

export interface ResolvedTrafficHistory {
  sourceKind: 'metrics' | 'records'
  evidence: EntityTrafficEvidence[]
  retentionDays: number | null
  coarseWindows: TrafficHistoryWindow[]
  failedWindows: TrafficHistoryWindow[]
  coarseDates: string[]
  failedDates: string[]
  diagnostics: {
    requestCount: number
    baseSegmentCount: number
    refinedSegmentCount: number
    maxObservedIntervalSeconds: number | null
    usedLegacyFallback: boolean
    monotonicityAnomaly: boolean
  }
}

export function buildTrafficHistorySegments(
  dates: string[],
  timeZone: string,
  nowMs = Date.now(),
): TrafficHistorySegment[] {
  if (dates.length === 0)
    return []

  if (dates.length <= 7) {
    const firstDate = dates[0]!
    const lastDate = dates.at(-1)!
    const firstWindow = buildZonedDayWindow(firstDate, timeZone, nowMs)
    const lastWindow = buildZonedDayWindow(lastDate, timeZone, nowMs)
    const startMs = firstWindow.startMs
    const endMs = Math.max(startMs + 1000, lastWindow.effectiveEndMs)
    return [{
      dates: [...dates],
      startMs,
      endMs,
      depth: 0,
    }]
  }

  const segments: TrafficHistorySegment[] = []
  for (let i = 0; i < dates.length; i += BASE_SEGMENT_DAYS) {
    const chunk = dates.slice(i, i + BASE_SEGMENT_DAYS)
    const firstDate = chunk[0]!
    const lastDate = chunk.at(-1)!
    const firstWindow = buildZonedDayWindow(firstDate, timeZone, nowMs)
    const lastWindow = buildZonedDayWindow(lastDate, timeZone, nowMs)
    const startMs = firstWindow.startMs
    const endMs = Math.max(startMs + 1000, lastWindow.effectiveEndMs)
    segments.push({
      dates: chunk,
      startMs,
      endMs,
      depth: 0,
    })
  }
  return segments
}

export function calculateMaxPointsForHourlyTarget(
  startMs: number,
  endMs: number,
): number {
  const hours = Math.ceil((endMs - startMs) / 3600000)
  return Math.max(48, hours + 8)
}

export interface QueryMetricSegmentOptions {
  gateway: {
    queryTraffic: (query: any) => Promise<TrafficHistoryResult>
  }
  entityIds: string[]
  segment: TrafficHistorySegment
  timeZone: string
  nowMs: number
  signal?: AbortSignal
}

export async function queryMetricSegment(
  options: QueryMetricSegmentOptions,
): Promise<SegmentResolution> {
  const { gateway, entityIds, segment, timeZone, nowMs, signal } = options

  if (signal?.aborted)
    throw new DOMException('Aborted', 'AbortError')

  const queryStart = new Date(segment.startMs).toISOString()
  const queryEnd = new Date(segment.endMs).toISOString()
  const maxPoints = calculateMaxPointsForHourlyTarget(segment.startMs, segment.endMs)

  let result: TrafficHistoryResult
  try {
    result = await gateway.queryTraffic({
      entityIds,
      start: queryStart,
      end: queryEnd,
      maxPoints,
      signal,
    })
  }
  catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      throw error

    return {
      segment,
      status: 'failed',
      evidence: [],
      retentionDays: null,
      maxObservedIntervalSeconds: null,
      coarseDates: [],
      failedDates: [...segment.dates],
      error,
    }
  }

  if (result.kind === 'unavailable') {
    return {
      segment,
      status: 'failed',
      evidence: [],
      retentionDays: null,
      maxObservedIntervalSeconds: null,
      coarseDates: [],
      failedDates: [...segment.dates],
      error: result.error ?? result.reason,
    }
  }

  if (result.kind === 'records') {
    return {
      segment,
      status: 'records',
      evidence: [],
      retentionDays: null,
      maxObservedIntervalSeconds: null,
      coarseDates: [],
      failedDates: [],
    }
  }

  const evidence = metricsToTrafficEvidence(result.series, {
    startMs: segment.startMs,
    endMs: segment.endMs,
  })

  const hasUsablePoints = result.series.some((s) => {
    if (!s.points || s.points.length === 0) return false
    const intervalMs = (s.intervalSeconds ?? 0) * 1000
    return s.points.some((p) => {
      if (p.value === null || typeof p.value !== 'number') return false
      const t = Date.parse(p.time)
      if (!Number.isFinite(t)) return false
      const endT = t + (intervalMs > 0 ? intervalMs : 0)
      return t < segment.endMs && endT > segment.startMs
    })
  })

  if (!hasUsablePoints) {
    return {
      segment,
      status: 'empty',
      evidence: [],
      retentionDays: result.retentionDays,
      maxObservedIntervalSeconds: null,
      coarseDates: [],
      failedDates: [],
    }
  }

  const coarseDatesSet = new Set<string>()

  // Raw interval inspection: inspect metric intervals directly from raw series
  for (const s of result.series) {
    let intervalMs = (s.intervalSeconds ?? 0) * 1000
    if ((!Number.isFinite(intervalMs) || intervalMs <= 0) && s.points.length >= 2) {
      const t0 = Date.parse(s.points[0]!.time)
      const t1 = Date.parse(s.points[1]!.time)
      if (Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0) {
        intervalMs = t1 - t0
      }
    }
    for (const point of s.points) {
      if (point.value === null)
        continue
      const startMs = Date.parse(point.time)
      const endMs = startMs + (Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 0)
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs)
        continue

      for (const date of segment.dates) {
        const window = buildZonedDayWindow(date, timeZone, nowMs)
        // Check if interval overlaps this requested natural day
        if (startMs < window.effectiveEndMs && endMs > window.startMs) {
          // If interval crosses natural day boundary (not contained within window.startMs and window.endMs), mark as coarse!
          if (startMs < window.startMs || endMs > window.endMs) {
            coarseDatesSet.add(date)
          }
        }
      }
    }
  }

  for (const item of evidence) {
    const aggregates = aggregateDailyTraffic({
      timeZone,
      dates: segment.dates,
      nowMs,
      deltas: item.deltas,
      counters: item.counters,
    })
    for (const a of aggregates) {
      if (a.reasons.includes('cross-day-interval-rejected')) {
        coarseDatesSet.add(a.date)
      }
    }
  }

  const coarseDates = Array.from(coarseDatesSet).sort()
  const isCoarse = coarseDates.length > 0

  let maxObservedIntervalSeconds: number | null = null
  for (const s of result.series) {
    if (typeof s.intervalSeconds === 'number' && Number.isFinite(s.intervalSeconds)) {
      maxObservedIntervalSeconds = maxObservedIntervalSeconds === null
        ? s.intervalSeconds
        : Math.max(maxObservedIntervalSeconds, s.intervalSeconds)
    }
  }

  return {
    segment,
    status: isCoarse ? 'coarse' : 'fine',
    evidence,
    retentionDays: result.retentionDays,
    maxObservedIntervalSeconds,
    coarseDates,
    failedDates: [],
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let index = 0
  async function worker() {
    while (index < items.length) {
      if (signal?.aborted)
        throw new DOMException('Aborted', 'AbortError')
      const current = index++
      results[current] = await fn(items[current]!)
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

export interface ResolveTrafficHistoryOptions {
  gateway: {
    queryTraffic: (query: any) => Promise<TrafficHistoryResult>
    queryLegacyRecords: (query: any, entityIds: string[]) => Promise<any>
  }
  entityIds: string[]
  dates: string[]
  timeZone: string
  nowMs?: number
  signal?: AbortSignal
}

export async function resolveTrafficHistory(
  options: ResolveTrafficHistoryOptions,
): Promise<ResolvedTrafficHistory> {
  const nowMs = options.nowMs ?? Date.now()
  const baseSegments = buildTrafficHistorySegments(options.dates, options.timeZone, nowMs)

  if (baseSegments.length === 0) {
    return {
      sourceKind: 'metrics',
      evidence: [],
      retentionDays: null,
      coarseWindows: [],
      failedWindows: [],
      coarseDates: [],
      failedDates: [],
      diagnostics: {
        requestCount: 0,
        baseSegmentCount: 0,
        refinedSegmentCount: 0,
        maxObservedIntervalSeconds: null,
        usedLegacyFallback: false,
        monotonicityAnomaly: false,
      },
    }
  }

  let requestCount = 0
  let refinedSegmentCount = 0
  let maxObservedIntervalSeconds: number | null = null
  let usedLegacyFallback = false
  let monotonicityAnomaly = false

  async function executeLegacyFallback(): Promise<ResolvedTrafficHistory> {
    usedLegacyFallback = true
    const firstWindow = buildZonedDayWindow(options.dates[0]!, options.timeZone, nowMs)
    const lastWindow = buildZonedDayWindow(options.dates.at(-1)!, options.timeZone, nowMs)
    const legacyStart = new Date(firstWindow.startMs - 86400000).toISOString()
    const legacyEnd = new Date(lastWindow.effectiveEndMs + 86400000).toISOString()
    requestCount += 1
    const legacyResult = await options.gateway.queryLegacyRecords({
      entityIds: options.entityIds,
      start: legacyStart,
      end: legacyEnd,
      signal: options.signal,
    }, options.entityIds)
    const evidence = recordsToTrafficEvidence(legacyResult.records, {
      sampled: legacyResult.sampled ?? false,
      window: { startMs: firstWindow.startMs - 86400000, endMs: lastWindow.effectiveEndMs + 86400000 },
    })
    return {
      sourceKind: 'records',
      evidence,
      retentionDays: null,
      coarseWindows: [],
      failedWindows: [],
      coarseDates: [],
      failedDates: [],
      diagnostics: {
        requestCount,
        baseSegmentCount: baseSegments.length,
        refinedSegmentCount: 0,
        maxObservedIntervalSeconds: null,
        usedLegacyFallback: true,
        monotonicityAnomaly: false,
      },
    }
  }

  // Single segment case (<= 7 days)
  if (baseSegments.length === 1) {
    requestCount += 1
    const res = await queryMetricSegment({
      gateway: options.gateway,
      entityIds: options.entityIds,
      segment: baseSegments[0]!,
      timeZone: options.timeZone,
      nowMs,
      signal: options.signal,
    })

    if (res.status === 'records')
      return await executeLegacyFallback()

    const coarseWindows: TrafficHistoryWindow[] = []
    const failedWindows: TrafficHistoryWindow[] = []
    if (res.status === 'failed') {
      failedWindows.push({
        startMs: res.segment.startMs,
        endMs: res.segment.endMs,
        startDate: res.segment.dates[0],
        endDate: res.segment.dates.at(-1),
        reason: String(res.error ?? 'failed'),
      })
    }
    else if (res.status === 'coarse') {
      coarseWindows.push({
        startMs: res.segment.startMs,
        endMs: res.segment.endMs,
        startDate: res.segment.dates[0],
        endDate: res.segment.dates.at(-1),
      })
    }

    const coarseDates = [...res.coarseDates].sort()
    const failedDates = res.status === 'failed'
      ? (res.failedDates && res.failedDates.length > 0 ? [...res.failedDates] : [...res.segment.dates])
      : []

    return {
      sourceKind: 'metrics',
      evidence: res.evidence,
      retentionDays: res.retentionDays,
      coarseWindows,
      failedWindows,
      coarseDates,
      failedDates,
      diagnostics: {
        requestCount,
        baseSegmentCount: 1,
        refinedSegmentCount: 0,
        maxObservedIntervalSeconds: res.maxObservedIntervalSeconds,
        usedLegacyFallback: false,
        monotonicityAnomaly: false,
      },
    }
  }

  // Multi-segment case:
  // Step 1: Query the newest base segment first
  const newestSegment = baseSegments[baseSegments.length - 1]!
  requestCount += 1
  const newestRes = await queryMetricSegment({
    gateway: options.gateway,
    entityIds: options.entityIds,
    segment: newestSegment,
    timeZone: options.timeZone,
    nowMs,
    signal: options.signal,
  })

  if (newestRes.status === 'records')
    return await executeLegacyFallback()

  if (newestRes.maxObservedIntervalSeconds) {
    maxObservedIntervalSeconds = Math.max(
      maxObservedIntervalSeconds ?? 0,
      newestRes.maxObservedIntervalSeconds,
    )
  }

  // Step 2: Query remaining base segments with bounded concurrency
  const remainingSegments = baseSegments.slice(0, -1)
  const remainingResults = await runWithConcurrency(
    remainingSegments,
    MAX_CONCURRENCY,
    async (seg) => {
      requestCount += 1
      return queryMetricSegment({
        gateway: options.gateway,
        entityIds: options.entityIds,
        segment: seg,
        timeZone: options.timeZone,
        nowMs,
        signal: options.signal,
      })
    },
    options.signal,
  )

  // Section 16: If any base segment switches to records, fallback whole request to records
  if (remainingResults.some(r => r.status === 'records'))
    return await executeLegacyFallback()

  for (const r of remainingResults) {
    if (r.maxObservedIntervalSeconds) {
      maxObservedIntervalSeconds = Math.max(
        maxObservedIntervalSeconds ?? 0,
        r.maxObservedIntervalSeconds,
      )
    }
  }

  const baseResults: SegmentResolution[] = [...remainingResults, newestRes]

  // Step 3: Adaptive Refinement
  // Find newest coarse segment (search right-to-left)
  let coarseIndex = -1
  for (let i = baseResults.length - 1; i >= 0; i--) {
    if (baseResults[i]!.status === 'coarse') {
      coarseIndex = i
      break
    }
  }

  async function refineSegment(
    seg: TrafficHistorySegment,
  ): Promise<SegmentResolution[]> {
    // Section 15: Fix request budget off-by-one
    if (
      seg.dates.length <= 1
      || seg.depth >= MAX_REFINEMENT_DEPTH
      || requestCount + 2 > MAX_TOTAL_METRIC_REQUESTS
    ) {
      return []
    }
    if (options.signal?.aborted)
      throw new DOMException('Aborted', 'AbortError')

    const mid = Math.floor(seg.dates.length / 2)
    const olderDates = seg.dates.slice(0, mid)
    const newerDates = seg.dates.slice(mid)

    const olderSeg: TrafficHistorySegment = {
      dates: olderDates,
      startMs: buildZonedDayWindow(olderDates[0]!, options.timeZone, nowMs).startMs,
      endMs: Math.max(
        buildZonedDayWindow(olderDates[0]!, options.timeZone, nowMs).startMs + 1000,
        buildZonedDayWindow(olderDates.at(-1)!, options.timeZone, nowMs).effectiveEndMs,
      ),
      depth: seg.depth + 1,
    }
    const newerSeg: TrafficHistorySegment = {
      dates: newerDates,
      startMs: buildZonedDayWindow(newerDates[0]!, options.timeZone, nowMs).startMs,
      endMs: Math.max(
        buildZonedDayWindow(newerDates[0]!, options.timeZone, nowMs).startMs + 1000,
        buildZonedDayWindow(newerDates.at(-1)!, options.timeZone, nowMs).effectiveEndMs,
      ),
      depth: seg.depth + 1,
    }

    requestCount += 2
    refinedSegmentCount += 2

    const [olderRes, newerRes] = await Promise.all([
      queryMetricSegment({
        gateway: options.gateway,
        entityIds: options.entityIds,
        segment: olderSeg,
        timeZone: options.timeZone,
        nowMs,
        signal: options.signal,
      }),
      queryMetricSegment({
        gateway: options.gateway,
        entityIds: options.entityIds,
        segment: newerSeg,
        timeZone: options.timeZone,
        nowMs,
        signal: options.signal,
      }),
    ])

    if (olderRes.maxObservedIntervalSeconds) {
      maxObservedIntervalSeconds = Math.max(
        maxObservedIntervalSeconds ?? 0,
        olderRes.maxObservedIntervalSeconds,
      )
    }
    if (newerRes.maxObservedIntervalSeconds) {
      maxObservedIntervalSeconds = Math.max(
        maxObservedIntervalSeconds ?? 0,
        newerRes.maxObservedIntervalSeconds,
      )
    }

    // Case A: older coarse, newer fine -> retention boundary in/before older child
    if (olderRes.status === 'coarse' && newerRes.status === 'fine') {
      if (
        olderSeg.dates.length > 1
        && olderSeg.depth < MAX_REFINEMENT_DEPTH
        && requestCount + 2 <= MAX_TOTAL_METRIC_REQUESTS
      ) {
        const sub = await refineSegment(olderSeg)
        if (sub.length > 0)
          return [...sub, newerRes]
      }
      return [olderRes, newerRes]
    }

    // Case B: older coarse, newer coarse -> refine newer child
    if (olderRes.status === 'coarse' && newerRes.status === 'coarse') {
      if (
        newerSeg.dates.length > 1
        && newerSeg.depth < MAX_REFINEMENT_DEPTH
        && requestCount + 2 <= MAX_TOTAL_METRIC_REQUESTS
      ) {
        const sub = await refineSegment(newerSeg)
        if (sub.length > 0)
          return [olderRes, ...sub]
      }
      return [olderRes, newerRes]
    }

    // Case C: older fine, newer fine -> both fine
    if (olderRes.status === 'fine' && newerRes.status === 'fine')
      return [olderRes, newerRes]

    // Case D: older fine, newer coarse -> monotonicity anomaly
    if (olderRes.status === 'fine' && newerRes.status === 'coarse') {
      monotonicityAnomaly = true
      return [olderRes, newerRes]
    }

    // Case E / Other (empty or failed): stop recursion
    return [olderRes, newerRes]
  }

  let leafResults: SegmentResolution[] = baseResults
  if (coarseIndex !== -1 && baseResults[coarseIndex]!.segment.dates.length > 1) {
    const refinedLeaves = await refineSegment(baseResults[coarseIndex]!.segment)
    if (refinedLeaves.length > 0) {
      // Discard parent coarse segment, replace with leaf children (Section 23)
      leafResults = [
        ...baseResults.slice(0, coarseIndex),
        ...refinedLeaves,
        ...baseResults.slice(coarseIndex + 1),
      ]
    }
  }

  // Step 4: Aggregate leaf evidence
  const failedWindows: TrafficHistoryWindow[] = []
  const coarseWindows: TrafficHistoryWindow[] = []
  const evidenceList: EntityTrafficEvidence[][] = []
  const coarseDatesSet = new Set<string>()
  const failedDatesSet = new Set<string>()
  let retentionDays: number | null = null

  for (const res of leafResults) {
    if (res.status === 'failed') {
      failedWindows.push({
        startMs: res.segment.startMs,
        endMs: res.segment.endMs,
        startDate: res.segment.dates[0],
        endDate: res.segment.dates.at(-1),
        reason: String(res.error ?? 'failed'),
      })
      for (const d of (res.failedDates && res.failedDates.length > 0 ? res.failedDates : res.segment.dates)) {
        failedDatesSet.add(d)
      }
    }
    else {
      if (res.status === 'coarse') {
        coarseWindows.push({
          startMs: res.segment.startMs,
          endMs: res.segment.endMs,
          startDate: res.segment.dates[0],
          endDate: res.segment.dates.at(-1),
        })
      }
      for (const d of res.coarseDates) {
        coarseDatesSet.add(d)
      }
      if (res.evidence.length > 0)
        evidenceList.push(res.evidence)
      if (typeof res.retentionDays === 'number' && Number.isFinite(res.retentionDays)) {
        retentionDays = retentionDays === null
          ? res.retentionDays
          : Math.min(retentionDays, res.retentionDays)
      }
    }
  }

  const mergedEvidence = mergeTrafficEvidence(evidenceList)

  return {
    sourceKind: 'metrics',
    evidence: mergedEvidence,
    retentionDays,
    coarseWindows,
    failedWindows,
    coarseDates: Array.from(coarseDatesSet).sort(),
    failedDates: Array.from(failedDatesSet).sort(),
    diagnostics: {
      requestCount,
      baseSegmentCount: baseSegments.length,
      refinedSegmentCount,
      maxObservedIntervalSeconds,
      usedLegacyFallback,
      monotonicityAnomaly,
    },
  }
}
