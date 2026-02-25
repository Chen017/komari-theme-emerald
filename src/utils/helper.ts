/** 字节单位常量 */
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const

/** 时间单位配置（秒为单位） */
const TIME_UNITS = [
  { value: 86400, label: '天' },
  { value: 3600, label: '小时' },
  { value: 60, label: '分钟' },
  { value: 1, label: '秒' },
] as const

/**
 * 格式化字节数为可读单位
 * @param bytes 字节数
 * @param decimals 小数位数
 * @returns 格式化后的字符串，如 "1.5 GB"
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0)
    return '0 B'

  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const unit = BYTE_UNITS[i] ?? BYTE_UNITS[BYTE_UNITS.length - 1]
  return `${(bytes / k ** i).toFixed(decimals)} ${unit}`
}

/**
 * 格式化字节速率为可读单位
 * @param bytes 字节速率
 * @returns 格式化后的字符串，如 "1.5 GB/s"
 */
export function formatBytesPerSecond(bytes: number): string {
  return `${formatBytes(bytes)}/s`
}

/**
 * 格式化运行时间
 * @param seconds 秒数
 * @returns 格式化后的字符串，如 "2 天 3 小时 15 分钟"
 */
export function formatUptime(seconds: number): string {
  if (!seconds || seconds <= 0)
    return '0 秒'

  const parts: string[] = []
  let remaining = seconds

  for (const { value, label } of TIME_UNITS) {
    const amount = Math.floor(remaining / value)
    if (amount > 0) {
      parts.push(`${amount} ${label}`)
      remaining %= value
    }
  }

  return parts.length > 0 ? parts.join(' ') : '0 秒'
}

/**
 * 计算占用百分比
 * @param used 已使用量
 * @param total 总量
 * @returns 百分比（0-100）
 */
export function calcPercentage(used: number, total: number): number {
  if (total === 0)
    return 0
  return (used / total) * 100
}

/** 状态阈值配置 */
const STATUS_THRESHOLDS = {
  success: 60,
  warning: 80,
} as const

/**
 * 根据占用百分比返回状态
 * @param percentage 百分比
 * @returns 状态类型
 */
export function getStatus(percentage: number): 'success' | 'warning' | 'error' {
  if (percentage < STATUS_THRESHOLDS.success)
    return 'success'
  if (percentage < STATUS_THRESHOLDS.warning)
    return 'warning'
  return 'error'
}

/**
 * 格式化时间戳为可读日期时间
 * @param timestamp 时间戳字符串或 Date 对象
 * @returns 格式化后的字符串，如 "2024-01-15 14:30:00"
 */
export function formatDateTime(timestamp: string | Date | undefined): string {
  if (!timestamp)
    return '-'

  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp

  if (Number.isNaN(date.getTime()))
    return '-'

  // 使用 toISOString 的日期部分和手动格式化的时间部分
  const iso = date.toISOString()
  const datePart = iso.slice(0, 10)
  const timePart = iso.slice(11, 19)

  return `${datePart} ${timePart}`
}
