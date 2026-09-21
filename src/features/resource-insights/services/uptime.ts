import type { NodeData } from '@/stores/nodes'
import type { RawStatusRecord } from '../types/history'

export const SECONDS_30_DAYS = 30 * 24 * 3600
export const MAX_HEARTBEAT_GAP_SECONDS = 300 // 5 minutes

export interface NodeUptime30d {
  uuid: string
  name: string
  uptimeRatio: number | null
  coveredSeconds: number
  requestedSeconds: number
  coverageRatio: number
  status: 'complete' | 'partial' | 'unavailable'
  coverageText: string
  uptimeText: string
}

export interface FleetUptime30d {
  fleetUptimeRatio: number | null
  fleetUptimeText: string
  nodes: NodeUptime30d[]
  totalNodes: number
  completeNodes: number
  partialNodes: number
  unavailableNodes: number
}

/**
 * Calculates 30-day uptime for a single node from status records or status fallback.
 */
export function calculateNode30dUptime(
  node: NodeData,
  records: readonly RawStatusRecord[] = [],
  now = new Date(),
): NodeUptime30d {
  const requestedSeconds = SECONDS_30_DAYS
  const windowStartMs = now.getTime() - requestedSeconds * 1000

  // 1. Check if we have historical status records
  const validRecords = records
    .map(r => ({ record: r, atMs: Date.parse(r.time) }))
    .filter(r => Number.isFinite(r.atMs) && r.atMs >= windowStartMs && r.atMs <= now.getTime())
    .sort((a, b) => a.atMs - b.atMs)

  if (validRecords.length >= 2) {
    const firstMs = validRecords[0]!.atMs
    const lastMs = validRecords.at(-1)!.atMs
    const coveredSeconds = Math.min(requestedSeconds, Math.max(0, (lastMs - firstMs) / 1000))

    let onlineSeconds = 0
    for (let i = 1; i < validRecords.length; i++) {
      const prev = validRecords[i - 1]!
      const curr = validRecords[i]!
      const gapSeconds = (curr.atMs - prev.atMs) / 1000

      // If gap is within expected heartbeat, count as online interval
      if (gapSeconds > 0 && gapSeconds <= MAX_HEARTBEAT_GAP_SECONDS) {
        onlineSeconds += gapSeconds
      }
    }

    const coverageRatio = coveredSeconds / requestedSeconds
    const uptimeRatio = coveredSeconds > 0 ? Math.min(1, onlineSeconds / coveredSeconds) : null

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

    const uptimeText = uptimeRatio !== null ? `${(uptimeRatio * 100).toFixed(2)}%` : '--'

    return {
      uuid: node.uuid,
      name: node.name,
      uptimeRatio,
      coveredSeconds,
      requestedSeconds,
      coverageRatio,
      status,
      coverageText,
      uptimeText,
    }
  }

  // 2. Fallback using node's current uptime counter
  const uptimeSeconds = Number.isFinite(Number(node.uptime)) && Number(node.uptime) > 0
    ? Number(node.uptime)
    : 0

  if (node.online && uptimeSeconds > 0) {
    const coveredSeconds = Math.min(requestedSeconds, uptimeSeconds)
    const coverageRatio = coveredSeconds / requestedSeconds
    const status: NodeUptime30d['status'] = coverageRatio >= 0.95
      ? 'complete'
      : 'partial'

    const coverageText = status === 'complete'
      ? '30 / 30 天'
      : `覆盖 ${(coveredSeconds / 86400).toFixed(1)} / 30 天`

    return {
      uuid: node.uuid,
      name: node.name,
      uptimeRatio: 1.0, // continuous uptime reported
      coveredSeconds,
      requestedSeconds,
      coverageRatio,
      status,
      coverageText,
      uptimeText: '100.00%',
    }
  }

  // 3. Node is offline or has no data
  return {
    uuid: node.uuid,
    name: node.name,
    uptimeRatio: node.online ? 1.0 : 0.0,
    coveredSeconds: 0,
    requestedSeconds,
    coverageRatio: 0,
    status: 'unavailable',
    coverageText: '暂无历史采样',
    uptimeText: node.online ? '在线' : '离线',
  }
}

/**
 * Calculates fleet-wide 30-day uptime summary.
 */
export function calculateFleet30dUptime(
  nodes: readonly NodeData[],
  recordsByNode: Record<string, RawStatusRecord[]> = {},
  now = new Date(),
): FleetUptime30d {
  const nodeUptimes = nodes.map(node =>
    calculateNode30dUptime(node, recordsByNode[node.uuid] ?? [], now),
  )

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

  return {
    fleetUptimeRatio,
    fleetUptimeText: fleetUptimeRatio !== null ? `${(fleetUptimeRatio * 100).toFixed(2)}%` : '--',
    nodes: nodeUptimes,
    totalNodes: nodes.length,
    completeNodes: nodeUptimes.filter(n => n.status === 'complete').length,
    partialNodes: nodeUptimes.filter(n => n.status === 'partial').length,
    unavailableNodes: nodeUptimes.filter(n => n.status === 'unavailable').length,
  }
}
