export interface TrafficResetMetadata {
  resetDay: number | null
  resetTimezone: string
  isFallbackTimezone: boolean
  hasExplicitTimezone: boolean
}

export const DEFAULT_TRAFFIC_RESET_TIMEZONE = 'Asia/Shanghai'

const TRD_TAG_REGEX = /<TRD\s*:\s*(\d+)>/i
const TRTZ_TAG_REGEX = /<TRTZ\s*:\s*([^>\s]+)>/i

export function isValidTimeZone(tz: string | null | undefined): boolean {
  if (!tz || typeof tz !== 'string')
    return false
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz.trim() })
    return true
  }
  catch {
    return false
  }
}

export function parseTrafficResetMetadata(
  tags?: string | readonly string[] | null,
): TrafficResetMetadata {
  if (!tags) {
    return {
      resetDay: null,
      resetTimezone: DEFAULT_TRAFFIC_RESET_TIMEZONE,
      isFallbackTimezone: false,
      hasExplicitTimezone: false,
    }
  }

  const list = Array.isArray(tags) ? tags : [tags]
  let resetDay: number | null = null
  let resetTimezone: string | null = null

  for (const item of list) {
    if (typeof item !== 'string')
      continue
    if (resetDay === null) {
      const matchD = TRD_TAG_REGEX.exec(item)
      if (matchD && matchD[1]) {
        const parsed = Number.parseInt(matchD[1], 10)
        if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 31) {
          resetDay = parsed
        }
      }
    }
    if (resetTimezone === null) {
      const matchTz = TRTZ_TAG_REGEX.exec(item)
      if (matchTz && matchTz[1]) {
        const candidate = matchTz[1].trim()
        if (isValidTimeZone(candidate)) {
          resetTimezone = candidate
        }
      }
    }
  }

  if (resetDay === null) {
    return {
      resetDay: null,
      resetTimezone: DEFAULT_TRAFFIC_RESET_TIMEZONE,
      isFallbackTimezone: false,
      hasExplicitTimezone: false,
    }
  }

  if (resetTimezone !== null) {
    return {
      resetDay,
      resetTimezone,
      isFallbackTimezone: false,
      hasExplicitTimezone: true,
    }
  }

  return {
    resetDay,
    resetTimezone: DEFAULT_TRAFFIC_RESET_TIMEZONE,
    isFallbackTimezone: true,
    hasExplicitTimezone: false,
  }
}

export function formatTrafficResetDisplay(
  metadata: TrafficResetMetadata,
  lang: 'zh-CN' | 'en-US' = 'zh-CN',
): string | null {
  if (metadata.resetDay === null)
    return null

  const tzLabel = metadata.isFallbackTimezone
    ? `${metadata.resetTimezone}${lang === 'zh-CN' ? '（默认）' : ' (default)'}`
    : metadata.resetTimezone

  if (lang === 'zh-CN') {
    return `流量重置日：${metadata.resetDay} · 重置时区：${tzLabel}`
  }
  return `Traffic reset: Day ${metadata.resetDay} · Timezone: ${tzLabel}`
}
