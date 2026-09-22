import type { CurrencyCode, ExchangeRates, ExchangeRateSource } from '@/utils/financeHelper'
import type { ExpireStatus } from '@/utils/tagHelper'

export type RenewalFilter = 'all' | '30d' | '90d' | 'expired' | 'no_expiry'

export interface NormalizedNodeCost {
  uuid: string
  name: string
  originalAmount: number | null
  originalCurrency: string | null
  billingMonths: number | null
  billingCycleDays: number | null
  billingCycleLabel: string
  monthlyCny: number | null
  annualizedCny: number | null
  renewalAmountCny: number | null
  expiryAt: string | null
  daysUntilExpiry: number | null
  expireStatus: ExpireStatus | 'no_expiry'
  autoRenewal: boolean
  isFree: boolean
}

export interface CostRenewalSummary {
  monthlyCny: number
  annualBudgetCny: number
  upcomingRenewalCny: number
  upcomingRenewalCount: number
  pricedNodeCount: number
  totalNodeCount: number
  rateSource: ExchangeRateSource
  rateDate: string
  rates: ExchangeRates
}

export interface RenewalTimelineItem {
  uuid: string
  name: string
  date: string
  daysRemaining: number | null
  timingLabel: string
  renewalLabel: string
  status: ExpireStatus | 'no_expiry'
  statusLabel: string
  renewalAmountCny: number | null
  originalAmount: number | null
  originalCurrency: string | null
}
