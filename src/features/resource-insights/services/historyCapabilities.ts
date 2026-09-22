import type { RpcCall } from '../types/history'

export interface MetricCapability {
  name: string
  type: string
  unit: string | null
  retentionDays: number
}

export interface ResourceHistoryCapabilities {
  trafficUp: MetricCapability | null
  trafficDown: MetricCapability | null
  trafficRetentionDays: number | null
  supports30dTraffic: boolean
  hasMetricsApi: boolean
  hasRecordsApi: boolean
}

export function normalizeMetricDefinition(raw: unknown): MetricCapability | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  // Strictly require name and retention_days without guessed aliases
  if (typeof item.name !== 'string' || !item.name.trim()) return null
  if (typeof item.retention_days !== 'number' || !Number.isFinite(item.retention_days)) return null

  return {
    name: item.name.trim(),
    type: typeof item.type === 'string' ? item.type : 'gauge',
    unit: typeof item.unit === 'string' ? item.unit : null,
    retentionDays: item.retention_days,
  }
}

const CAPABILITIES_CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes
let cachedCapabilities: ResourceHistoryCapabilities | null = null
let cachedAt = 0

export async function fetchHistoryCapabilities(
  call: RpcCall,
  options?: { bypassCache?: boolean },
): Promise<ResourceHistoryCapabilities> {
  const now = Date.now()
  if (!options?.bypassCache && cachedCapabilities && now - cachedAt < CAPABILITIES_CACHE_TTL_MS) {
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
    // If rpc.methods probe fails, assume standard methods might exist
    hasMetricsApi = true
    hasRecordsApi = true
  }

  let trafficUp: MetricCapability | null = null
  let trafficDown: MetricCapability | null = null

  try {
    const defs = await call<unknown[]>('public:listMetricDefinitions')
    if (Array.isArray(defs)) {
      for (const raw of defs) {
        const item = normalizeMetricDefinition(raw)
        if (!item) continue
        if (item.name === 'traffic.up') trafficUp = item
        else if (item.name === 'traffic.down') trafficDown = item
      }
    }
  }
  catch {
    // If listMetricDefinitions fails, leave metrics as null without fabricating fake retention
  }

  // Unknown retention remains null; do not fabricate retentionDays = 1
  const trafficRetentionDays = (trafficUp && trafficDown)
    ? Math.min(trafficUp.retentionDays, trafficDown.retentionDays)
    : null

  const capabilities: ResourceHistoryCapabilities = {
    trafficUp,
    trafficDown,
    trafficRetentionDays,
    supports30dTraffic: trafficRetentionDays !== null ? trafficRetentionDays >= 30 : false,
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
