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

export function evaluateProviderScore(providerKey: string, val: unknown): {
  text: string
  cls: string
  category: RiskCategory
  tagLabel: string
} {
  if (val === null || val === 'null') {
    return {
      text: 'null',
      cls: 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500 font-mono',
      category: 'Unknown',
      tagLabel: '未配置 / 无数据',
    }
  }

  if (val === undefined || val === '') {
    return {
      text: '--',
      cls: 'text-neutral-300 dark:text-neutral-600',
      category: 'Unknown',
      tagLabel: '--',
    }
  }

  const str = String(val).trim()
  const key = providerKey.toUpperCase()

  // 1. Scamalytics (0: 优秀, 1~24: 良好, 25~49: 中危, 50~74: 高危, 75~100: 极高危)
  if (key.includes('SCAMALYTICS')) {
    const num = Number(str.replace('%', ''))
    if (Number.isFinite(num)) {
      if (num === 0) {
        return { text: `${num} (优秀)`, cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-medium', category: 'Low', tagLabel: '优秀' }
      }
      if (num < 25) {
        return { text: `${num} (良好)`, cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-medium', category: 'Low', tagLabel: '良好' }
      }
      if (num < 50) {
        return { text: `${num} (中危)`, cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 font-medium', category: 'Medium', tagLabel: '中危' }
      }
      if (num < 75) {
        return { text: `${num} (高危)`, cls: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300 font-medium', category: 'High', tagLabel: '高危' }
      }
      return { text: `${num} (极高危)`, cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 font-bold', category: 'Critical', tagLabel: '极高危' }
    }
  }

  // 2. AbuseIPDB (0%: 优秀, 1%~19%: 良好, 20%~49%: 中危, 50%+: 高危)
  if (key.includes('ABUSEIPDB')) {
    const num = Number(str.replace('%', ''))
    if (Number.isFinite(num)) {
      if (num === 0) {
        return { text: `0% (优秀)`, cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-medium', category: 'Low', tagLabel: '优秀' }
      }
      if (num < 20) {
        return { text: `${num}% (良好)`, cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-medium', category: 'Low', tagLabel: '良好' }
      }
      if (num < 50) {
        return { text: `${num}% (中危)`, cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 font-medium', category: 'Medium', tagLabel: '中危' }
      }
      return { text: `${num}% (高危)`, cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 font-bold', category: 'High', tagLabel: '高危' }
    }
  }

  // 3. ipapi (0%~5%: 优秀, 5%~20%: 良好, 20%~50%: 中危, 50%+: 高危)
  if (key.includes('IPAPI')) {
    const num = Number(str.replace('%', ''))
    const displayStr = str.includes('%') ? str : `${str}%`
    if (Number.isFinite(num)) {
      if (num <= 5) {
        return { text: `${displayStr} (优秀)`, cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-medium', category: 'Low', tagLabel: '优秀' }
      }
      if (num <= 20) {
        return { text: `${displayStr} (良好)`, cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-medium', category: 'Low', tagLabel: '良好' }
      }
      if (num <= 50) {
        return { text: `${displayStr} (中危)`, cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 font-medium', category: 'Medium', tagLabel: '中危' }
      }
      return { text: `${displayStr} (高危)`, cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 font-bold', category: 'High', tagLabel: '高危' }
    }
  }

  // 4. IP2Location (0~25 或 Low: 优秀, 26~50 或 Medium: 中危, 51~75 或 High: 高危, 76+ 或 Very High: 极高危)
  if (key.includes('IP2LOCATION')) {
    const num = Number(str)
    if (Number.isFinite(num)) {
      if (num <= 25) {
        return { text: `${num} (优秀)`, cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-medium', category: 'Low', tagLabel: '优秀' }
      }
      if (num <= 50) {
        return { text: `${num} (中危)`, cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 font-medium', category: 'Medium', tagLabel: '中危' }
      }
      if (num <= 75) {
        return { text: `${num} (高危)`, cls: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300 font-medium', category: 'High', tagLabel: '高危' }
      }
      return { text: `${num} (极高危)`, cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 font-bold', category: 'Critical', tagLabel: '极高危' }
    }
    const upper = str.toUpperCase()
    if (upper.includes('VERY HIGH') || upper.includes('CRITICAL')) {
      return { text: `${str} (极高危)`, cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 font-bold', category: 'Critical', tagLabel: '极高危' }
    }
    if (upper.includes('HIGH')) {
      return { text: `${str} (高危)`, cls: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300 font-medium', category: 'High', tagLabel: '高危' }
    }
    if (upper.includes('MEDIUM')) {
      return { text: `${str} (中危)`, cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 font-medium', category: 'Medium', tagLabel: '中危' }
    }
    if (upper.includes('LOW') || upper.includes('CLEAN') || upper.includes('GOOD')) {
      return { text: `${str} (优秀)`, cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-medium', category: 'Low', tagLabel: '优秀' }
    }
  }

  // 5. IPQualityScore (IPQS) (0: 优秀, 1~49: 良好, 50~74: 可疑, 75~84: 高危, 85~100: 极高危)
  if (key.includes('IPQS') || key.includes('IPQUALITYSCORE')) {
    const num = Number(str)
    if (Number.isFinite(num)) {
      if (num === 0) {
        return { text: `0 (优秀)`, cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-medium', category: 'Low', tagLabel: '优秀' }
      }
      if (num < 50) {
        return { text: `${num} (良好)`, cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-medium', category: 'Low', tagLabel: '良好' }
      }
      if (num < 75) {
        return { text: `${num} (可疑)`, cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 font-medium', category: 'Medium', tagLabel: '可疑' }
      }
      if (num < 85) {
        return { text: `${num} (高危)`, cls: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300 font-medium', category: 'High', tagLabel: '高危' }
      }
      return { text: `${num} (极高危)`, cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 font-bold', category: 'Critical', tagLabel: '极高危' }
    }
  }

  // 6. DB-IP (Clean/Low: 优秀, Medium: 中危, High: 高危)
  if (key.includes('DBIP') || key.includes('DB-IP')) {
    const num = Number(str)
    if (Number.isFinite(num)) {
      if (num <= 25) return { text: `${num} (优秀)`, cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-medium', category: 'Low', tagLabel: '优秀' }
      if (num <= 50) return { text: `${num} (中危)`, cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 font-medium', category: 'Medium', tagLabel: '中危' }
      return { text: `${num} (高危)`, cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 font-bold', category: 'High', tagLabel: '高危' }
    }
    const upper = str.toUpperCase()
    if (upper.includes('HIGH') || upper.includes('CRITICAL')) {
      return { text: `${str} (高危)`, cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 font-bold', category: 'High', tagLabel: '高危' }
    }
    if (upper.includes('MEDIUM')) {
      return { text: `${str} (中危)`, cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 font-medium', category: 'Medium', tagLabel: '中危' }
    }
    if (upper.includes('CLEAN') || upper.includes('LOW') || upper.includes('GOOD')) {
      return { text: `${str} (优秀)`, cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-medium', category: 'Low', tagLabel: '优秀' }
    }
  }

  // Generic string matching
  const upper = str.toUpperCase()
  if (upper.includes('VERY HIGH') || upper.includes('CRITICAL')) {
    return { text: `${str} (极高危)`, cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 font-bold', category: 'Critical', tagLabel: '极高危' }
  }
  if (upper.includes('HIGH')) {
    return { text: `${str} (高危)`, cls: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300 font-medium', category: 'High', tagLabel: '高危' }
  }
  if (upper.includes('MEDIUM')) {
    return { text: `${str} (中危)`, cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 font-medium', category: 'Medium', tagLabel: '中危' }
  }
  if (upper.includes('LOW') || upper.includes('CLEAN') || upper.includes('GOOD')) {
    return { text: `${str} (优秀)`, cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-medium', category: 'Low', tagLabel: '优秀' }
  }

  const genericNum = Number(str.replace('%', ''))
  if (Number.isFinite(genericNum) && genericNum === 0) {
    return { text: `${str} (优秀)`, cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-medium', category: 'Low', tagLabel: '优秀' }
  }

  return { text: str, cls: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 font-medium', category: 'Low', tagLabel: str }
}
