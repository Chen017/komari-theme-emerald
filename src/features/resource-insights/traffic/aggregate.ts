import type { MetricSeriesItem, TrafficDay } from './types'
import { formatBeijingDate, getBeijingDayBounds } from './calendar'

export interface AggregateTrafficResult {
  days: TrafficDay[]
  hasCoarseRollup: boolean
  coarseWarning?: string
}

interface MutableDayData {
  date: string
  startMs: number
  endMs: number
  effectiveEndMs: number
  isInProgress: boolean
  uploadBytes: number | null
  downloadBytes: number | null
  uploadPoints: number
  downloadPoints: number
  isCoarse: boolean
}

export function aggregateDailyTraffic(
  dates: string[],
  series: MetricSeriesItem[],
  nowMs: number = Date.now(),
): AggregateTrafficResult {
  let hasCoarseRollup = false

  const dayMap = new Map<string, MutableDayData>()
  for (const date of dates) {
    const { startMs, endMs } = getBeijingDayBounds(date)
    const effectiveEndMs = Math.min(endMs, nowMs)
    const isInProgress = nowMs < endMs

    dayMap.set(date, {
      date,
      startMs,
      endMs,
      effectiveEndMs,
      isInProgress,
      uploadBytes: null,
      downloadBytes: null,
      uploadPoints: 0,
      downloadPoints: 0,
      isCoarse: false,
    })
  }

  for (const s of series) {
    const isUp = s.metric_key === 'traffic.up'
    const isDown = s.metric_key === 'traffic.down'
    if (!isUp && !isDown)
      continue

    const points = s.points ?? []
    if (points.length === 0)
      continue

    let defaultIntervalMs = 3600 * 1000 // default 1h
    if (typeof s.interval_seconds === 'number' && s.interval_seconds > 0) {
      defaultIntervalMs = s.interval_seconds * 1000
    }
    else if (points.length >= 2) {
      const t0 = Date.parse(points[0]!.time)
      const t1 = Date.parse(points[1]!.time)
      if (Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0) {
        defaultIntervalMs = t1 - t0
      }
    }

    for (const pt of points) {
      if (pt.value === null || !Number.isFinite(pt.value) || pt.value < 0) {
        continue
      }

      const ptStartMs = Date.parse(pt.time)
      if (!Number.isFinite(ptStartMs))
        continue
      const ptEndMs = ptStartMs + defaultIntervalMs
      if (ptEndMs <= ptStartMs)
        continue

      const startDateStr = formatBeijingDate(ptStartMs)
      const endDateStr = formatBeijingDate(ptEndMs - 1)

      if (startDateStr === endDateStr) {
        // Point is completely contained within a single Beijing day
        const matchedDay = dayMap.get(startDateStr)
        if (matchedDay) {
          if (isUp) {
            matchedDay.uploadBytes = (matchedDay.uploadBytes ?? 0) + pt.value
            matchedDay.uploadPoints += 1
          }
          else if (isDown) {
            matchedDay.downloadBytes = (matchedDay.downloadBytes ?? 0) + pt.value
            matchedDay.downloadPoints += 1
          }
        }
      }
      else {
        // Point interval crosses Beijing midnight - cannot accurately split
        hasCoarseRollup = true
        const startBounds = getBeijingDayBounds(startDateStr)
        const endBounds = getBeijingDayBounds(endDateStr)
        for (let cursor = startBounds.startMs; cursor <= endBounds.startMs; cursor += 24 * 3600 * 1000) {
          const dateKey = formatBeijingDate(cursor)
          const day = dayMap.get(dateKey)
          if (day) {
            day.isCoarse = true
          }
        }
      }
    }
  }

  const days: TrafficDay[] = dates.map((date) => {
    const day = dayMap.get(date)!
    const hasUp = day.uploadBytes !== null
    const hasDown = day.downloadBytes !== null

    if (!hasUp && !hasDown) {
      return {
        date,
        downloadBytes: null,
        uploadBytes: null,
        totalBytes: null,
        quality: day.isCoarse ? 'partial' : 'missing',
        isCoarse: day.isCoarse,
      }
    }

    const downloadBytes = day.downloadBytes
    const uploadBytes = day.uploadBytes
    const totalBytes = (downloadBytes ?? 0) + (uploadBytes ?? 0)

    let quality: 'complete' | 'partial' | 'missing' = 'complete'
    if (day.isInProgress || day.isCoarse) {
      quality = 'partial'
    }

    return {
      date,
      downloadBytes,
      uploadBytes,
      totalBytes,
      quality,
      isCoarse: day.isCoarse,
    }
  })

  return {
    days,
    hasCoarseRollup,
    coarseWarning: hasCoarseRollup ? '存在跨越午夜的粗粒度历史聚合，无法精确切分' : undefined,
  }
}
