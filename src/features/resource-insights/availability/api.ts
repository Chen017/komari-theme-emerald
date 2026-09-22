import type { AvailabilitySummaryResponse } from './types'

export class AvailabilityPluginUnavailableError extends Error {
  constructor(message = '需要 Availability History 插件') {
    super(message)
    this.name = 'AvailabilityPluginUnavailableError'
  }
}

export class AvailabilityApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message)
    this.name = 'AvailabilityApiError'
  }
}

export interface FetchAvailabilitySummaryOptions {
  days?: number
  uuids?: string[]
  signal?: AbortSignal
}

export async function fetchAvailabilitySummary(
  options: FetchAvailabilitySummaryOptions = {},
): Promise<AvailabilitySummaryResponse> {
  const { days = 30, uuids, signal } = options
  const params = new URLSearchParams()
  params.set('days', String(days))
  if (uuids && uuids.length > 0) {
    params.set('uuids', uuids.join(','))
  }

  const url = `/api/plugin/availability-history/v1/summary?${params.toString()}`

  let res: Response
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal,
    })
  }
  catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw err
    }
    throw new AvailabilityApiError('在线率接口连接失败')
  }

  if (res.status === 404) {
    throw new AvailabilityPluginUnavailableError('在线率历史不可用：需要 Availability History 插件')
  }

  if (res.status === 502 || res.status === 503) {
    throw new AvailabilityApiError(`在线率服务暂时不可用 (${res.status})`, res.status)
  }

  if (!res.ok) {
    throw new AvailabilityApiError(`在线率接口请求失败 (${res.status})`, res.status)
  }

  let data: unknown
  try {
    data = await res.json()
  }
  catch {
    throw new AvailabilityApiError('在线率接口返回无效数据')
  }

  if (!data || typeof data !== 'object' || !Array.isArray((data as AvailabilitySummaryResponse).nodes)) {
    throw new AvailabilityApiError('在线率接口响应格式不符合规范')
  }

  return data as AvailabilitySummaryResponse
}
