import type { RpcCall } from '../types/history'

export interface MetricDefinitionDiagnostic {
  key: string
  retentionDays?: number
  rollup?: boolean
  aggregations?: string[]
}

export interface MetricProbeReport {
  timestamp: string
  methods: string[]
  hasQueryMetrics: boolean
  hasListMetricDefinitions: boolean
  hasGetRecords: boolean
  definitions: MetricDefinitionDiagnostic[]
  samples30d: {
    cpuUsage?: { pointsCount: number, intervalSeconds?: number | null, downsampled?: boolean }
    trafficUp?: { pointsCount: number, intervalSeconds?: number | null, downsampled?: boolean }
    trafficDown?: { pointsCount: number, intervalSeconds?: number | null, downsampled?: boolean }
  }
}

/**
 * Diagnostic utility for investigating Komari runtime metric capabilities
 * and data contract in development environments.
 */
export async function probeMetricContract(
  call: RpcCall,
  sampleEntityId?: string,
): Promise<MetricProbeReport> {
  const report: MetricProbeReport = {
    timestamp: new Date().toISOString(),
    methods: [],
    hasQueryMetrics: false,
    hasListMetricDefinitions: false,
    hasGetRecords: false,
    definitions: [],
    samples30d: {},
  }

  // 1. Probe RPC methods
  try {
    const methods = await call<string[]>('rpc.methods')
    if (Array.isArray(methods)) {
      report.methods = methods
      report.hasQueryMetrics = methods.includes('public:queryMetrics')
      report.hasListMetricDefinitions = methods.includes('public:listMetricDefinitions')
      report.hasGetRecords = methods.includes('common:getRecords')
    }
  }
  catch {
    // Ignore error in probe
  }

  // 2. Probe listMetricDefinitions if available
  if (report.hasListMetricDefinitions) {
    try {
      const defs = await call<any>('public:listMetricDefinitions')
      if (Array.isArray(defs)) {
        report.definitions = defs.map((d: any) => ({
          key: d.name || d.metric_key || d.key || String(d),
          retentionDays: d.retention_days,
          rollup: d.rollup,
          aggregations: d.aggregations,
        }))
      }
    }
    catch {
      // Ignore
    }
  }

  // 3. Probe 30d queries if entity provided
  if (report.hasQueryMetrics && sampleEntityId) {
    const now = new Date()
    const start = new Date(now.getTime() - 30 * 86400 * 1000).toISOString()
    const end = now.toISOString()

    try {
      const cpuRes = await call<any>('public:queryMetrics', {
        metric_keys: ['cpu.usage'],
        entity_ids: [sampleEntityId],
        start,
        end,
        fill_empty: true,
      })
      const s = cpuRes?.series?.[0]
      if (s) {
        report.samples30d.cpuUsage = {
          pointsCount: s.points?.length ?? 0,
          intervalSeconds: s.interval_seconds,
          downsampled: s.downsampled,
        }
      }
    }
    catch {
      // Ignore
    }

    try {
      const trafficRes = await call<any>('public:queryMetrics', {
        metric_keys: ['traffic.up', 'traffic.down'],
        entity_ids: [sampleEntityId],
        start,
        end,
        aggregation: 'sum',
      })
      for (const s of trafficRes?.series ?? []) {
        if (s.metric_key === 'traffic.up') {
          report.samples30d.trafficUp = {
            pointsCount: s.points?.length ?? 0,
            intervalSeconds: s.interval_seconds,
            downsampled: s.downsampled,
          }
        }
        else if (s.metric_key === 'traffic.down') {
          report.samples30d.trafficDown = {
            pointsCount: s.points?.length ?? 0,
            intervalSeconds: s.interval_seconds,
            downsampled: s.downsampled,
          }
        }
      }
    }
    catch {
      // Ignore
    }
  }

  if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.debug('[MetricDiagnostics] Contract report:', report)
  }

  return report
}
