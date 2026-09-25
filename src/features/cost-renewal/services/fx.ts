import type { ExchangeRates, ExchangeRateSource } from '@/utils/financeHelper'
import { computed, ref, shallowRef } from 'vue'
import {
  DEFAULT_EXCHANGE_RATES,
  formatFinanceAmount,
  getDailyExchangeRates,
  getTodayDateKey,
} from '@/utils/financeHelper'

export interface FxState {
  rates: ExchangeRates
  source: ExchangeRateSource
  date: string
  loading: boolean
  error: string | null
}

const sourceLabels: Record<ExchangeRateSource, string> = {
  'network': '当日网络汇率',
  'cache': '当日缓存汇率',
  'stale-cache': '过期缓存汇率 (网络不可用)',
  'default': '内置基准汇率 (网络与缓存不可用)',
}

export function getFxSourceLabel(source: ExchangeRateSource): string {
  return sourceLabels[source] ?? '汇率状态未知'
}

export function formatCny(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount))
    return '--'
  const formatted = formatFinanceAmount(amount, 'CNY')
  return `${formatted.symbol}${formatted.value}`
}

export function useFxRates() {
  const rates = shallowRef<ExchangeRates>(DEFAULT_EXCHANGE_RATES)
  const source = ref<ExchangeRateSource>('default')
  const date = ref<string>(getTodayDateKey())
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchRates(force = false) {
    loading.value = true
    error.value = null
    try {
      const result = await getDailyExchangeRates(force)
      rates.value = result.rates
      source.value = result.source
      date.value = result.date
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      rates.value = DEFAULT_EXCHANGE_RATES
      source.value = 'default'
    }
    finally {
      loading.value = false
    }
  }

  const sourceLabel = computed(() => getFxSourceLabel(source.value))

  return {
    rates,
    source,
    date,
    loading,
    error,
    sourceLabel,
    fetchRates,
  }
}
