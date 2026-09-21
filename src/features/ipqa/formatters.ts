import type { RiskCategory } from './types'

export function getRiskColor(category: RiskCategory): {
  bg: string
  text: string
  border: string
  dot: string
} {
  switch (category) {
    case 'Critical':
      return {
        bg: 'bg-rose-50 dark:bg-rose-950/40',
        text: 'text-rose-700 dark:text-rose-300',
        border: 'border-rose-200 dark:border-rose-900/60',
        dot: 'bg-rose-500',
      }
    case 'High':
      return {
        bg: 'bg-orange-50 dark:bg-orange-950/40',
        text: 'text-orange-700 dark:text-orange-300',
        border: 'border-orange-200 dark:border-orange-900/60',
        dot: 'bg-orange-500',
      }
    case 'Medium':
      return {
        bg: 'bg-amber-50 dark:bg-amber-950/40',
        text: 'text-amber-700 dark:text-amber-300',
        border: 'border-amber-200 dark:border-amber-900/60',
        dot: 'bg-amber-500',
      }
    case 'Low':
      return {
        bg: 'bg-emerald-50 dark:bg-emerald-950/40',
        text: 'text-emerald-700 dark:text-emerald-300',
        border: 'border-emerald-200 dark:border-emerald-900/60',
        dot: 'bg-emerald-500',
      }
    default:
      return {
        bg: 'bg-neutral-100 dark:bg-neutral-800',
        text: 'text-neutral-600 dark:text-neutral-400',
        border: 'border-neutral-200 dark:border-neutral-700',
        dot: 'bg-neutral-400',
      }
  }
}

export function getRiskLabel(category: RiskCategory): string {
  switch (category) {
    case 'Critical': return '极高风险'
    case 'High': return '高风险'
    case 'Medium': return '中风险'
    case 'Low': return '低风险'
    default: return '未评估'
  }
}
