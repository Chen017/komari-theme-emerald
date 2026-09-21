import type {
  IpqaCapabilities,
  IpqaDailyPairedReport,
  IpqaFleetOverview,
  IpqaMediaHistoryPoint,
  IpqaScoreHistoryPoint,
  IpqaSemanticChange,
} from '../types'

const API_BASE = '/api/plugin/ipqa-alert-report/v1'

async function getJson<T>(endpoint: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) {
      if (res.status === 404) return null
      console.warn(`[IPQA API] ${endpoint} returned HTTP ${res.status}`)
      return null
    }
    return (await res.json()) as T
  }
  catch (err) {
    console.warn(`[IPQA API] Failed to fetch ${endpoint}:`, err)
    return null
  }
}

export async function fetchCapabilities(): Promise<IpqaCapabilities | null> {
  return getJson<IpqaCapabilities>('/capabilities')
}

export async function fetchFleetOverview(): Promise<IpqaFleetOverview | null> {
  return getJson<IpqaFleetOverview>('/overview')
}

export async function fetchNodeLatest(uuid: string): Promise<IpqaDailyPairedReport | null> {
  return getJson<IpqaDailyPairedReport>(`/nodes/${uuid}/latest`)
}

export async function fetchNodeArchiveDates(uuid: string, limit = 30): Promise<string[]> {
  const data = await getJson<{ dates: string[] }>(`/nodes/${uuid}/archives?limit=${limit}`)
  return data?.dates ?? []
}

export async function fetchNodeArchive(uuid: string, date: string): Promise<IpqaDailyPairedReport | null> {
  return getJson<IpqaDailyPairedReport>(`/nodes/${uuid}/archives/${date}`)
}

export async function fetchNodeChanges(uuid: string): Promise<IpqaSemanticChange[]> {
  const data = await getJson<{ changes: IpqaSemanticChange[] }>(`/nodes/${uuid}/changes`)
  return data?.changes ?? []
}

export async function fetchNodeScoreHistory(uuid: string): Promise<IpqaScoreHistoryPoint[]> {
  const data = await getJson<{ history: IpqaScoreHistoryPoint[] }>(`/nodes/${uuid}/history/scores`)
  return data?.history ?? []
}

export async function fetchNodeMediaHistory(uuid: string): Promise<IpqaMediaHistoryPoint[]> {
  const data = await getJson<{ history: IpqaMediaHistoryPoint[] }>(`/nodes/${uuid}/history/media`)
  return data?.history ?? []
}
