import type {
  IpqaCapabilities,
  IpqaDailyPairedReport,
  IpqaFleetOverview,
  IpqaMediaHistoryPoint,
  IpqaScoreHistoryPoint,
  IpqaSemanticChange,
} from '../types'
import { getSharedRpc } from '@/utils/rpc'

const API_BASE = '/api/plugin/ipqa-alert-report/v1'

async function getJson<T>(
  endpoint: string,
  rpcMethod?: string,
  rpcParams?: Record<string, unknown>,
): Promise<T | null> {
  try {
    const sep = endpoint.includes('?') ? '&' : '?'
    const url = `${API_BASE}${endpoint}${sep}_t=${Date.now()}`
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-cache',
    })
    if (res.ok) {
      return (await res.json()) as T
    }
  }
  catch (err) {
    console.warn(`[IPQA API] ${endpoint} fetch failed:`, err)
  }

  // Seamless fallback to Komari RPC if HTTP route is 404 or fails
  if (rpcMethod) {
    try {
      const rpc = getSharedRpc()
      const data = await rpc.call<T>(rpcMethod, rpcParams)
      if (data !== undefined && data !== null) {
        return data
      }
    }
    catch (rpcErr) {
      console.warn(`[IPQA RPC] ${rpcMethod} fallback failed:`, rpcErr)
    }
  }

  return null
}

export async function fetchCapabilities(): Promise<IpqaCapabilities | null> {
  return getJson<IpqaCapabilities>('/capabilities', 'plugin:ipqaGetCapabilities')
}

export async function fetchFleetOverview(): Promise<IpqaFleetOverview | null> {
  return getJson<IpqaFleetOverview>('/overview', 'plugin:ipqaGetOverview')
}

export async function fetchNodeLatest(uuid: string): Promise<IpqaDailyPairedReport | null> {
  return getJson<IpqaDailyPairedReport>(`/nodes/${uuid}/latest`, 'plugin:ipqaGetNodeLatest', { uuid })
}

export async function fetchNodeArchiveDates(uuid: string, limit = 30): Promise<string[]> {
  const data = await getJson<{ dates: string[] }>(`/nodes/${uuid}/archives?limit=${limit}`, 'plugin:ipqaGetNodeArchives', { uuid, limit })
  return data?.dates ?? []
}

export async function fetchNodeArchive(uuid: string, date: string): Promise<IpqaDailyPairedReport | null> {
  return getJson<IpqaDailyPairedReport>(`/nodes/${uuid}/archives/${date}`, 'plugin:ipqaGetNodeArchive', { uuid, date })
}

export async function fetchNodeChanges(uuid: string): Promise<IpqaSemanticChange[]> {
  const data = await getJson<{ changes: IpqaSemanticChange[] }>(`/nodes/${uuid}/changes`, 'plugin:ipqaGetNodeChanges', { uuid })
  return data?.changes ?? []
}

export async function fetchNodeScoreHistory(uuid: string): Promise<IpqaScoreHistoryPoint[]> {
  const data = await getJson<{ history: IpqaScoreHistoryPoint[] }>(`/nodes/${uuid}/history/scores`, 'plugin:ipqaGetNodeScoreHistory', { uuid })
  return data?.history ?? []
}

export async function fetchNodeMediaHistory(uuid: string): Promise<IpqaMediaHistoryPoint[]> {
  const data = await getJson<{ history: IpqaMediaHistoryPoint[] }>(`/nodes/${uuid}/history/media`, 'plugin:ipqaGetNodeMediaHistory', { uuid })
  return data?.history ?? []
}
