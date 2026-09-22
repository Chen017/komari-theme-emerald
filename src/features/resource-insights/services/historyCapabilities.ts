import type { RpcCall } from '../types/history'

export interface MetricCapability {
  name: string
  type: string
  unit: string | null
  retentionDays: number
}

export interface ResourceHistoryCapabilities {
  cpuUsage: MetricCapability | null
  trafficUp: MetricCapability | null
  trafficDown: MetricCapability | null
  netTotalUp: MetricCapability | null
  netTotalDown: MetricCapability | null

  uptimeRetentionDays: number
  trafficRetentionDays: number

  supports30dUptime: boolean
  supports30dTraffic: boolean
  hasMetricsApi: boolean
  hasRecordsApi: boolean
}

export function normalizeMetricDefinition(raw: any): MetricCapability | null {
  if (!raw || typeof raw !== 'object') return null
  const name = raw.name || raw.metric_key || raw.key
  if (typeof name !== 'string' || !name) return null
  return {
    name,
    type: typeof raw.type === 'string' ? raw.type : 'gauge',
    unit: raw.unit ?? null,
    retentionDays: Number(raw.retention_days ?? 0),
  }
}

const CAPABILITIES_CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes
let cachedCapabilities: ResourceHistoryCapabilities | null = null
let cachedAt = 0

export async function fetchHistoryCapabilities(
  call: RpcCall,
  forceRefresh = false,
): Promise<ResourceHistoryCapabilities> {
  const now = Date.now()
  if (!forceRefresh && cachedCapabilities && now - cachedAt < CAPABILITIES_CACHE_TTL_MS) {
    return cachedCapabilities
  }

  let hasMetricsApi = false
  let hasRecordsApi = false

  try {
    const methods = await call<string[]>('rpc.methods')
    if (Array.isArray(methods)) {
      hasMetricsApi = methods.includes('public:queryMetrics')
      hasRecordsApi = methods.includes('common:getRecords')
    }
  }
  catch {
    // If rpc.methods fails, assume standard methods might exist
    hasMetricsApi = true
    hasRecordsApi = true
  }

  let cpuUsage: MetricCapability | null = null
  let trafficUp: MetricCapability | null = null
  let trafficDown: MetricCapability | null = null
  let netTotalUp: MetricCapability | null = null
  let netTotalDown: MetricCapability | null = null

  try {
    const defs = await call<any>('public:listMetricDefinitions')
    if (Array.isArray(defs)) {
      for (const raw of defs) {
        const item = normalizeMetricDefinition(raw)
        if (!item) continue
        if (item.name === 'cpu.usage') cpuUsage = item
        else if (item.name === 'traffic.up') trafficUp = item
        else if (item.name === 'traffic.down') trafficDown = item
        else if (item.name === 'net.total.up') netTotalUp = item
        else if (item.name === 'net.total.down') netTotalDown = item
      }
    }
  }
  catch {
    // If listMetricDefinitions is unavailable or fails, fallback to defaults
  }

  // Komari 1.5.0-fix1 defaults built-in metrics to 1 day if not listed
  const uptimeRetentionDays = cpuUsage ? cpuUsage.retentionDays : (hasMetricsApi ? 1 : 0)
  const trafficRetentionDays = (trafficUp && trafficDown)
    ? Math.min(trafficUp.retentionDays, trafficDown.retentionDays)
    : (hasMetricsApi ? 1 : 0)

  const capabilities: ResourceHistoryCapabilities = {
    cpuUsage,
    trafficUp,
    trafficDown,
    netTotalUp,
    netTotalDown,
    uptimeRetentionDays,
    trafficRetentionDays,
    supports30dUptime: uptimeRetentionDays >= 30,
    supports30dTraffic: trafficRetentionDays >= 30,
    hasMetricsApi,
    hasRecordsApi,
  }

  cachedCapabilities = capabilities
  cachedAt = now
  return capabilities
}

export function clearHistoryCapabilitiesCache(): void {
  cachedCapabilities = null
  cachedAt = 0
}
