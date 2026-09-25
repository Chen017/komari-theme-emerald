import type {
  DailyTrafficAggregate,
  TrafficQuality,
  TrafficReason,
  TrafficSource,
} from './trafficAggregator'
import {
  resolveTrafficResetConfig,
  resolveTrafficResetDay,
} from './trafficResetConfig'

export type TrafficRange = '7d' | '30d' | 'since_reset' | 'current_cycle' | 'cycle'
export type TrafficTrendAvailability = 'available' | 'recording-disabled' | 'retention-insufficient'
export type HistoryFailureKind = 'timeout' | 'rpc-error' | 'unsupported' | 'aborted' | 'unknown'
export type TrafficTrendState = 'idle' | 'loading' | 'ready' | 'empty' | 'unsupported' | 'error'
export type TrafficTrendCapability
  = 'full'
  | 'partial-retention'
  | 'unsupported'
  | 'coarse-rollup'
  | 'no-data'

export interface TrafficTrendCoverageViewModel {
  average: number
  minimum: number | null
  availableEntities: number
  totalEntities: number
}

export interface TrafficTrendDayViewModel {
  date: string
  uploadBytes: number | null
  downloadBytes: number | null
  totalBytes: number | null
  quality: TrafficQuality
  source: TrafficSource | null
  coverage: TrafficTrendCoverageViewModel
  isInProgress: boolean
  reasons: TrafficReason[]
  isCoarse?: boolean
  queryFailed?: boolean
}

export interface TrafficTrendSnapshot {
  state: TrafficTrendState
  days: TrafficTrendDayViewModel[]
  fetchedAt: number | null
  sourceKind: 'metrics' | 'records' | null
  retentionDays: number | null
  requestedDays?: number
  availableDays?: number
  capability?: TrafficTrendCapability
  availability: TrafficTrendAvailability
  failureKind: HistoryFailureKind | null
  retryable: boolean
  message: string
}

const QUALITY_RANK: Record<TrafficQuality, number> = {
  complete: 0,
  partial: 1,
  estimated: 2,
  missing: 3,
}

function getDayRows(
  byEntity: ReadonlyMap<string, readonly DailyTrafficAggregate[]>,
  entityIds: readonly string[],
  date: string,
): DailyTrafficAggregate[] {
  return entityIds.flatMap((entityId) => {
    const rows = byEntity.get(entityId) ?? []
    const row = rows.find(row => row.date === date)
    return row ? [row] : []
  })
}

export function buildTrafficTrendViewModel(
  byEntity: ReadonlyMap<string, readonly DailyTrafficAggregate[]>,
  dates: readonly string[],
  entityIds: readonly string[],
  metadata?: { coarseDates?: string[], failedDates?: string[] },
): Pick<TrafficTrendSnapshot, 'state' | 'days' | 'message' | 'requestedDays' | 'availableDays' | 'capability'> {
  const visibleEntityIds = [...new Set(entityIds)]
  const days = dates.map((date): TrafficTrendDayViewModel => {
    const rows = getDayRows(byEntity, visibleEntityIds, date)
    const uploadRows = rows.filter(row => row.uploadBytes !== null)
    const downloadRows = rows.filter(row => row.downloadBytes !== null)
    const availableRows = rows.filter(row => row.uploadBytes !== null || row.downloadBytes !== null)
    const totalEntities = visibleEntityIds.length
    const coverage: TrafficTrendCoverageViewModel = {
      average: totalEntities === 0
        ? 0
        : availableRows.reduce((total, row) => total + row.coverage, 0) / totalEntities,
      minimum: availableRows.length > 0 ? Math.min(...availableRows.map(row => row.coverage)) : null,
      availableEntities: availableRows.length,
      totalEntities,
    }
    const uploadBytes = uploadRows.length > 0
      ? uploadRows.reduce((sum, row) => sum + row.uploadBytes!, 0)
      : null
    const downloadBytes = downloadRows.length > 0
      ? downloadRows.reduce((sum, row) => sum + row.downloadBytes!, 0)
      : null
    const measuredQuality = availableRows.reduce<TrafficQuality>((worst, row) => {
      return QUALITY_RANK[row.quality] > QUALITY_RANK[worst] ? row.quality : worst
    }, 'complete')
    let quality: TrafficQuality
    if (availableRows.length === 0) {
      quality = 'missing'
    }
    else if (measuredQuality === 'complete' && (
      coverage.availableEntities !== coverage.totalEntities || coverage.average < 1
    )) {
      quality = 'partial'
    }
    else {
      quality = measuredQuality
    }
    const sources = new Set(rows.flatMap(row => row.source === null ? [] : [row.source]))
    const source = sources.size === 0
      ? null
      : sources.size === 1
        ? sources.values().next().value!
        : 'mixed'

    const isCoarse = rows.some(r => r.reasons.includes('cross-day-interval-rejected') || (r.reasons as string[]).includes('coarse-interval'))
      || (metadata?.coarseDates?.includes(date) ?? false)
    const queryFailed = metadata?.failedDates?.includes(date) ?? false

    return {
      date,
      uploadBytes,
      downloadBytes,
      totalBytes: uploadBytes === null || downloadBytes === null ? null : uploadBytes + downloadBytes,
      quality,
      source,
      coverage,
      isInProgress: rows.some(row => row.isInProgress),
      reasons: [...new Set(rows.flatMap(row => row.reasons))].sort(),
      isCoarse,
      queryFailed,
    }
  })
  const missingDays = days.filter(day => day.totalBytes === null).length
  const availableDays = days.length - missingDays
  const requestedDays = dates.length

  let capability: TrafficTrendCapability = 'full'
  const hasCrossDayRejected = days.some(day => day.reasons.includes('cross-day-interval-rejected'))
  if (availableDays === 0) {
    if (hasCrossDayRejected) {
      capability = 'coarse-rollup'
    }
    else {
      capability = 'no-data'
    }
  }
  else if (availableDays < requestedDays) {
    capability = 'partial-retention'
  }

  let message = `采集：${availableDays}天，缺失：${missingDays}天`
  if (capability === 'coarse-rollup') {
    message = '历史数据粒度过粗，无法准确按本地自然日拆分'
  }
  else if (dates.length === 30) {
    message = `历史覆盖 ${availableDays} / 30 天`
  }
  else if (dates.length > 7) {
    message = `重置周期：${dates[0]} – ${dates.at(-1)} · 历史覆盖 ${availableDays} / ${dates.length} 天`
  }

  return {
    state: days.every(day => day.uploadBytes === null && day.downloadBytes === null) ? 'empty' : 'ready',
    days,
    message,
    requestedDays,
    availableDays,
    capability,
  }
}

export {
  buildInclusiveDateRange,
  calculateResetWindow,
  type ResetWindowInfo,
} from './trafficAggregator'

export {
  extractResetDayFromTags,
  extractResetTimezoneFromTags,
  isValidTimeZone,
  resolveTrafficResetConfig,
  resolveTrafficResetDay,
  type TrafficResetConfigResult,
  type TrafficResetSettings,
} from './trafficResetConfig'

export function resolveNodeResetConfig(node: any, settings?: any): { day: number | null, timezone: string | null, timezoneSource?: 'tag' | 'settings' | 'fallback' | 'none' } {
  if (!node || typeof node !== 'object')
    return { day: null, timezone: null, timezoneSource: 'none' }
  const config = resolveTrafficResetConfig(node, settings)
  if (config.day !== null) {
    return { day: config.day, timezone: config.timezone, timezoneSource: config.timezoneSource }
  }
  const day = resolveNodeResetDay(node, settings)
  return { day, timezone: config.timezone, timezoneSource: config.timezoneSource }
}

export function resolveNodeResetDay(node: any, settings?: any): number | null {
  if (!node || typeof node !== 'object')
    return null
  const config = resolveTrafficResetDay(node, settings)
  if (config.day !== null) {
    return config.day
  }
  const raw = node.traffic_reset_day
    ?? node.month_rotate
    ?? node.monthRotate
    ?? node.trafficResetDay
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 31) {
    return raw
  }
  if (typeof raw === 'string') {
    const parsed = parseInt(raw, 10)
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 31) {
      return parsed
    }
  }
  return null
}

export function canRequestSinceReset(
  selectedEntity: string,
  selectedNode: any,
  settings?: any,
): boolean {
  if (selectedEntity === 'all' || !selectedNode)
    return false
  return resolveNodeResetDay(selectedNode, settings) !== null
}
