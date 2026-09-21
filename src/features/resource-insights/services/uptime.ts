import type { NodeData } from '@/stores/nodes'
import type { NormalizedMetricPoint, NormalizedMetricSeries, RawStatusRecord } from '../types/history'

export const SECONDS_30_DAYS = 30 * 24 * 3600
export const MAX_HEARTBEAT_GAP_SECONDS = 300 // 5 minutes

export interface NodeUptime30d {
  uuid: string
  name: string
  uptimeRatio: number | null
  uptimeText: string
  coveredSeconds: number
  requestedSeconds: number
  coverageRatio: number
  coverageText: string
  source: 'metrics' | 'legacy' | 'unavailable'
  status: 'complete' | 'partial' | 'unavailable'
  isOnline: boolean
}

export interface FleetUptime30d {
  fleetUptimeRatio: number | null
  fleetUptimeText: string
  nodes: NodeUptime30d[]
  totalNodes: number
  completeNodes: number
  partialNodes: number
  unavailableNodes: number
  source: 'metrics' | 'legacy' | 'unavailable'
}

function calculateMedian(arr: number[]): number {
  if (arr.length === 0) return 0
  const mid = Math.floor(arr.length / 2)
  return arr.length % 2 === 1 ? arr[mid]! : (arr[mid - 1]! + arr[mid]!) / 2
}

/**
 * Calculates 30-day uptime using Metric Store series (cpu.usage with fill_empty=true).
 */
export function calculateNode30dUptimeFromMetrics(
  node: NodeData,
  series: NormalizedMetricSeries | undefined,
  now = new Date(),
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
      requestedSeconds,
      coverageRatio: 0,
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

  if (firstActiveIdx === -1) {
    // No points have any data in the window
    return {
      uuid: node.uuid,
      name: node.name,
      uptimeRatio: null,
      uptimeText: '--',
      coveredSeconds: 0,
      requestedSeconds,
      coverageRatio: 0,
      coverageText: '无历史数据',
      source: 'unavailable',
      status: 'unavailable',
      isOnline,
    }
  }

  // 3. Estimate expected healthy sample count dynamically using median of positive counts
  const positiveCounts: number[] = []
  for (let i = firstActiveIdx; i < points.length; i++) {
    const c = points[i]!.count
    if (typeof c === 'number' && c > 0) {
      positiveCounts.push(c)
    }
  }
  positiveCounts.sort((a, b) => a - b)
  const expectedCount = calculateMedian(positiveCounts)

  // 4. Compute availability and coverage from firstActiveIdx onwards
  let onlineSeconds = 0
  let observedSeconds = 0

  for (let i = firstActiveIdx; i < points.length; i++) {
    const p = points[i]!
    const bucketStartMs = Date.parse(p.time)
    if (!Number.isFinite(bucketStartMs)) continue

    const bucketEndMs = bucketStartMs + bucketSeconds * 1000
    // Intersection with requested window
    const startMs = Math.max(bucketStartMs, windowStartMs)
    const endMs = Math.min(bucketEndMs, windowEndMs)
    const effectiveBucketSeconds = Math.max(0, (endMs - startMs) / 1000)

    if (effectiveBucketSeconds <= 0) continue

    const actualCount = typeof p.count === 'number'
      ? p.count
      : (p.value !== null ? 1 : 0)

    const onlineFraction = expectedCount > 0
      ? Math.max(0, Math.min(1, actualCount / expectedCount))
      : (p.value !== null ? 1 : 0)

    onlineSeconds += effectiveBucketSeconds * onlineFraction
    observedSeconds += effectiveBucketSeconds
  }

  // 5. Handle potential tail gap if the last bucket ended before windowEndMs
  const lastPoint = points.at(-1)!
  const lastBucketEndMs = Date.parse(lastPoint.time) + bucketSeconds * 1000
  if (Number.isFinite(lastBucketEndMs) && lastBucketEndMs < windowEndMs) {
    const tailGapSeconds = (windowEndMs - lastBucketEndMs) / 1000
    if (tailGapSeconds > 0) {
      observedSeconds += tailGapSeconds
      if (isOnline) {
        onlineSeconds += tailGapSeconds
      }
      // If !isOnline, 0 credited: counts as downtime!
    }
  }

  const coveredSeconds = observedSeconds
  const coverageRatio = Math.min(1, Math.max(0, coveredSeconds / requestedSeconds))
  const uptimeRatio = observedSeconds > 0
    ? Math.min(1, Math.max(0, onlineSeconds / observedSeconds))
    : null

  const status: NodeUptime30d['status'] = coverageRatio >= 0.95
    ? 'complete'
    : coverageRatio > 0
      ? 'partial'
      : 'unavailable'

  const coverageText = status === 'complete'
    ? '30 / 30 天'
    : status === 'partial'
      ? `覆盖 ${(coveredSeconds / 86400).toFixed(1)} / 30 天`
      : '无历史数据'

  const uptimeText = uptimeRatio !== null
    ? `${(uptimeRatio * 100).toFixed(2)}%`
    : '--'

  return {
    uuid: node.uuid,
    name: node.name,
    uptimeRatio,
    uptimeText,
    coveredSeconds,
    requestedSeconds,
    coverageRatio,
    coverageText,
    source: 'metrics',
    status,
    isOnline,
  }
}

/**
 * Calculates 30-day uptime for a single node from legacy status records (compatibility fallback).
 */
export function calculateNode30dUptimeFromRecords(
  node: NodeData,
  records: readonly RawStatusRecord[] = [],
  now = new Date(),
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
      requestedSeconds,
      coverageRatio: 0,
      coverageText: '无历史数据',
      source: 'unavailable',
      status: 'unavailable',
      isOnline,
    }
  }

  const firstMs = validRecords[0]!.atMs
  const lastMs = validRecords.at(-1)!.atMs
  const coveredSeconds = Math.min(requestedSeconds, Math.max(0, (windowEndMs - firstMs) / 1000))

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
  for (let i = 1; i < validRecords.length; i++) {
    const prev = validRecords[i - 1]!
    const curr = validRecords[i]!
    const gapSeconds = (curr.atMs - prev.atMs) / 1000

    if (gapSeconds > 0) {
      if (gapSeconds <= maxAllowedGap) {
        onlineSeconds += gapSeconds
      }
      else {
        // Outage occurred: only credit the single sample cadence, the rest is downtime
        onlineSeconds += Math.min(gapSeconds, cadence)
      }
    }
  }

  // Evaluate tail gap from last record to now
  const tailGapSeconds = Math.max(0, (windowEndMs - lastMs) / 1000)
  if (tailGapSeconds > 0) {
    if (isOnline) {
      if (tailGapSeconds <= maxAllowedGap) {
        onlineSeconds += tailGapSeconds
      }
      else {
        onlineSeconds += Math.min(tailGapSeconds, cadence)
      }
    }
    // If !isOnline, 0 credited: counts as downtime!
  }

  onlineSeconds = Math.min(coveredSeconds, onlineSeconds)
  const coverageRatio = Math.min(1, Math.max(0, coveredSeconds / requestedSeconds))
  const uptimeRatio = coveredSeconds > 0
    ? Math.min(1, Math.max(0, onlineSeconds / coveredSeconds))
    : null

  const status: NodeUptime30d['status'] = coverageRatio >= 0.95
    ? 'complete'
    : coverageRatio > 0
      ? 'partial'
      : 'unavailable'

  const coverageText = status === 'complete'
    ? '30 / 30 天'
    : status === 'partial'
      ? `覆盖 ${(coveredSeconds / 86400).toFixed(1)} / 30 天`
      : '无历史数据'

  const uptimeText = uptimeRatio !== null
    ? `${(uptimeRatio * 100).toFixed(2)}%`
    : '--'

  return {
    uuid: node.uuid,
    name: node.name,
    uptimeRatio,
    uptimeText,
    coveredSeconds,
    requestedSeconds,
    coverageRatio,
    coverageText,
    source: 'legacy',
    status,
    isOnline,
  }
}

/**
 * Unified node 30-day uptime calculation dispatching to metrics or legacy records.
 */
export function calculateNode30dUptime(
  node: NodeData,
  sourceData: { kind: 'metrics', series?: NormalizedMetricSeries } | { kind: 'records', records?: readonly RawStatusRecord[] } | readonly RawStatusRecord[] = [],
  now = new Date(),
): NodeUptime30d {
  if (Array.isArray(sourceData)) {
    return calculateNode30dUptimeFromRecords(node, sourceData, now)
  }
  if (sourceData.kind === 'metrics') {
    return calculateNode30dUptimeFromMetrics(node, sourceData.series, now)
  }
  return calculateNode30dUptimeFromRecords(node, sourceData.records ?? [], now)
}

/**
 * Calculates fleet-wide 30-day uptime summary.
 */
export function calculateFleet30dUptime(
  nodes: readonly NodeData[],
  sourceData: { kind: 'metrics', seriesByNode?: Record<string, NormalizedMetricSeries> } | { kind: 'records', recordsByNode?: Record<string, RawStatusRecord[]> } | Record<string, RawStatusRecord[]> = {},
  now = new Date(),
): FleetUptime30d {
  let source: 'metrics' | 'legacy' | 'unavailable' = 'unavailable'
  let nodeUptimes: NodeUptime30d[] = []

  if (!Array.isArray(sourceData) && typeof sourceData === 'object' && 'kind' in sourceData) {
    if (sourceData.kind === 'metrics') {
      source = 'metrics'
      nodeUptimes = nodes.map(node =>
        calculateNode30dUptimeFromMetrics(node, sourceData.seriesByNode?.[node.uuid], now),
      )
    }
    else {
      source = 'legacy'
      nodeUptimes = nodes.map(node =>
        calculateNode30dUptimeFromRecords(node, sourceData.recordsByNode?.[node.uuid] ?? [], now),
      )
    }
  }
  else {
    source = 'legacy'
    const recordsMap = sourceData as Record<string, RawStatusRecord[]>
    nodeUptimes = nodes.map(node =>
      calculateNode30dUptimeFromRecords(node, recordsMap[node.uuid] ?? [], now),
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
    source,
  }
}
