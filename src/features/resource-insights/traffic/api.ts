import type { MetricDefinitionItem, MetricQueryResponse, MetricSeriesItem, TrafficCapability } from './types'
import { getSharedRpc } from '../../../utils/rpc'

export type RpcCall = <T>(method: string, params?: Record<string, unknown> | unknown[], options?: { signal?: AbortSignal }) => Promise<T>

export function defaultRpcCall<T>(method: string, params?: Record<string, unknown> | unknown[], options?: { signal?: AbortSignal }): Promise<T> {
  return getSharedRpc().call<T>(method, params, options)
}

export class TrafficApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TrafficApiError'
  }
}

export async function fetchTrafficCapability(call: RpcCall = defaultRpcCall): Promise<TrafficCapability> {
  let defs: MetricDefinitionItem[]
  try {
    defs = await call<MetricDefinitionItem[]>('public:listMetricDefinitions')
  }
  catch {
    throw new TrafficApiError('无法读取 Metric Store 保留策略')
  }

  if (!Array.isArray(defs)) {
    throw new TrafficApiError('public:listMetricDefinitions 响应无效')
  }

  let upRetention: number | null = null
  let downRetention: number | null = null

  for (const item of defs) {
    if (!item || typeof item !== 'object')
      continue
    if (typeof (item as any).name !== 'string' || typeof (item as any).retention_days !== 'number')
      continue

    if (item.name === 'traffic.up') {
      upRetention = item.retention_days
    }
    else if (item.name === 'traffic.down') {
      downRetention = item.retention_days
    }
  }

  let retentionDays: number | null = null
  if (upRetention !== null && downRetention !== null) {
    retentionDays = Math.min(upRetention, downRetention)
  }
  else if (upRetention !== null) {
    retentionDays = upRetention
  }
  else if (downRetention !== null) {
    retentionDays = downRetention
  }

  return {
    retentionDays,
    supports7d: retentionDays !== null && retentionDays >= 7,
    supports30d: retentionDays !== null && retentionDays >= 30,
  }
}

export interface FetchTrafficMetricsOptions {
  entityIds: string[]
  start: string
  end: string
  maxPoints: number
  signal?: AbortSignal
  call?: RpcCall
}

export async function fetchTrafficMetrics(options: FetchTrafficMetricsOptions): Promise<MetricSeriesItem[]> {
  const { entityIds, start, end, maxPoints, signal, call = defaultRpcCall } = options

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }

  let res: MetricQueryResponse
  try {
    res = await call<MetricQueryResponse>('public:queryMetrics', {
      metric_keys: ['traffic.up', 'traffic.down'],
      entity_ids: entityIds,
      start,
      end,
      aggregation: 'sum',
      max_points: maxPoints,
    }, { signal })
  }
  catch (err: unknown) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    throw err
  }

  if (!res || typeof res !== 'object' || !Array.isArray(res.series)) {
    throw new TrafficApiError('public:queryMetrics 响应无效')
  }

  return res.series.filter(s =>
    (s.metric_key === 'traffic.up' || s.metric_key === 'traffic.down')
    && entityIds.includes(s.entity_id),
  )
}
