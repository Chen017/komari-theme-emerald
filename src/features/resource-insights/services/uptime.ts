import type { NodeData } from '@/stores/nodes'
import type { NormalizedMetricPoint, NormalizedMetricSeries, RawStatusRecord } from '../types/history'
import { buildObservationTimeline, type ObservationTimeline } from './observationCoverage'

export const SECONDS_30_DAYS = 30 * 24 * 3600
export const MAX_HEARTBEAT_GAP_SECONDS = 300 // 5 minutes

export interface UptimeDiagnostics {
  nodeUuid: string
  rangeStart: number
  rangeEnd: number
  requestedSeconds: number

  retentionStart: number | null
  retentionCoveredSeconds: number

  observerBlackoutSeconds: number
  observableSeconds: number

  expectedHealthyCount: number | null

  totalBuckets: number
  observableBuckets: number
  unobservedBuckets: number
  partialBuckets: number
  zeroSampleObservableBuckets: number

  onlineSeconds: number
  offlineSeconds: number

  uptimeRatio: number | null
  monitoringCoverageRatio: number
}

export interface NodeUptime30d {
  uuid: string
  name: string
  uptimeRatio: number | null
  uptimeText: string
  coveredSeconds: number
  observableSeconds: number
  onlineSeconds: number
  controllerBlackoutSeconds: number
  retentionUncoveredSeconds: number
  requestedSeconds: number
  coverageRatio: number
  monitoringCoverageRatio: number
  coverageText: string
  source: 'metrics' | 'legacy' | 'unavailable'
  status: 'complete' | 'partial' | 'unavailable'
  isOnline: boolean
  diagnostics?: UptimeDiagnostics
}

export interface FleetUptime30d {
  fleetUptimeRatio: number | null
  fleetUptimeText: string
  nodes: NodeUptime30d[]
  totalNodes: number
  completeNodes: number
  partialNodes: number
  unavailableNodes: number
  totalControllerBlackoutSeconds?: number
  source: 'metrics' | 'legacy' | 'unavailable'
}

function calculateMedian(arr: number[]): number {
  if (arr.length === 0) return 0
  const mid = Math.floor(arr.length / 2)
  return arr.length % 2 === 1 ? arr[mid]! : (arr[mid - 1]! + arr[mid]!) / 2
}

/**
 * Calculates 30-day uptime using Metric Store series (cpu.usage with fill_empty=true).
 * Excludes controller/observer blackout windows from denominator and numerator.
 */
export function calculateNode30dUptimeFromMetrics(
  node: NodeData,
  series: NormalizedMetricSeries | undefined,
  now = new Date(),
  timeline?: ObservationTimeline,
): NodeUptime30d {
  const isOnline = Boolean(node.online)
  const requestedSeconds = SECONDS_30_DAYS
  const windowEndMs = now.getTime()
  const windowStartMs = windowEndMs - requestedSeconds * 1000

  const points = series?.points ?? []
  if (points.length === 0) {
    return {
      uuid: node.uuid,
      name: node.name,
      uptimeRatio: null,
      uptimeText: '--',
      coveredSeconds: 0,
      observableSeconds: 0,
      onlineSeconds: 0,
      controllerBlackoutSeconds: 0,
      retentionUncoveredSeconds: requestedSeconds,
      requestedSeconds,
      coverageRatio: 0,
      monitoringCoverageRatio: 0,
      coverageText: '无历史数据',
      source: 'unavailable',
      status: 'unavailable',
      isOnline,
    }
  }

  // 1. Determine bucket duration in seconds
  let bucketSeconds = typeof series?.intervalSeconds === 'number' && series.intervalSeconds > 0
    ? series.intervalSeconds
    : 0
  if (bucketSeconds <= 0 && points.length >= 2) {
    const diffs: number[] = []
    for (let i = 1; i < points.length; i++) {
      const d = (Date.parse(points[i]!.time) - Date.parse(points[i - 1]!.time)) / 1000
      if (d > 0) diffs.push(d)
    }
    if (diffs.length > 0) {
      diffs.sort((a, b) => a - b)
      bucketSeconds = calculateMedian(diffs)
    }
  }
  if (bucketSeconds <= 0) {
    bucketSeconds = 3600 // default 1 hour if indeterminate
  }

  // 2. Find earliest meaningful retained metric point (first point with count > 0 or value !== null)
  const firstActiveIdx = points.findIndex(
    p => (typeof p.count === 'number' && p.count > 0) || (p.value !== null),
  )

  if (firstActiveIdx === -1 && (!timeline || timeline.earliestTelemetryMs === null)) {
    // No points have any data in the window
    return {
      uuid: node.uuid,
      name: node.name,
      uptimeRatio: null,
      uptimeText: '--',
      coveredSeconds: 0,
      observableSeconds: 0,
      onlineSeconds: 0,
      controllerBlackoutSeconds: 0,
      retentionUncoveredSeconds: requestedSeconds,
      requestedSeconds,
      coverageRatio: 0,
      monitoringCoverageRatio: 0,
      coverageText: '无历史数据',
      source: 'unavailable',
      status: 'unavailable',
      isOnline,
    }
  }

  // Node retention start must be strictly derived from the node's own history.
  // Never pull it backward to fleet earliestTelemetryMs, which would treat unobserved pre-node time as downtime!
  // Per Section 6 & 7: Do not let fill_empty=true create fake 30-day coverage when server retention or node history is shorter.
  const firstPointMs = points.length > 0 ? Date.parse(points[0]!.time) : windowStartMs
  let nodeRetentionStartMs = Number.isFinite(firstPointMs)
    ? Math.max(windowStartMs, firstPointMs)
    : windowStartMs

  if (node.created_at) {
    const nodeCreatedMs = Date.parse(node.created_at)
    if (Number.isFinite(nodeCreatedMs) && nodeCreatedMs > nodeRetentionStartMs) {
      nodeRetentionStartMs = nodeCreatedMs
    }
  }

  // Server metric retention policy limit (e.g. Komari default 1 day)
  if (typeof series?.retentionDays === 'number' && series.retentionDays > 0) {
    const policyStartMs = windowEndMs - series.retentionDays * 86400 * 1000
    if (policyStartMs > nodeRetentionStartMs) {
      nodeRetentionStartMs = policyStartMs
    }
  }

  // If fill_empty generated an extended stretch of empty points before the first observed metric
  // (e.g. >= 1 day before any active telemetry), align retention start with the first observed metric
  if (firstActiveIdx > 0) {
    const firstObservedPoint = points[firstActiveIdx]!
    const firstObservedMs = Date.parse(firstObservedPoint.time)
    if (Number.isFinite(firstObservedMs) && firstObservedMs - nodeRetentionStartMs >= 86400 * 1000) {
      nodeRetentionStartMs = firstObservedMs
    }
  }

  const startEvaluateMs = nodeRetentionStartMs
  const retentionUncoveredSeconds = Math.max(0, (startEvaluateMs - windowStartMs) / 1000)

  // Find start index in points matching startEvaluateMs
  let startIdx = 0
  if (startEvaluateMs > windowStartMs) {
    const idx = points.findIndex(p => Date.parse(p.time) + bucketSeconds * 1000 > startEvaluateMs)
    if (idx >= 0) startIdx = idx
  }

  // 3. Estimate expected healthy sample count dynamically using median of positive counts.
  // Exclude first and last points (boundary buckets) and blackout buckets to avoid skewing baseline.
  const positiveCounts: number[] = []
  for (let i = 0; i < points.length; i++) {
    if (points.length > 2 && (i === 0 || i === points.length - 1)) {
      continue
    }
    const p = points[i]!
    const bucketStartMs = Date.parse(p.time)
    if (timeline && timeline.isBlackout(bucketStartMs)) {
      continue
    }
    const c = p.count
    if (typeof c === 'number' && c > 0) {
      positiveCounts.push(c)
    }
  }
  if (positiveCounts.length === 0) {
    for (let i = 0; i < points.length; i++) {
      const c = points[i]!.count
      if (typeof c === 'number' && c > 0) {
        positiveCounts.push(c)
      }
    }
  }
  positiveCounts.sort((a, b) => a - b)
  const expectedCount = calculateMedian(positiveCounts)

  // 4. Compute availability and coverage from startIdx onwards
  let onlineSeconds = 0
  let observedSeconds = 0
  let controllerBlackoutSeconds = 0
  let observableBuckets = 0
  let unobservedBuckets = 0
  let partialBuckets = 0
  let zeroSampleObservableBuckets = 0

  for (let i = startIdx; i < points.length; i++) {
    const p = points[i]!
    const bucketStartMs = Date.parse(p.time)
    if (!Number.isFinite(bucketStartMs)) continue

    const bucketEndMs = bucketStartMs + bucketSeconds * 1000
    // Intersection with requested window and retention bound
    const startMs = Math.max(bucketStartMs, startEvaluateMs)
    const endMs = Math.min(bucketEndMs, windowEndMs)
    const effectiveBucketSeconds = Math.max(0, (endMs - startMs) / 1000)

    if (effectiveBucketSeconds <= 0) continue

    // If observation timeline indicates controller blackout in this bucket:
    // Exclude bucket from both numerator and denominator!
    if (timeline && timeline.isBlackout(bucketStartMs)) {
      controllerBlackoutSeconds += effectiveBucketSeconds
      unobservedBuckets++
      continue
    }

    observableBuckets++

    const actualCount = typeof p.count === 'number'
      ? p.count
      : (p.value !== null ? 1 : 0)
    const hasSamples = actualCount > 0 || p.value !== null

    const isCurrentActiveBucket = bucketEndMs >= windowEndMs && bucketStartMs < windowEndMs
    if (isCurrentActiveBucket && !isOnline) {
      // Live tail rule: node is currently offline!
      // Per Section 3 & 4: Only use node.time as agent status heartbeat. Never use updated_at.
      const statusTimeMs = Date.parse(node.time)
      const lastHeartbeatMs = Number.isFinite(statusTimeMs) ? statusTimeMs : null
      const graceMs = 60 * 1000
      const offlineStartMs = lastHeartbeatMs !== null
        ? Math.max(startMs, lastHeartbeatMs + graceMs)
        : startMs

      // Pre-offline portion in this bucket (if any)
      const activeOnlineSeconds = Math.max(0, (Math.min(endMs, offlineStartMs) - startMs) / 1000)
      const activeOfflineSeconds = Math.max(0, (endMs - Math.max(startMs, offlineStartMs)) / 1000)

      if (hasSamples) {
        onlineSeconds += activeOnlineSeconds
      }
      observedSeconds += effectiveBucketSeconds
      if (activeOfflineSeconds > 0) {
        zeroSampleObservableBuckets++
      }
      continue
    }

    const isBucketOnline = hasSamples
    const onlineFraction = isBucketOnline ? 1 : 0

    if (!isBucketOnline) {
      zeroSampleObservableBuckets++
    }

    onlineSeconds += effectiveBucketSeconds * onlineFraction
    observedSeconds += effectiveBucketSeconds
  }

  // 5. Handle potential tail gap if the last bucket ended before windowEndMs
  const lastPoint = points.at(-1)!
  const lastBucketEndMs = Date.parse(lastPoint.time) + bucketSeconds * 1000
  if (Number.isFinite(lastBucketEndMs) && lastBucketEndMs < windowEndMs) {
    const tailGapSeconds = (windowEndMs - lastBucketEndMs) / 1000
    if (tailGapSeconds > 0) {
      if (timeline && timeline.isBlackout(lastBucketEndMs)) {
        controllerBlackoutSeconds += tailGapSeconds
        unobservedBuckets++
      } else {
        observedSeconds += tailGapSeconds
        observableBuckets++
        if (isOnline) {
          onlineSeconds += tailGapSeconds
        } else {
          zeroSampleObservableBuckets++
        }
        // If !isOnline, 0 credited: counts as confirmed downtime!
      }
    }
  }

  const coveredSeconds = observedSeconds
  const coverageRatio = Math.min(1, Math.max(0, coveredSeconds / requestedSeconds))
  const monitorableDuration = Math.max(0, requestedSeconds - retentionUncoveredSeconds - controllerBlackoutSeconds)
  const monitoringCoverageRatio = monitorableDuration > 0
    ? Math.min(1, Math.max(0, observedSeconds / (requestedSeconds - retentionUncoveredSeconds)))
    : 0

  const uptimeRatio = observedSeconds > 0
    ? Math.min(1, Math.max(0, onlineSeconds / observedSeconds))
    : null

  const status: NodeUptime30d['status'] = coverageRatio >= 0.95
    ? 'complete'
    : coverageRatio > 0
      ? 'partial'
      : 'unavailable'

  let coverageText = '无历史数据'
  if (status === 'complete') {
    coverageText = controllerBlackoutSeconds > 0
      ? `30 / 30 天 (主控不可观测 ${(controllerBlackoutSeconds / 3600).toFixed(1)}h)`
      : '30 / 30 天'
  } else if (status === 'partial') {
    const daysCovered = coveredSeconds / 86400
    coverageText = `覆盖约 ${daysCovered >= 1 ? daysCovered.toFixed(1) : daysCovered.toFixed(2)} / 30 天`
  }

  const uptimeText = uptimeRatio !== null
    ? `${(uptimeRatio * 100).toFixed(2)}%`
    : '--'

  const offlineSeconds = Math.max(0, observedSeconds - onlineSeconds)
  const diagnostics: UptimeDiagnostics = {
    nodeUuid: node.uuid,
    rangeStart: windowStartMs,
    rangeEnd: windowEndMs,
    requestedSeconds,
    retentionStart: startEvaluateMs,
    retentionCoveredSeconds: Math.max(0, requestedSeconds - retentionUncoveredSeconds),
    observerBlackoutSeconds: controllerBlackoutSeconds,
    observableSeconds: observedSeconds,
    expectedHealthyCount: expectedCount > 0 ? expectedCount : null,
    totalBuckets: points.length,
    observableBuckets,
    unobservedBuckets,
    partialBuckets,
    zeroSampleObservableBuckets,
    onlineSeconds,
    offlineSeconds,
    uptimeRatio,
    monitoringCoverageRatio,
  }

  if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.debug(
      `[Uptime30d] node=${node.name} requested=${requestedSeconds}s retention=${diagnostics.retentionCoveredSeconds}s observer_blackout=${controllerBlackoutSeconds}s observable=${observedSeconds}s online=${onlineSeconds}s offline=${offlineSeconds}s coverage=${coverageRatio.toFixed(3)} expected_count=${expectedCount} uptime=${uptimeText}`,
    )
  }

  return {
    uuid: node.uuid,
    name: node.name,
    uptimeRatio,
    uptimeText,
    coveredSeconds,
    observableSeconds: observedSeconds,
    onlineSeconds,
    controllerBlackoutSeconds,
    retentionUncoveredSeconds,
    requestedSeconds,
    coverageRatio,
    monitoringCoverageRatio,
    coverageText,
    source: 'metrics',
    status,
    isOnline,
    diagnostics,
  }
}

/**
 * Calculates 30-day uptime for a single node from legacy status records (compatibility fallback).
 */
export function calculateNode30dUptimeFromRecords(
  node: NodeData,
  records: readonly RawStatusRecord[] = [],
  now = new Date(),
  timeline?: ObservationTimeline,
): NodeUptime30d {
  const isOnline = Boolean(node.online)
  const requestedSeconds = SECONDS_30_DAYS
  const windowEndMs = now.getTime()
  const windowStartMs = windowEndMs - requestedSeconds * 1000

  // 1. Filter valid historical status records within window
  const validRecords = records
    .map(r => ({ record: r, atMs: Date.parse(r.time) }))
    .filter(r => Number.isFinite(r.atMs) && r.atMs >= windowStartMs && r.atMs <= windowEndMs)
    .sort((a, b) => a.atMs - b.atMs)

  if (validRecords.length < 2) {
    // Section 16: No usable historical records -> unavailable, never fall back to node.uptime 100%
    return {
      uuid: node.uuid,
      name: node.name,
      uptimeRatio: null,
      uptimeText: '--',
      coveredSeconds: 0,
      observableSeconds: 0,
      onlineSeconds: 0,
      controllerBlackoutSeconds: 0,
      retentionUncoveredSeconds: requestedSeconds,
      requestedSeconds,
      coverageRatio: 0,
      monitoringCoverageRatio: 0,
      coverageText: '无历史数据',
      source: 'unavailable',
      status: 'unavailable',
      isOnline,
    }
  }

  const firstMs = validRecords[0]!.atMs
  const lastMs = validRecords.at(-1)!.atMs
  const retentionUncoveredSeconds = Math.max(0, (firstMs - windowStartMs) / 1000)
  const rawCoveredSeconds = Math.min(requestedSeconds, Math.max(0, (windowEndMs - firstMs) / 1000))

  // Determine normal reporting cadence from median delta
  const rawGaps: number[] = []
  for (let i = 1; i < validRecords.length; i++) {
    const g = (validRecords[i]!.atMs - validRecords[i - 1]!.atMs) / 1000
    if (g > 0) rawGaps.push(g)
  }
  rawGaps.sort((a, b) => a - b)

  const cadence = rawGaps.length > 0 ? calculateMedian(rawGaps) : MAX_HEARTBEAT_GAP_SECONDS
  const maxAllowedGap = Math.max(MAX_HEARTBEAT_GAP_SECONDS, cadence * 2.2)

  let onlineSeconds = 0
  let observedSeconds = 0
  let controllerBlackoutSeconds = 0
  let partialBuckets = 0
  let unobservedBuckets = 0
  let observableBuckets = 0

  for (let i = 1; i < validRecords.length; i++) {
    const prev = validRecords[i - 1]!
    const curr = validRecords[i]!
    const gapSeconds = (curr.atMs - prev.atMs) / 1000

    if (gapSeconds > 0) {
      if (timeline && timeline.isBlackout(prev.atMs)) {
        controllerBlackoutSeconds += gapSeconds
        unobservedBuckets++
      }
      else if (gapSeconds <= maxAllowedGap) {
        onlineSeconds += gapSeconds
        observedSeconds += gapSeconds
        observableBuckets++
      }
      else {
        // Outage occurred: credit cadence, remainder is downtime
        onlineSeconds += Math.min(gapSeconds, cadence)
        observedSeconds += gapSeconds
        observableBuckets++
        partialBuckets++
      }
    }
  }

  // Evaluate tail gap from last record to now
  const tailGapSeconds = Math.max(0, (windowEndMs - lastMs) / 1000)
  if (tailGapSeconds > 0) {
    if (timeline && timeline.isBlackout(lastMs)) {
      controllerBlackoutSeconds += tailGapSeconds
      unobservedBuckets++
    }
    else {
      observedSeconds += tailGapSeconds
      observableBuckets++
      if (isOnline) {
        if (tailGapSeconds <= maxAllowedGap) {
          onlineSeconds += tailGapSeconds
        }
        else {
          onlineSeconds += Math.min(tailGapSeconds, cadence)
          partialBuckets++
        }
      }
      // If !isOnline, 0 credited: counts as confirmed downtime!
    }
  }

  const coveredSeconds = observedSeconds
  const coverageRatio = Math.min(1, Math.max(0, coveredSeconds / requestedSeconds))
  const monitoringCoverageRatio = Math.max(0, requestedSeconds - retentionUncoveredSeconds) > 0
    ? Math.min(1, Math.max(0, observedSeconds / (requestedSeconds - retentionUncoveredSeconds)))
    : 0

  const uptimeRatio = observedSeconds > 0
    ? Math.min(1, Math.max(0, onlineSeconds / observedSeconds))
    : null

  const status: NodeUptime30d['status'] = coverageRatio >= 0.95
    ? 'complete'
    : coverageRatio > 0
      ? 'partial'
      : 'unavailable'

  let coverageText = '无历史数据'
  if (status === 'complete') {
    coverageText = controllerBlackoutSeconds > 0
      ? `30 / 30 天 (主控不可观测 ${(controllerBlackoutSeconds / 3600).toFixed(1)}h)`
      : '30 / 30 天'
  } else if (status === 'partial') {
    coverageText = `覆盖 ${(coveredSeconds / 86400).toFixed(1)} / 30 天`
  }

  const uptimeText = uptimeRatio !== null
    ? `${(uptimeRatio * 100).toFixed(2)}%`
    : '--'

  const offlineSeconds = Math.max(0, observedSeconds - onlineSeconds)
  const diagnostics: UptimeDiagnostics = {
    nodeUuid: node.uuid,
    rangeStart: windowStartMs,
    rangeEnd: windowEndMs,
    requestedSeconds,
    retentionStart: firstMs,
    retentionCoveredSeconds: rawCoveredSeconds,
    observerBlackoutSeconds: controllerBlackoutSeconds,
    observableSeconds: observedSeconds,
    expectedHealthyCount: null,
    totalBuckets: validRecords.length,
    observableBuckets,
    unobservedBuckets,
    partialBuckets,
    zeroSampleObservableBuckets: 0,
    onlineSeconds,
    offlineSeconds,
    uptimeRatio,
    monitoringCoverageRatio,
  }

  return {
    uuid: node.uuid,
    name: node.name,
    uptimeRatio,
    uptimeText,
    coveredSeconds,
    observableSeconds: observedSeconds,
    onlineSeconds,
    controllerBlackoutSeconds,
    retentionUncoveredSeconds,
    requestedSeconds,
    coverageRatio,
    monitoringCoverageRatio,
    coverageText,
    source: 'legacy',
    status,
    isOnline,
    diagnostics,
  }
}

/**
 * Unified node 30-day uptime calculation dispatching to metrics or legacy records.
 */
export function calculateNode30dUptime(
  node: NodeData,
  sourceData: { kind: 'metrics', series?: NormalizedMetricSeries, timeline?: ObservationTimeline } | { kind: 'records', records?: readonly RawStatusRecord[], timeline?: ObservationTimeline } | readonly RawStatusRecord[] = [],
  now = new Date(),
  timeline?: ObservationTimeline,
): NodeUptime30d {
  if (Array.isArray(sourceData)) {
    return calculateNode30dUptimeFromRecords(node, sourceData, now, timeline)
  }
  const resolvedTimeline = timeline ?? sourceData.timeline
  if (sourceData.kind === 'metrics') {
    return calculateNode30dUptimeFromMetrics(node, sourceData.series, now, resolvedTimeline)
  }
  return calculateNode30dUptimeFromRecords(node, sourceData.records ?? [], now, resolvedTimeline)
}

/**
 * Calculates fleet-wide 30-day uptime summary with unified observation coverage timeline.
 */
export function calculateFleet30dUptime(
  nodes: readonly NodeData[],
  sourceData: {
    kind: 'metrics'
    seriesByNode?: Record<string, NormalizedMetricSeries>
    probeEvidenceTimes?: number[]
  } | {
    kind: 'records'
    recordsByNode?: Record<string, RawStatusRecord[]>
    probeEvidenceTimes?: number[]
  } | Record<string, RawStatusRecord[]> = {},
  now = new Date(),
): FleetUptime30d {
  let source: 'metrics' | 'legacy' | 'unavailable' = 'unavailable'
  let nodeUptimes: NodeUptime30d[] = []
  let totalControllerBlackoutSeconds = 0

  const windowEndMs = now.getTime()
  const windowStartMs = windowEndMs - SECONDS_30_DAYS * 1000

  if (!Array.isArray(sourceData) && typeof sourceData === 'object' && 'kind' in sourceData) {
    if (sourceData.kind === 'metrics') {
      source = 'metrics'
      const timeline = buildObservationTimeline({
        seriesByNode: sourceData.seriesByNode,
        probeEvidenceTimes: sourceData.probeEvidenceTimes,
        windowStartMs,
        windowEndMs,
      })
      totalControllerBlackoutSeconds = timeline.controllerBlackoutSeconds

      nodeUptimes = nodes.map(node =>
        calculateNode30dUptimeFromMetrics(node, sourceData.seriesByNode?.[node.uuid], now, timeline),
      )
    }
    else {
      source = 'legacy'
      const timeline = buildObservationTimeline({
        recordsByNode: sourceData.recordsByNode,
        probeEvidenceTimes: sourceData.probeEvidenceTimes,
        windowStartMs,
        windowEndMs,
      })
      totalControllerBlackoutSeconds = timeline.controllerBlackoutSeconds

      nodeUptimes = nodes.map(node =>
        calculateNode30dUptimeFromRecords(node, sourceData.recordsByNode?.[node.uuid] ?? [], now, timeline),
      )
    }
  }
  else {
    source = 'legacy'
    const recordsMap = sourceData as Record<string, RawStatusRecord[]>
    const timeline = buildObservationTimeline({
      recordsByNode: recordsMap,
      windowStartMs,
      windowEndMs,
    })
    totalControllerBlackoutSeconds = timeline.controllerBlackoutSeconds

    nodeUptimes = nodes.map(node =>
      calculateNode30dUptimeFromRecords(node, recordsMap[node.uuid] ?? [], now, timeline),
    )
  }

  const availableNodes = nodeUptimes.filter(n => n.uptimeRatio !== null && n.status !== 'unavailable')
  let fleetUptimeRatio: number | null = null

  if (availableNodes.length > 0) {
    const totalCovered = availableNodes.reduce((sum, n) => sum + n.coveredSeconds, 0)
    if (totalCovered > 0) {
      fleetUptimeRatio = availableNodes.reduce((sum, n) => sum + (n.uptimeRatio! * n.coveredSeconds), 0) / totalCovered
    }
    else {
      fleetUptimeRatio = availableNodes.reduce((sum, n) => sum + n.uptimeRatio!, 0) / availableNodes.length
    }
  }
  else {
    source = 'unavailable'
  }

  return {
    fleetUptimeRatio,
    fleetUptimeText: fleetUptimeRatio !== null ? `${(fleetUptimeRatio * 100).toFixed(2)}%` : '--',
    nodes: nodeUptimes,
    totalNodes: nodes.length,
    completeNodes: nodeUptimes.filter(n => n.status === 'complete').length,
    partialNodes: nodeUptimes.filter(n => n.status === 'partial').length,
    unavailableNodes: nodeUptimes.filter(n => n.status === 'unavailable').length,
    totalControllerBlackoutSeconds,
    source,
  }
}

