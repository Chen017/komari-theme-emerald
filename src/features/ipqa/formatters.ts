import type { ClassifiedRiskScore, RiskCategory } from './types'

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

function getScoreCls(category: RiskCategory): string {
  switch (category) {
    case 'Critical':
      return 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 font-bold'
    case 'High':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300 font-medium'
    case 'Medium':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 font-medium'
    case 'Low':
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-medium'
    default:
      return 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500 font-mono'
  }
}

export function evaluateProviderScore(
  providerKey: string,
  val: unknown,
  classifiedScore?: ClassifiedRiskScore,
): {
  text: string
  cls: string
  category: RiskCategory
  tagLabel: string
} {
  // If structured classifiedScore is already provided from backend, use it directly
  if (classifiedScore && classifiedScore.available) {
    const category = classifiedScore.categoryKey
    const tagLabel = classifiedScore.categoryLabel || getRiskLabel(category)
    const text = val === null || val === 'null' ? 'null' : String(val ?? '')
    return {
      text,
      cls: getScoreCls(category),
      category,
      tagLabel,
    }
  }

  // Null-like check
  if (val === null || val === 'null') {
    return {
      text: 'null',
      cls: 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500 font-mono',
      category: 'Unknown',
      tagLabel: '无数据',
    }
  }

  if (val === undefined || val === '' || val === 'N/A' || val === '--' || val === '-') {
    return {
      text: '--',
      cls: 'text-neutral-300 dark:text-neutral-600',
      category: 'Unknown',
      tagLabel: '无数据',
    }
  }

  const str = String(val).trim()
  const key = providerKey.toUpperCase()

  // 1. ipapi: percentage format (e.g. "2.73%", "18.16%", "0.73%")
  // bp (basis points): 1% = 100 bp (e.g. 2.73% = 273 bp, 18.16% = 1816 bp)
  // <15: 极低风险 | <85: 低风险 | <300: 较高风险 | <1000: 高风险 | >=1000: 极高风险
  if (key.includes('IPAPI')) {
    const num = Number(str.replace('%', ''))
    if (Number.isFinite(num)) {
      const bp = Math.round(num * 100)
      if (bp < 15) {
        return { text: str, cls: getScoreCls('Low'), category: 'Low', tagLabel: '极低风险' }
      }
      if (bp < 85) {
        return { text: str, cls: getScoreCls('Low'), category: 'Low', tagLabel: '低风险' }
      }
      if (bp < 300) {
        return { text: str, cls: getScoreCls('Medium'), category: 'Medium', tagLabel: '较高风险' }
      }
      if (bp < 1000) {
        return { text: str, cls: getScoreCls('High'), category: 'High', tagLabel: '高风险' }
      }
      return { text: str, cls: getScoreCls('Critical'), category: 'Critical', tagLabel: '极高风险' }
    }
  }

  // 2. IP2Location (0-32 低 | 33-65 中 | 66+ 高, or textual "VERY HIGH", "HIGH", "MEDIUM", "LOW")
  if (key.includes('IP2LOCATION')) {
    const upper = str.toUpperCase()
    if (upper.includes('VERY HIGH') || upper.includes('CRITICAL')) {
      return { text: str, cls: getScoreCls('Critical'), category: 'Critical', tagLabel: '极高风险' }
    }
    if (upper.includes('HIGH')) {
      return { text: str, cls: getScoreCls('High'), category: 'High', tagLabel: '高风险' }
    }
    if (upper.includes('MEDIUM')) {
      return { text: str, cls: getScoreCls('Medium'), category: 'Medium', tagLabel: '中风险' }
    }
    if (upper.includes('LOW') || upper.includes('CLEAN') || upper.includes('GOOD')) {
      return { text: str, cls: getScoreCls('Low'), category: 'Low', tagLabel: '低风险' }
    }
    const num = Number(str)
    if (Number.isFinite(num)) {
      if (num < 33) {
        return { text: str, cls: getScoreCls('Low'), category: 'Low', tagLabel: '低风险' }
      }
      if (num < 66) {
        return { text: str, cls: getScoreCls('Medium'), category: 'Medium', tagLabel: '中风险' }
      }
      return { text: str, cls: getScoreCls('High'), category: 'High', tagLabel: '高风险' }
    }
  }

  // 3. Scamalytics (0-19 低 | 20-59 中 | 60-89 高 | 90+ 极高)
  if (key.includes('SCAMALYTICS')) {
    const num = Number(str.replace('%', ''))
    if (Number.isFinite(num)) {
      if (num < 20) {
        return { text: str, cls: getScoreCls('Low'), category: 'Low', tagLabel: '低风险' }
      }
      if (num < 60) {
        return { text: str, cls: getScoreCls('Medium'), category: 'Medium', tagLabel: '中风险' }
      }
      if (num < 90) {
        return { text: str, cls: getScoreCls('High'), category: 'High', tagLabel: '高风险' }
      }
      return { text: str, cls: getScoreCls('Critical'), category: 'Critical', tagLabel: '极高风险' }
    }
  }

  // 4. AbuseIPDB (0-24 低 | 25-74 高 | 75+ 建议封禁)
  if (key.includes('ABUSEIPDB')) {
    const num = Number(str.replace('%', ''))
    if (Number.isFinite(num)) {
      if (num < 25) {
        return { text: str, cls: getScoreCls('Low'), category: 'Low', tagLabel: '低风险' }
      }
      if (num < 75) {
        return { text: str, cls: getScoreCls('High'), category: 'High', tagLabel: '高风险' }
      }
      return { text: str, cls: getScoreCls('Critical'), category: 'Critical', tagLabel: '建议封禁' }
    }
  }

  // 5. IPQualityScore (IPQS) (0-74 低 | 75-84 可疑 | 85-89 存在风险 | 90+ 高风险)
  if (key.includes('IPQS') || key.includes('IPQUALITYSCORE')) {
    const num = Number(str)
    if (Number.isFinite(num)) {
      if (num < 75) {
        return { text: str, cls: getScoreCls('Low'), category: 'Low', tagLabel: '低风险' }
      }
      if (num < 85) {
        return { text: str, cls: getScoreCls('Medium'), category: 'Medium', tagLabel: '可疑IP' }
      }
      if (num < 90) {
        return { text: str, cls: getScoreCls('High'), category: 'High', tagLabel: '存在风险' }
      }
      return { text: str, cls: getScoreCls('Critical'), category: 'Critical', tagLabel: '高风险' }
    }
  }

  // 6. DB-IP (0 低 | 50 中 | 100 高)
  if (key.includes('DBIP') || key.includes('DB-IP')) {
    const num = Number(str)
    if (Number.isFinite(num)) {
      if (num === 0) return { text: str, cls: getScoreCls('Low'), category: 'Low', tagLabel: '低风险' }
      if (num <= 50) return { text: str, cls: getScoreCls('Medium'), category: 'Medium', tagLabel: '中风险' }
      return { text: str, cls: getScoreCls('High'), category: 'High', tagLabel: '高风险' }
    }
    const upper = str.toUpperCase()
    if (upper.includes('HIGH') || upper.includes('CRITICAL')) {
      return { text: str, cls: getScoreCls('High'), category: 'High', tagLabel: '高风险' }
    }
    if (upper.includes('MEDIUM')) {
      return { text: str, cls: getScoreCls('Medium'), category: 'Medium', tagLabel: '中风险' }
    }
    if (upper.includes('CLEAN') || upper.includes('LOW') || upper.includes('GOOD')) {
      return { text: str, cls: getScoreCls('Low'), category: 'Low', tagLabel: '低风险' }
    }
  }

  // Generic fallback
  const genericNum = Number(str.replace('%', ''))
  if (Number.isFinite(genericNum)) {
    if (genericNum < 20) return { text: str, cls: getScoreCls('Low'), category: 'Low', tagLabel: '低风险' }
    if (genericNum < 50) return { text: str, cls: getScoreCls('Medium'), category: 'Medium', tagLabel: '中风险' }
    if (genericNum < 75) return { text: str, cls: getScoreCls('High'), category: 'High', tagLabel: '高风险' }
    return { text: str, cls: getScoreCls('Critical'), category: 'Critical', tagLabel: '极高风险' }
  }

  return { text: str, cls: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 font-medium', category: 'Low', tagLabel: str }
}
