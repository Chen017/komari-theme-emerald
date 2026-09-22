import type { ResetWindow, TrafficRange } from './types'

const TRD_TAG_REGEX = /<TRD\s*:\s*(\d+)>/i
const TRTZ_TAG_REGEX = /<TRTZ\s*:\s*([^>\s]+)>/i

export const BEIJING_TIMEZONE = 'Asia/Shanghai'
export const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000 // UTC+8

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

export function parseResetMetadata(tags?: string | readonly string[] | null): {
  resetDay: number | null
  resetTimezone: string
  isFallbackTimezone: boolean
} {
  if (!tags) {
    return { resetDay: null, resetTimezone: BEIJING_TIMEZONE, isFallbackTimezone: false }
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
    return { resetDay: null, resetTimezone: BEIJING_TIMEZONE, isFallbackTimezone: false }
  }

  if (resetTimezone !== null) {
    return { resetDay, resetTimezone, isFallbackTimezone: false }
  }

  return { resetDay, resetTimezone: BEIJING_TIMEZONE, isFallbackTimezone: true }
}

function getZonedParts(epochMs: number, timeZone: string): { year: number, month: number, day: number, hour: number, minute: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  })
  const parts = formatter.formatToParts(new Date(epochMs))
  const map: Record<string, string> = {}
  for (const p of parts) {
    map[p.type] = p.value
  }
  return {
    year: Number.parseInt(map.year ?? '1970', 10),
    month: Number.parseInt(map.month ?? '1', 10),
    day: Number.parseInt(map.day ?? '1', 10),
    hour: Number.parseInt(map.hour ?? '0', 10) % 24,
    minute: Number.parseInt(map.minute ?? '0', 10),
  }
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Finds the epoch ms of 00:00:00 on year-month-day in the given timezone.
 */
export function findZonedMidnightEpoch(year: number, month: number, day: number, timeZone: string): number {
  if (timeZone === BEIJING_TIMEZONE) {
    return Date.UTC(year, month - 1, day) - BEIJING_OFFSET_MS
  }

  const guessUtc = Date.UTC(year, month - 1, day)
  let low = guessUtc - 36 * 3600 * 1000
  let high = guessUtc + 36 * 3600 * 1000

  // Binary search for earliest instant that produces this date in timeZone
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    const p = getZonedParts(mid, timeZone)
    const cmp = p.year !== year ? p.year - year : (p.month !== month ? p.month - month : p.day - day)
    if (cmp < 0) {
      low = mid + 1
    }
    else {
      high = mid
    }
  }
  return low
}

export function formatBeijingDate(epochMs: number): string {
  // Asia/Shanghai is fixed UTC+8
  const beijingDate = new Date(epochMs + BEIJING_OFFSET_MS)
  const y = beijingDate.getUTCFullYear()
  const m = String(beijingDate.getUTCMonth() + 1).padStart(2, '0')
  const d = String(beijingDate.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function getBeijingDayBounds(dateStr: string): { startMs: number, endMs: number } {
  const [y, m, d] = dateStr.split('-').map(Number)
  const startMs = Date.UTC(y!, m! - 1, d!) - BEIJING_OFFSET_MS
  const endMs = startMs + 24 * 60 * 60 * 1000
  return { startMs, endMs }
}

export function calculateResetWindow(
  resetDay: number,
  resetTimezone: string,
  isFallbackTimezone: boolean,
  now: Date = new Date(),
): ResetWindow {
  const nowMs = now.getTime()
  const nowParts = getZonedParts(nowMs, resetTimezone)

  let startYear = nowParts.year
  let startMonth = nowParts.month

  if (nowParts.day < resetDay) {
    startMonth -= 1
    if (startMonth < 1) {
      startMonth = 12
      startYear -= 1
    }
  }

  const effectiveResetDay = Math.min(resetDay, daysInMonth(startYear, startMonth))
  const resetStartEpochMs = findZonedMidnightEpoch(startYear, startMonth, effectiveResetDay, resetTimezone)

  const startDate = formatBeijingDate(resetStartEpochMs)
  const endDate = formatBeijingDate(nowMs)

  const startBounds = getBeijingDayBounds(startDate)
  const endBounds = getBeijingDayBounds(endDate)
  const diffDays = Math.max(1, Math.round((endBounds.startMs - startBounds.startMs) / (24 * 3600 * 1000)) + 1)

  const startBeijingParts = getZonedParts(resetStartEpochMs, BEIJING_TIMEZONE)
  const mStr = String(startBeijingParts.month).padStart(2, '0')
  const dStr = String(startBeijingParts.day).padStart(2, '0')
  const hStr = String(startBeijingParts.hour).padStart(2, '0')
  const minStr = String(startBeijingParts.minute).padStart(2, '0')
  const resetStartText = `${mStr}-${dStr} ${hStr}:${minStr} BJT`

  return {
    startDate,
    endDate,
    diffDays,
    resetDay,
    resetTimezone,
    resetStartEpochMs,
    resetStartText,
    isFallbackTimezone,
  }
}

export function getBeijingDates(
  range: TrafficRange,
  resetWindow?: ResetWindow | null,
  now: Date = new Date(),
): string[] {
  const todayBeijing = formatBeijingDate(now.getTime())
  const todayBounds = getBeijingDayBounds(todayBeijing)

  let count = 7
  if (range === '30d') {
    count = 30
  }
  else if (range === 'cycle') {
    if (!resetWindow) {
      count = 7
    }
    else {
      const dates: string[] = []
      const startBounds = getBeijingDayBounds(resetWindow.startDate)
      for (let cursor = startBounds.startMs; cursor <= todayBounds.startMs; cursor += 24 * 3600 * 1000) {
        dates.push(formatBeijingDate(cursor))
      }
      return dates
    }
  }

  const dates: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    const epoch = todayBounds.startMs - i * 24 * 3600 * 1000
    dates.push(formatBeijingDate(epoch))
  }
  return dates
}
