import type { IpqaNodeOverview } from './types'

export type IpqaProtocolVersion = 'v4' | 'v6'
export type IpqaOverviewServiceKind = 'media' | 'ai'

export interface IpqaOverviewServiceResult {
  unlocked: boolean
  region?: string
  available: boolean
}

export function findProtocolOverviewService(
  node: IpqaNodeOverview,
  ipVersion: IpqaProtocolVersion,
  serviceKeys: readonly string[],
  kind: IpqaOverviewServiceKind,
): IpqaOverviewServiceResult {
  const hasVersion = ipVersion === 'v4' ? node.has_ipv4 : node.has_ipv6
  if (!hasVersion)
    return { unlocked: false, available: false }

  const protocol = ipVersion === 'v4' ? node.v4 : node.v6
  const pool = protocol?.[kind]
  if (!pool)
    return { unlocked: false, available: false }

  for (const serviceKey of serviceKeys) {
    const lower = serviceKey.toLowerCase()
    for (const [key, value] of Object.entries(pool)) {
      const normalizedKey = key.toLowerCase()
      if (normalizedKey === lower || normalizedKey.includes(lower)) {
        return {
          unlocked: Boolean(value?.unlocked),
          region: value?.region,
          available: true,
        }
      }
    }
  }

  return { unlocked: false, available: false }
}
