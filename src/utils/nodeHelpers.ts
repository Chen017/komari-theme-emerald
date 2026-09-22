import type { NodeData, TrafficLimitType } from '../stores/nodes'
import { formatDateTime } from './helper'
import { formatPriceWithCycle, getDaysUntilExpired, getExpireStatus, getExpireTextClass, parseTags } from './tagHelper'
import { formatTrafficResetDisplay, parseTrafficResetMetadata } from './trafficResetMetadata'

export interface PriceTagItem {
  text: string
  highlight?: boolean
}

export function hasRegion(region: string | null | undefined): boolean {
  return Boolean(region?.trim())
}

export function calculateTrafficUsed(upload: number, download: number, type: TrafficLimitType): number {
  switch (type) {
    case 'up': return upload
    case 'down': return download
    case 'min': return Math.min(upload, download)
    case 'max': return Math.max(upload, download)
    case 'sum':
    default: return upload + download
  }
}

export function showTrafficProgress(node: NodeData): boolean {
  return node.traffic_limit > 0
}

export function getTrafficUsed(node: NodeData): number {
  const { net_total_up = 0, net_total_down = 0, traffic_limit_type } = node
  return calculateTrafficUsed(net_total_up, net_total_down, traffic_limit_type)
}

export function getTrafficUsedPercentage(node: NodeData): number {
  if (node.traffic_limit <= 0)
    return 0
  const used = getTrafficUsed(node)
  return Math.min((used / node.traffic_limit) * 100, 100)
}

export function getPriceTags(node: NodeData, lang: 'zh-CN' | 'en-US'): PriceTagItem[] {
  const tags: PriceTagItem[] = []
  const days = getDaysUntilExpired(node.expired_at)
  const status = getExpireStatus(node.expired_at)
  const priceText = formatPriceWithCycle(node.price, node.billing_cycle, node.currency, lang)
  if (node.price !== 0)
    tags.push({ text: priceText })
  if (status === 'long_term')
    tags.push({ text: lang === 'zh-CN' ? '长期' : 'Long-term' })
  else if (lang === 'zh-CN')
    tags.push({ text: `${days >= 0 ? '+' : ''}${days}天`, highlight: true })
  else
    tags.push({ text: `${days >= 0 ? '+' : ''}${days}d`, highlight: true })
  return tags
}

export function getRemainingTimeTagClass(node: NodeData): string {
  if (node.price === 0)
    return ''
  return getExpireTextClass(node.expired_at)
}

export interface NodeTagDisplay {
  customTags: string[]
  trafficResetTag: string | null
  trafficResetTooltip: string | null
}

export function getNodeTagDisplay(node: NodeData, lang: 'zh-CN' | 'en-US' = 'zh-CN'): NodeTagDisplay {
  const rawTags = parseTags(node.tags).map(t => t.text)
  const resetMeta = parseTrafficResetMetadata(node.tags)

  if (resetMeta.resetDay === null) {
    return {
      customTags: rawTags,
      trafficResetTag: null,
      trafficResetTooltip: null,
    }
  }

  // Filter out recognized machine tokens from custom tags
  const TRD_REMOVE_REGEX = /<TRD\s*:\s*\d+>/gi
  const TRTZ_REMOVE_REGEX = /<TRTZ\s*:\s*[^>\s]+>/gi

  const filteredTags: string[] = []
  for (const tag of rawTags) {
    const cleaned = tag.replace(TRD_REMOVE_REGEX, '').replace(TRTZ_REMOVE_REGEX, '').trim()
    if (cleaned.length > 0) {
      filteredTags.push(cleaned)
    }
  }

  const trafficResetTag = formatTrafficResetDisplay(resetMeta, lang)
  const trafficResetTooltip = resetMeta.isFallbackTimezone
    ? (lang === 'zh-CN' ? '未配置 <TRTZ:...>，当前按 Asia/Shanghai 计算重置边界' : 'No <TRTZ:...> configured, defaulting to Asia/Shanghai for reset boundaries')
    : null

  return {
    customTags: filteredTags,
    trafficResetTag,
    trafficResetTooltip,
  }
}

export function getCustomTags(node: NodeData): string[] {
  return getNodeTagDisplay(node).customTags
}

export function formatOfflineTime(node: NodeData): string {
  return formatDateTime(node.time)
}

export function getMemPercentage(node: NodeData): number {
  return (node.ram ?? 0) / (node.mem_total || 1) * 100
}

export function getDiskPercentage(node: NodeData): number {
  return (node.disk ?? 0) / (node.disk_total || 1) * 100
}
