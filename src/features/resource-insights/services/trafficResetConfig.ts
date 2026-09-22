export interface TrafficResetConfigResult {
  day: number | null
  source: 'tag' | 'settings' | 'none'
}

export interface TrafficResetSettings {
  trafficResetDays?: Record<string, number>
  [key: string]: unknown
}

const TRD_TAG_REGEX = /<\s*TRD\s*:\s*(\d+)\s*>/i

/**
 * Extracts traffic reset day (1-31) from node tags, e.g. `<TRD:18>`.
 * Supports both string (e.g. "web, <TRD:18>") and string array (e.g. ["web", "<TRD:18>"]).
 */
export function extractResetDayFromTags(tags: string | readonly string[] | null | undefined): number | null {
  if (!tags) return null
  if (Array.isArray(tags)) {
    for (const tag of tags) {
      if (typeof tag === 'string') {
        const match = TRD_TAG_REGEX.exec(tag)
        if (match && match[1]) {
          const parsed = parseInt(match[1], 10)
          if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 31) {
            return parsed
          }
        }
      }
    }
    return null
  }
  if (typeof tags === 'string') {
    const match = TRD_TAG_REGEX.exec(tags)
    if (!match || !match[1]) return null
    const parsed = parseInt(match[1], 10)
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 31) {
      return parsed
    }
  }
  return null
}

/**
 * Resolves the traffic reset day for a node based on:
 * 1. Node tags (<TRD:18>)
 * 2. Theme settings override (trafficResetDays[uuid])
 * 3. Fallback: null ('none')
 */
export function resolveTrafficResetDay(
  node: { uuid: string, tags?: string | readonly string[] } | null | undefined,
  settings?: TrafficResetSettings | null,
): TrafficResetConfigResult {
  if (!node) {
    return { day: null, source: 'none' }
  }

  // Priority 1: Tag format <TRD:D>
  const tagDay = extractResetDayFromTags(node.tags)
  if (tagDay !== null) {
    return { day: tagDay, source: 'tag' }
  }

  // Priority 2: Theme settings override
  const settingsDay = settings?.trafficResetDays?.[node.uuid]
  if (typeof settingsDay === 'number' && Number.isInteger(settingsDay) && settingsDay >= 1 && settingsDay <= 31) {
    return { day: settingsDay, source: 'settings' }
  }

  return { day: null, source: 'none' }
}
