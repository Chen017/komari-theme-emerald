import type { NormalizedMetricSeries, RawStatusRecord } from '../types/history'

export interface ObserverBucket {
  startMs: number
  endMs: number
  state: 'observable' | 'unobserved'
}

export interface ObservationTimeline {
  buckets: ObserverBucket[]
  bucketSeconds: number
  earliestTelemetryMs: number | null
  controllerBlackoutSeconds: number
  retentionUncoveredSeconds: number
  isObservable: (timeMs: number) => boolean
  isBlackout: (timeMs: number) => boolean
}

function calculateMedian(arr: number[]): number {
  if (arr.length === 0) return 0
  const mid = Math.floor(arr.length / 2)
  return arr.length % 2 === 1 ? arr[mid]! : (arr[mid - 1]! + arr[mid]!) / 2
}

/**
 * Builds a unified observation coverage timeline for a requested window.
 * Distinguishes:
 * - Retention uncovered (window before any monitoring history exists)
 * - Controller blackout (all nodes have no telemetry & no controller probe evidence exists)
 * - Observable (at least one node reported telemetry or controller probe evidence confirmed alive)
 */
export function buildObservationTimeline(options: {
  seriesByNode?: Record<string, NormalizedMetricSeries | undefined>
  recordsByNode?: Record<string, readonly RawStatusRecord[] | undefined>
  probeEvidenceTimes?: number[]
  windowStartMs: number
  windowEndMs: number
  fallbackBucketSeconds?: number
}): ObservationTimeline {
  const {
    seriesByNode = {},
    recordsByNode = {},
    probeEvidenceTimes = [],
    windowStartMs,
    windowEndMs,
    fallbackBucketSeconds = 3600,
  } = options

  // 1. Collect all telemetry series
  const allSeries = Object.values(seriesByNode).filter((s): s is NormalizedMetricSeries => Boolean(s && s.points?.length))
  const allLegacyRecords = Object.values(recordsByNode).filter((r): r is readonly RawStatusRecord[] => Boolean(r && r.length))

  // Find earliest telemetry timestamp across the entire fleet
  let earliestTelemetryMs: number | null = null

  for (const s of allSeries) {
    for (const p of s.points) {
      const hasData = (typeof p.count === 'number' && p.count > 0) || (p.value !== null)
      if (hasData) {
        const t = Date.parse(p.time)
        if (Number.isFinite(t)) {
          if (earliestTelemetryMs === null || t < earliestTelemetryMs) {
            earliestTelemetryMs = t
          }
        }
      }
    }
  }

  for (const recs of allLegacyRecords) {
    for (const r of recs) {
      const t = Date.parse(r.time)
      if (Number.isFinite(t)) {
        if (earliestTelemetryMs === null || t < earliestTelemetryMs) {
          earliestTelemetryMs = t
        }
      }
    }
  }

  // If no data exists at all
  if (earliestTelemetryMs === null) {
    const requestedSeconds = Math.max(0, (windowEndMs - windowStartMs) / 1000)
    return {
      buckets: [],
      bucketSeconds: fallbackBucketSeconds,
      earliestTelemetryMs: null,
      controllerBlackoutSeconds: 0,
      retentionUncoveredSeconds: requestedSeconds,
      isObservable: () => false,
      isBlackout: () => false,
    }
  }

  // Retention uncovered is the time before earliestTelemetryMs
  const retentionStartBoundMs = Math.max(windowStartMs, earliestTelemetryMs)
  const retentionUncoveredSeconds = Math.max(0, (retentionStartBoundMs - windowStartMs) / 1000)

  // 2. Determine bucket size
  let bucketSeconds = fallbackBucketSeconds
  if (allSeries.length > 0) {
    const firstS = allSeries[0]!
    if (typeof firstS.intervalSeconds === 'number' && firstS.intervalSeconds > 0) {
      bucketSeconds = firstS.intervalSeconds
    } else if (firstS.points.length >= 2) {
      const diffs: number[] = []
      for (let i = 1; i < firstS.points.length; i++) {
        const d = (Date.parse(firstS.points[i]!.time) - Date.parse(firstS.points[i - 1]!.time)) / 1000
        if (d > 0) diffs.push(d)
      }
      if (diffs.length > 0) {
        diffs.sort((a, b) => a - b)
        bucketSeconds = calculateMedian(diffs) || fallbackBucketSeconds
      }
    }
  }

  const bucketMs = bucketSeconds * 1000

  // 3. Build bucket time points from retentionStartBoundMs up to windowEndMs
  // If we have metric series points, we can collect all discrete bucket timestamps
  const bucketTimestamps = new Set<number>()
  for (const s of allSeries) {
    for (const p of s.points) {
      const t = Date.parse(p.time)
      if (Number.isFinite(t) && t >= retentionStartBoundMs - bucketMs && t <= windowEndMs) {
        bucketTimestamps.add(t)
      }
    }
  }

  // If metric series did not provide dense timestamps, synthesize buckets
  if (bucketTimestamps.size === 0) {
    for (let t = retentionStartBoundMs; t < windowEndMs; t += bucketMs) {
      bucketTimestamps.add(t)
    }
  }

  const sortedBucketTimes = Array.from(bucketTimestamps).sort((a, b) => a - b)

  // Fast lookup for telemetry presence per bucket
  // bucketStartMs -> boolean (true if any node has positive telemetry sample)
  const bucketHasTelemetry = new Map<number, boolean>()

  for (const s of allSeries) {
    for (const p of s.points) {
      const t = Date.parse(p.time)
      const hasData = (typeof p.count === 'number' && p.count > 0) || (p.value !== null)
      if (hasData) {
        bucketHasTelemetry.set(t, true)
      }
    }
  }

  // Also check legacy records if series not available
  if (allSeries.length === 0 && allLegacyRecords.length > 0) {
    for (const recs of allLegacyRecords) {
      for (const r of recs) {
        const t = Date.parse(r.time)
        // Map to nearest bucket
        const bStart = Math.floor(t / bucketMs) * bucketMs
        bucketHasTelemetry.set(bStart, true)
      }
    }
  }

  // Fast lookup for probe evidence
  const probeEvidenceSorted = [...probeEvidenceTimes].filter(t => Number.isFinite(t)).sort((a, b) => a - b)
  function hasProbeEvidenceInInterval(start: number, end: number): boolean {
    if (probeEvidenceSorted.length === 0) return false
    // Binary search for any probe in [start, end)
    let low = 0
    let high = probeEvidenceSorted.length - 1
    while (low <= high) {
      const mid = (low + high) >> 1
      const val = probeEvidenceSorted[mid]!
      if (val >= start && val < end) {
        return true
      }
      if (val < start) {
        low = mid + 1
      } else {
        high = mid - 1
      }
    }
    return false
  }

  // 4. Construct buckets and calculate controller blackout
  const buckets: ObserverBucket[] = []
  let controllerBlackoutSeconds = 0

  for (let i = 0; i < sortedBucketTimes.length; i++) {
    const bStart = sortedBucketTimes[i]!
    const nextStart = sortedBucketTimes[i + 1]
    const bEnd = nextStart !== undefined && nextStart > bStart ? nextStart : bStart + bucketMs

    // Overlap with requested window [retentionStartBoundMs, windowEndMs]
    const startClamped = Math.max(bStart, retentionStartBoundMs)
    const endClamped = Math.min(bEnd, windowEndMs)
    const duration = Math.max(0, (endClamped - startClamped) / 1000)
    if (duration <= 0) continue

    const hasFleetTelemetry = Boolean(bucketHasTelemetry.get(bStart))
    const hasProbe = hasProbeEvidenceInInterval(bStart, bEnd)

    let state: 'observable' | 'unobserved' = 'unobserved'
    if (hasFleetTelemetry || hasProbe) {
      state = 'observable'
    } else {
      state = 'unobserved'
      controllerBlackoutSeconds += duration
    }

    buckets.push({
      startMs: startClamped,
      endMs: endClamped,
      state,
    })
  }

  function isObservable(timeMs: number): boolean {
    if (timeMs < retentionStartBoundMs || timeMs > windowEndMs) return false
    for (const b of buckets) {
      if (timeMs >= b.startMs && timeMs < b.endMs) {
        return b.state === 'observable'
      }
    }
    return false
  }

  function isBlackout(timeMs: number): boolean {
    if (timeMs < retentionStartBoundMs || timeMs > windowEndMs) return false
    for (const b of buckets) {
      if (timeMs >= b.startMs && timeMs < b.endMs) {
        return b.state === 'unobserved'
      }
    }
    return false
  }

  return {
    buckets,
    bucketSeconds,
    earliestTelemetryMs,
    controllerBlackoutSeconds,
    retentionUncoveredSeconds,
    isObservable,
    isBlackout,
  }
}
