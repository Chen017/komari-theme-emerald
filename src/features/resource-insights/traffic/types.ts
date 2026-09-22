export type TrafficRange = '7d' | '30d' | 'cycle'

export type TrafficLoadState
  = 'idle'
    | 'loading'
    | 'ready'
    | 'partial'
    | 'empty'
    | 'unsupported'
    | 'error'

export interface TrafficCapability {
  retentionDays: number | null
  supports7d: boolean
  supports30d: boolean
}

export interface TrafficDay {
  date: string // YYYY-MM-DD in Asia/Shanghai
  downloadBytes: number | null
  uploadBytes: number | null
  totalBytes: number | null
  quality: 'complete' | 'partial' | 'missing'
  isCoarse?: boolean
}

export interface TrafficView {
  state: TrafficLoadState
  days: TrafficDay[]
  message: string
  retentionDays: number | null
  requestedDays: number
  availableDays: number
  hasCoarseRollup?: boolean
  coarseWarning?: string
}

export interface ResetWindow {
  startDate: string
  endDate: string
  diffDays: number
  resetDay: number
  resetTimezone: string
  resetStartEpochMs: number
  resetStartText: string
  isFallbackTimezone: boolean
}

export interface CycleCumulative {
  up: number
  down: number
  total: number
}

export interface MetricQueryPoint {
  time: string
  value: number | null
}

export interface MetricSeriesItem {
  metric_key: string
  entity_id: string
  interval_seconds?: number | null
  points?: MetricQueryPoint[]
}

export interface MetricQueryResponse {
  series?: MetricSeriesItem[]
}

export interface MetricDefinitionItem {
  name: string
  retention_days: number
}
