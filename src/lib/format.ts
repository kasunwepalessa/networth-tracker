export function fmtLKR(v: number | null | undefined, opts: { sign?: boolean } = {}): string {
  const n = v ?? 0
  const abs = Math.abs(n)
  const formatted = abs.toLocaleString('en-LK', { maximumFractionDigits: 0 })
  const sign = n < 0 ? '−' : opts.sign && n > 0 ? '+' : ''
  return `${sign}Rs ${formatted}`
}

export function fmtCompact(v: number | null | undefined): string {
  const n = v ?? 0
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${sign}Rs ${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${sign}Rs ${(abs / 1_000).toFixed(1)}K`
  return `${sign}Rs ${abs.toFixed(0)}`
}

export function fmtPct(v: number | null | undefined, digits = 1): string {
  const n = v ?? 0
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const dt = new Date(d + (d.length === 10 ? 'T00:00:00' : ''))
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function monthKey(d: string | Date = new Date()): string {
  const dt = typeof d === 'string' ? new Date(d) : d
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}

export function fmtMonthShort(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short' })
}

export function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null
  const target = new Date(d + 'T00:00:00')
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - now.getTime()) / 86400000)
}

export const OWNER_LABEL: Record<string, string> = {
  personal: 'Personal',
  business: 'Business',
  both: 'Shared',
}

export const ASSET_TYPE_LABEL: Record<string, string> = {
  property: 'Property',
  vehicle: 'Vehicle',
  equipment: 'Equipment',
  electronics: 'Electronics',
  gold: 'Gold',
  business_asset: 'Business asset',
  receivable: 'Receivable (money lent)',
  other: 'Other',
}

export const LIABILITY_TYPE_LABEL: Record<string, string> = {
  personal_loan: 'Personal loan',
  vehicle_lease: 'Vehicle lease',
  mortgage: 'Mortgage',
  credit_card_balance: 'Credit card balance',
  business_loan: 'Business loan',
  supplier_payment: 'Supplier payment',
  owed_to_others: 'Money owed to others',
}

export const INVESTMENT_TYPE_LABEL: Record<string, string> = {
  shares: 'Shares',
  unit_trust: 'Unit trust',
  etf: 'ETF',
  crypto: 'Crypto',
}

export const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  bank: 'Bank account',
  cash: 'Cash',
  wallet: 'E-wallet',
  credit_card: 'Credit card',
}
