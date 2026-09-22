export interface TrafficResetConfigResult {
  day: number | null
  timezone: string | null
  source: 'tag' | 'settings' | 'none'
  timezoneSource: 'tag' | 'settings' | 'fallback' | 'none'
}

export interface TrafficResetSettings {
  trafficResetDays?: Record<string, number>
  trafficResetTimezones?: Record<string, string>
  defaultTrafficResetTimezone?: string
  [key: string]: unknown
}

const TRD_TAG_REGEX = /<\s*TRD\s*:\s*(\d+)\s*>/i
const TRTZ_TAG_REGEX = /<\s*TRTZ\s*:\s*([^>]+)\s*>/i

export function isValidTimeZone(tz: string | null | undefined): boolean {
  if (!tz || typeof tz !== 'string') return false
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz.trim() })
    return true
  }
  catch {
    return false
  }
}

/**
 * Extracts traffic reset day (1-31) from node tags, e.g. `<TRD:18>`.
 * Supports both string (e.g. "web, <TRD:18>") and string array (e.g. ["web", "<TRD:18>"]).
 */
export function extractResetDayFromTags(tags: string | readonly string[] | null | undefined): number | null {
  if (!tags) return null
  const list = Array.isArray(tags) ? tags : [tags]
  for (const item of list) {
    if (typeof item === 'string') {
      const match = TRD_TAG_REGEX.exec(item)
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

/**
 * Extracts traffic reset timezone from node tags, e.g. `<TRTZ:America/New_York>`.
 */
export function extractResetTimezoneFromTags(tags: string | readonly string[] | null | undefined): string | null {
  if (!tags) return null
  const list = Array.isArray(tags) ? tags : [tags]
  for (const item of list) {
    if (typeof item === 'string') {
      const match = TRTZ_TAG_REGEX.exec(item)
      if (match && match[1]) {
        const candidate = match[1].trim()
        if (isValidTimeZone(candidate)) {
          return candidate
        }
      }
    }
  }
  return null
}

/**
 * Resolves full traffic reset config (day and timezone) based on:
 * 1. Node tags (<TRD:N>, <TRTZ:TZ>)
 * 2. Theme settings override
 * 3. Fallback default timezone
 */
export function resolveTrafficResetConfig(
  node: { uuid: string, tags?: string | readonly string[] } | null | undefined,
  settings?: TrafficResetSettings | null,
): TrafficResetConfigResult {
  if (!node) {
    return { day: null, timezone: null, source: 'none', timezoneSource: 'none' }
  }

  // Priority 1: Tag format <TRD:D> & <TRTZ:TZ>
  const tagDay = extractResetDayFromTags(node.tags)
  const tagTimezone = extractResetTimezoneFromTags(node.tags)

  // Priority 2: Theme settings override
  const settingsDay = settings?.trafficResetDays?.[node.uuid]
  const settingsTimezone = settings?.trafficResetTimezones?.[node.uuid]

  let day: number | null = null
  let source: 'tag' | 'settings' | 'none' = 'none'

  if (tagDay !== null) {
    day = tagDay
    source = 'tag'
  }
  else if (typeof settingsDay === 'number' && Number.isInteger(settingsDay) && settingsDay >= 1 && settingsDay <= 31) {
    day = settingsDay
    source = 'settings'
  }

  let timezone: string | null = null
  let timezoneSource: 'tag' | 'settings' | 'fallback' | 'none' = 'none'

  if (tagTimezone !== null) {
    timezone = tagTimezone
    timezoneSource = 'tag'
  }
  else if (typeof settingsTimezone === 'string' && isValidTimeZone(settingsTimezone)) {
    timezone = settingsTimezone.trim()
    timezoneSource = 'settings'
  }
  else if (day !== null) {
    const fallbackTz = settings?.defaultTrafficResetTimezone
    if (typeof fallbackTz === 'string' && isValidTimeZone(fallbackTz)) {
      timezone = fallbackTz.trim()
      timezoneSource = 'fallback'
    }
    else {
      timezone = 'Asia/Shanghai'
      timezoneSource = 'fallback'
    }
  }

  return { day, timezone, source, timezoneSource }
}

/**
 * Resolves the traffic reset day for a node.
 */
export function resolveTrafficResetDay(
  node: { uuid: string, tags?: string | readonly string[] } | null | undefined,
  settings?: TrafficResetSettings | null,
): { day: number | null, source: 'tag' | 'settings' | 'none' } {
  const config = resolveTrafficResetConfig(node, settings)
  return { day: config.day, source: config.source }
}
