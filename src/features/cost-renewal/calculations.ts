import type { NodeData } from '@/stores/nodes'
import type { CurrencyCode, ExchangeRates, ExchangeRateSource } from '@/utils/financeHelper'
import type { ExpireStatus } from '@/utils/tagHelper'
import type { CostRenewalSummary, NormalizedNodeCost, RenewalFilter, RenewalTimelineItem } from './types'
import { normalizeCurrency } from '../../utils/financeHelper'
import { getBillingCycleText, getDaysUntilExpired, getExpireStatus } from '../../utils/tagHelper'

/**
 * Maps billing cycle in days to billing months.
 * Follows standard cycle heuristics:
 * - 27-32 days: 1 month
 * - 87-95 days: 3 months (Quarter)
 * - 175-185 days: 6 months (Semi-Annual)
 * - 360-370 days: 12 months (Annual)
 * - 720-750 days: 24 months (Biennial)
 * - 1080-1150 days: 36 months (Triennial)
 * - 1800-1850 days: 60 months (Quinquennial)
 * - Custom days > 0: days / 30
 * - <= 0 or invalid: null
 */
export function billingCycleToMonths(billingCycle: number | null | undefined): number | null {
  if (billingCycle === null || billingCycle === undefined)
    return null

  const days = Number(billingCycle)
  if (!Number.isFinite(days) || days <= 0)
    return null

  if (days >= 27 && days <= 32)
    return 1
  if (days >= 87 && days <= 95)
    return 3
  if (days >= 175 && days <= 185)
    return 6
  if (days >= 360 && days <= 370)
    return 12
  if (days >= 720 && days <= 750)
    return 24
  if (days >= 1080 && days <= 1150)
    return 36
  if (days >= 1800 && days <= 1850)
    return 60

  return days / 30
}

/**
 * Converts an amount in a given currency to CNY using provided exchange rates.
 */
export function convertCurrencyToCny(
  amount: number | null | undefined,
  currency: string | null | undefined,
  rates: ExchangeRates,
): number | null {
  if (amount === null || amount === undefined)
    return null

  const numericAmount = Number(amount)
  if (!Number.isFinite(numericAmount) || numericAmount < 0)
    return null

  if (numericAmount === 0)
    return 0

  const code = normalizeCurrency(currency)
  if (code === 'CNY')
    return numericAmount

  const rate = rates[code]
  if (!rate || !Number.isFinite(rate) || rate <= 0)
    return null

  return numericAmount / rate
}

/**
 * Normalizes a single Komari node's cost and renewal details.
 */
export function normalizeNodeCost(
  node: NodeData,
  rates: ExchangeRates,
  _now = new Date(),
): NormalizedNodeCost {
  const isFree = Boolean(
    node.tags?.includes('白嫖中')
    || Number(node.price) === 0
    || Number(node.price) === -1,
  )

  const originalAmount = Number.isFinite(Number(node.price)) && Number(node.price) >= 0
    ? Number(node.price)
    : null

  const originalCurrency = node.currency ? String(node.currency).trim().toUpperCase() : null
  const billingCycleDays = Number.isFinite(Number(node.billing_cycle)) && Number(node.billing_cycle) > 0
    ? Number(node.billing_cycle)
    : null

  const billingMonths = billingCycleToMonths(billingCycleDays)
  const billingCycleLabel = billingCycleDays
    ? formatBillingCycleLabel(billingCycleDays)
    : '未设置'

  let renewalAmountCny: number | null = null
  let monthlyCny: number | null = null
  let annualizedCny: number | null = null

  if (isFree) {
    renewalAmountCny = 0
    monthlyCny = 0
    annualizedCny = 0
  }
  else if (originalAmount !== null) {
    renewalAmountCny = convertCurrencyToCny(originalAmount, originalCurrency, rates)
    if (renewalAmountCny !== null && billingMonths !== null && billingMonths > 0) {
      monthlyCny = renewalAmountCny / billingMonths
      annualizedCny = monthlyCny * 12
    }
  }

  const rawExpiry = node.expired_at?.trim()
  const expiryDate = rawExpiry ? new Date(rawExpiry) : null
  const hasValidExpiry = expiryDate !== null && Number.isFinite(expiryDate.getTime())

  const expiryAt = hasValidExpiry && rawExpiry ? rawExpiry : null
  const daysUntilExpiry = expiryAt ? getDaysUntilExpired(expiryAt) : null
  const expireStatus = expiryAt ? getExpireStatus(expiryAt) : 'no_expiry'

  return {
    uuid: node.uuid,
    name: node.name,
    originalAmount,
    originalCurrency,
    billingMonths,
    billingCycleDays,
    billingCycleLabel,
    monthlyCny,
    annualizedCny,
    renewalAmountCny,
    expiryAt,
    daysUntilExpiry,
    expireStatus,
    autoRenewal: Boolean(node.auto_renewal),
    isFree,
  }
}

/**
 * Calculates aggregate summary across all nodes.
 */
export function calculateCostRenewalSummary(
  nodes: readonly NodeData[],
  rates: ExchangeRates,
  rateSource: ExchangeRateSource,
  rateDate: string,
  renewalWindowDays = 30,
  now = new Date(),
): CostRenewalSummary {
  const normalizedNodes = nodes.map(node => normalizeNodeCost(node, rates, now))
  const pricedNodes = normalizedNodes.filter(node => !node.isFree && node.monthlyCny !== null)

  const monthlyCny = pricedNodes.reduce((sum, node) => sum + (node.monthlyCny ?? 0), 0)
  const annualBudgetCny = monthlyCny * 12

  // Upcoming renewals: nodes expiring within [0, renewalWindowDays]
  const upcomingNodes = normalizedNodes.filter(node =>
    node.daysUntilExpiry !== null
    && node.daysUntilExpiry >= 0
    && node.daysUntilExpiry <= renewalWindowDays
    && node.renewalAmountCny !== null
    && node.renewalAmountCny > 0,
  )

  const upcomingRenewalCny = upcomingNodes.reduce(
    (sum, node) => sum + (node.renewalAmountCny ?? 0),
    0,
  )

  return {
    monthlyCny,
    annualBudgetCny,
    upcomingRenewalCny,
    upcomingRenewalCount: upcomingNodes.length,
    pricedNodeCount: pricedNodes.length,
    totalNodeCount: nodes.length,
    rateSource,
    rateDate,
    rates,
  }
}

/**
 * Filters normalized nodes based on renewal filter criteria.
 */
export function filterRenewalNodes(
  nodes: readonly NormalizedNodeCost[],
  filter: RenewalFilter,
): NormalizedNodeCost[] {
  return nodes.filter((node) => {
    switch (filter) {
      case '30d':
        return node.daysUntilExpiry !== null && node.daysUntilExpiry >= 0 && node.daysUntilExpiry <= 30
      case '90d':
        return node.daysUntilExpiry !== null && node.daysUntilExpiry >= 0 && node.daysUntilExpiry <= 90
      case 'expired':
        return node.daysUntilExpiry !== null && node.daysUntilExpiry < 0
      case 'no_expiry':
        return node.expiryAt === null || node.expireStatus === 'no_expiry'
      case 'all':
      default:
        return true
    }
  })
}

/**
 * Builds sorted renewal timeline items from normalized nodes.
 */
export function buildRenewalTimeline(
  nodes: readonly NormalizedNodeCost[],
  filter: RenewalFilter = 'all',
): RenewalTimelineItem[] {
  const filtered = filterRenewalNodes(nodes, filter)

  const items: RenewalTimelineItem[] = filtered.map((node) => {
    const days = node.daysUntilExpiry
    const status = node.expireStatus

    let timingLabel = '未设置到期日'
    let statusLabel = '未设置'

    if (status === 'long_term') {
      timingLabel = '长期有效'
      statusLabel = '长期有效'
    }
    else if (days !== null) {
      if (days === 0) {
        timingLabel = '今天到期'
        statusLabel = '今天到期'
      }
      else if (days < 0) {
        timingLabel = `已过期 ${Math.abs(days)} 天`
        statusLabel = '已过期'
      }
      else {
        timingLabel = `${days} 天后`
        statusLabel = days <= 7 ? '即将到期' : days <= 15 ? '临近到期' : '计划内'
      }
    }

    const renewalLabel = node.autoRenewal ? '自动续费' : '手动续费'
    const date = node.expiryAt ? node.expiryAt.slice(0, 10) : '--'

    return {
      uuid: node.uuid,
      name: node.name,
      date,
      daysRemaining: days,
      timingLabel,
      renewalLabel,
      status,
      statusLabel,
      renewalAmountCny: node.renewalAmountCny,
      originalAmount: node.originalAmount,
      originalCurrency: node.originalCurrency,
    }
  })

  // Sort: expired first (most recently expired first), then ascending by days remaining, then long_term and no_expiry
  return items.sort((a, b) => {
    // 1. If both are expired, sort by daysRemaining descending (e.g. -1 before -10)
    if (a.status === 'expired' && b.status === 'expired') {
      return (b.daysRemaining ?? 0) - (a.daysRemaining ?? 0)
    }
    // 2. If one is expired, it comes first
    if (a.status === 'expired')
      return -1
    if (b.status === 'expired')
      return 1

    // 3. Normal expiring nodes: sort by daysRemaining ascending
    if (a.daysRemaining !== null && b.daysRemaining !== null) {
      return a.daysRemaining - b.daysRemaining
    }
    if (a.daysRemaining !== null)
      return -1
    if (b.daysRemaining !== null)
      return 1

    // 4. Long term before no_expiry
    if (a.status === 'long_term' && b.status !== 'long_term')
      return -1
    if (b.status === 'long_term' && a.status !== 'long_term')
      return 1

    return a.name.localeCompare(b.name)
  })
}

function formatBillingCycleLabel(billingCycle: number): string {
  const label = getBillingCycleText(billingCycle)
  return ['月', '季', '半年', '年', '两年', '三年', '五年'].includes(label) ? `${label}付` : label
}
