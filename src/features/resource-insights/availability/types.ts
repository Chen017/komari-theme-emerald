export interface AvailabilityObserverCoverage {
  observableSeconds: number
  unobservedSeconds: number
}

export interface AvailabilityNodeSummary {
  uuid: string
  currentState: 'online' | 'offline' | string
  trackingSince: string
  onlineSeconds: number
  offlineSeconds: number
  observableSeconds: number
  unobservedSeconds: number
  coverageRatio: number
  uptimeRatio: number | null
  outageCount: number
}

export interface AvailabilitySummaryResponse {
  schemaVersion: number
  generatedAt: string
  windowStart: string
  windowEnd: string
  observerCoverage: AvailabilityObserverCoverage
  nodes: AvailabilityNodeSummary[]
}

export type AvailabilityLoadState = 'idle' | 'loading' | 'ready' | 'unsupported' | 'error'

export interface AvailabilityNodeView {
  uuid: string
  name: string
  isLiveOnline: boolean
  uptimeRatio: number | null
  uptimeText: string
  coverageDays: number
  coverageText: string
  currentState: string
  outageCount: number
  hasData: boolean
}

export interface AvailabilityFleetView {
  fleetUptimeRatio: number | null
  fleetUptimeText: string
  nodes: AvailabilityNodeView[]
  totalNodes: number
  coveredNodes: number
}
