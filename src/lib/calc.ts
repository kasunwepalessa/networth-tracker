import type {
  Account, Asset, Investment, FixedDeposit, Liability, Transaction, Invoice, Owner, Category,
} from './types'
import { monthKey } from './format'

export interface ForecastEvent {
  date: string
  label: string
  amount: number
  kind: 'recurring_income' | 'recurring_expense' | 'liability_payment' | 'fd_maturity' | 'invoice_expected'
}

export interface ForecastDay {
  date: string
  balance: number
  events: ForecastEvent[]
}

export interface ForecastResult {
  days: ForecastDay[]
  startBalance: number
  endBalance: number
  minBalance: number
  minDate: string
  safeToSpend: number
  events: ForecastEvent[]
}

function stepDate(d: Date, freq: 'weekly' | 'monthly' | 'yearly'): Date {
  const next = new Date(d)
  if (freq === 'weekly') next.setDate(next.getDate() + 7)
  else if (freq === 'monthly') next.setMonth(next.getMonth() + 1)
  else next.setFullYear(next.getFullYear() + 1)
  return next
}

/** Builds a simple day-by-day cash forecast from known recurring transactions,
 *  upcoming liability payments, FD maturities, and invoices due. */
export function buildCashForecast(
  accounts: Account[],
  transactions: Transaction[],
  liabilities: Liability[],
  fixedDeposits: FixedDeposit[],
  invoices: Invoice[],
  horizonDays = 30,
): ForecastResult {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const horizonEnd = new Date(today)
  horizonEnd.setDate(horizonEnd.getDate() + horizonDays)

  const startBalance = accountsCashTotal(accounts)
  const events: ForecastEvent[] = []

  // Most-recent recurring transaction per (description, category, account, owner) as a template.
  const templates = new Map<string, Transaction>()
  transactions.filter((t) => t.is_recurring && t.recurring_frequency).forEach((t) => {
    const key = `${t.description ?? ''}|${t.category_id ?? ''}|${t.account_id ?? ''}|${t.owner}|${t.amount < 0 ? 'exp' : 'inc'}`
    const existing = templates.get(key)
    if (!existing || new Date(t.txn_date) > new Date(existing.txn_date)) templates.set(key, t)
  })
  templates.forEach((t) => {
    let d = new Date(t.txn_date)
    const freq = t.recurring_frequency!
    // roll forward to the first occurrence after today
    let guard = 0
    while (d <= today && guard < 500) { d = stepDate(d, freq); guard++ }
    while (d <= horizonEnd && guard < 1000) {
      events.push({
        date: d.toISOString().slice(0, 10),
        label: t.description || (t.amount >= 0 ? 'Recurring income' : 'Recurring expense'),
        amount: t.amount,
        kind: t.amount >= 0 ? 'recurring_income' : 'recurring_expense',
      })
      d = stepDate(d, freq)
      guard++
    }
  })

  liabilities.forEach((l) => {
    if (!l.next_due_date || !l.monthly_payment) return
    const d = new Date(l.next_due_date)
    if (d > today && d <= horizonEnd) {
      events.push({ date: l.next_due_date, label: `${l.name} payment`, amount: -Math.abs(l.monthly_payment), kind: 'liability_payment' })
    }
  })

  fixedDeposits.forEach((f) => {
    if (f.status !== 'active' || !f.maturity_date) return
    const d = new Date(f.maturity_date)
    if (d > today && d <= horizonEnd) {
      events.push({ date: f.maturity_date, label: `${f.bank} FD matures`, amount: f.amount + (f.expected_interest ?? 0), kind: 'fd_maturity' })
    }
  })

  invoices.forEach((inv) => {
    if (inv.status !== 'sent' || !inv.due_date || inv.balance <= 0) return
    const d = new Date(inv.due_date)
    if (d > today && d <= horizonEnd) {
      events.push({ date: inv.due_date, label: `Invoice ${inv.invoice_number ?? inv.id.slice(0, 8)} expected`, amount: inv.balance, kind: 'invoice_expected' })
    }
  })

  const byDate = new Map<string, ForecastEvent[]>()
  events.forEach((e) => {
    if (!byDate.has(e.date)) byDate.set(e.date, [])
    byDate.get(e.date)!.push(e)
  })

  const days: ForecastDay[] = []
  let running = startBalance
  let minBalance = startBalance
  let minDate = today.toISOString().slice(0, 10)
  for (let i = 0; i <= horizonDays; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    const iso = d.toISOString().slice(0, 10)
    const dayEvents = byDate.get(iso) ?? []
    running += dayEvents.reduce((s, e) => s + e.amount, 0)
    if (running < minBalance) { minBalance = running; minDate = iso }
    days.push({ date: iso, balance: running, events: dayEvents })
  }

  return {
    days,
    startBalance,
    endBalance: days[days.length - 1]?.balance ?? startBalance,
    minBalance,
    minDate,
    safeToSpend: Math.max(0, minBalance),
    events: events.sort((a, b) => a.date.localeCompare(b.date)),
  }
}

export function accountsCashTotal(accounts: Account[], owner?: Owner): number {
  return accounts
    .filter((a) => !a.archived && a.type !== 'credit_card' && (!owner || a.owner === owner))
    .reduce((sum, a) => sum + a.balance, 0)
}

export function investmentValue(inv: Investment): number {
  return inv.quantity * inv.current_price
}
export function investmentCost(inv: Investment): number {
  return inv.quantity * inv.purchase_price
}
export function investmentGain(inv: Investment): number {
  return investmentValue(inv) - investmentCost(inv)
}
export function investmentReturnPct(inv: Investment): number {
  const cost = investmentCost(inv)
  if (cost === 0) return 0
  return (investmentGain(inv) / cost) * 100
}

export function totalAssets(
  accounts: Account[], assets: Asset[], investments: Investment[], fds: FixedDeposit[], owner?: Owner
): number {
  const cash = accountsCashTotal(accounts, owner)
  const other = assets.filter((a) => !owner || a.owner === owner).reduce((s, a) => s + a.current_value * (a.quantity || 1), 0)
  const inv = investments.filter((i) => !owner || i.owner === owner).reduce((s, i) => s + investmentValue(i), 0)
  const fd = fds.filter((f) => f.status === 'active' && (!owner || f.owner === owner)).reduce((s, f) => s + f.amount, 0)
  return cash + other + inv + fd
}

export function totalLiabilities(accounts: Account[], liabilities: Liability[], owner?: Owner): number {
  const cardBalances = accounts
    .filter((a) => !a.archived && a.type === 'credit_card' && a.balance < 0 && (!owner || a.owner === owner))
    .reduce((s, a) => s + Math.abs(a.balance), 0)
  const other = liabilities.filter((l) => !owner || l.owner === owner).reduce((s, l) => s + l.remaining_balance, 0)
  return cardBalances + other
}

export function monthTransactions(transactions: Transaction[], month: string, owner?: Owner): Transaction[] {
  return transactions.filter((t) => monthKey(t.txn_date) === month && (!owner || t.owner === owner))
}

export type PeriodType = 'all' | 'daily' | 'monthly' | 'quarterly' | 'yearly' | 'custom'

export interface PeriodRange {
  start: string // ISO yyyy-mm-dd, inclusive
  end: string // ISO yyyy-mm-dd, inclusive
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The inclusive date range for a period type anchored on a given date. Returns null for 'all' (no filter),
 *  and for 'custom' when either bound is missing. */
export function periodRange(type: PeriodType, anchor: Date, customStart?: string, customEnd?: string): PeriodRange | null {
  if (type === 'all') return null
  if (type === 'custom') {
    if (!customStart || !customEnd) return null
    return customStart <= customEnd ? { start: customStart, end: customEnd } : { start: customEnd, end: customStart }
  }
  const y = anchor.getFullYear()
  const m = anchor.getMonth()
  if (type === 'daily') {
    const iso = toISODate(anchor)
    return { start: iso, end: iso }
  }
  if (type === 'monthly') {
    return { start: toISODate(new Date(y, m, 1)), end: toISODate(new Date(y, m + 1, 0)) }
  }
  if (type === 'quarterly') {
    const q = Math.floor(m / 3)
    return { start: toISODate(new Date(y, q * 3, 1)), end: toISODate(new Date(y, q * 3 + 3, 0)) }
  }
  // yearly
  return { start: toISODate(new Date(y, 0, 1)), end: toISODate(new Date(y, 11, 31)) }
}

/** Moves the anchor date one step forward (dir=1) or back (dir=-1) for the given period type. */
export function shiftPeriod(type: PeriodType, anchor: Date, dir: 1 | -1): Date {
  const d = new Date(anchor)
  if (type === 'daily') d.setDate(d.getDate() + dir)
  else if (type === 'monthly') d.setMonth(d.getMonth() + dir)
  else if (type === 'quarterly') d.setMonth(d.getMonth() + dir * 3)
  else if (type === 'yearly') d.setFullYear(d.getFullYear() + dir)
  return d
}

export function inRange(dateISO: string, range: PeriodRange | null): boolean {
  if (!range) return true
  return dateISO >= range.start && dateISO <= range.end
}

export function sumIncome(txns: Transaction[]): number {
  return txns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
}
export function sumExpenses(txns: Transaction[]): number {
  return Math.abs(txns.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0))
}

export function overdueInvoiceTotal(invoices: Invoice[]): number {
  return invoices.filter((i) => i.status === 'overdue').reduce((s, i) => s + i.balance, 0)
}

/** Months to pay off a liability at its current monthly payment, accounting for interest. Returns null if payment never covers interest. */
export function monthsToPayoff(remainingBalance: number, annualRatePct: number, monthlyPayment: number): number | null {
  if (remainingBalance <= 0) return 0
  if (monthlyPayment <= 0) return null
  const r = (annualRatePct || 0) / 100 / 12
  if (r === 0) return Math.ceil(remainingBalance / monthlyPayment)
  if (monthlyPayment <= remainingBalance * r) return null // payment doesn't even cover interest
  const n = -Math.log(1 - (r * remainingBalance) / monthlyPayment) / Math.log(1 + r)
  return Math.ceil(n)
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

/** Simple 0-100 financial health score from a handful of common signals. */
export function financialHealthScore(input: {
  netWorth: number
  cash: number
  monthlyExpenses: number
  overdueLiabilityCount: number
  overdueInvoiceCount: number
  savingsRatePct: number // (income-expenses)/income this month
  liabilityToAssetRatio: number // 0..1+
}): { score: number; label: string } {
  let score = 50

  // Runway: months of expenses covered by cash
  const runwayMonths = input.monthlyExpenses > 0 ? input.cash / input.monthlyExpenses : 3
  score += Math.max(-15, Math.min(20, (runwayMonths - 1) * 8))

  // Savings rate
  score += Math.max(-15, Math.min(20, input.savingsRatePct * 0.4))

  // Debt load
  score += Math.max(-25, Math.min(10, (0.4 - input.liabilityToAssetRatio) * 40))

  // Net worth trending positive
  score += input.netWorth > 0 ? 5 : -10

  // Overdue penalties
  score -= input.overdueLiabilityCount * 4
  score -= input.overdueInvoiceCount * 2

  score = Math.max(0, Math.min(100, Math.round(score)))
  const label = score >= 80 ? 'Excellent' : score >= 65 ? 'Good' : score >= 45 ? 'Fair' : score >= 25 ? 'Needs attention' : 'At risk'
  return { score, label }
}

export interface MonthlyFlow {
  month: string
  income: number
  expenses: number
}

/** Income vs. expense totals for each of the last `months` calendar months, oldest first. */
export function monthlyFlowSeries(transactions: Transaction[], months: number, owner?: Owner): MonthlyFlow[] {
  const out: MonthlyFlow[] = []
  const now = new Date()
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = monthKey(d)
    const txns = monthTransactions(transactions, key, owner)
    out.push({ month: key, income: sumIncome(txns), expenses: sumExpenses(txns) })
  }
  return out
}

export interface CategorySlice {
  name: string
  amount: number
}

/** Expense total per category for one month, sorted descending, folded to "Other" past `topN`. */
export function expenseByCategory(
  transactions: Transaction[], categories: Category[], month: string, owner?: Owner, topN = 6,
): CategorySlice[] {
  const txns = monthTransactions(transactions, month, owner).filter((t) => t.amount < 0)
  const byCat = new Map<string, number>()
  txns.forEach((t) => {
    const cat = categories.find((c) => c.id === t.category_id)
    const name = cat?.name ?? 'Uncategorized'
    byCat.set(name, (byCat.get(name) ?? 0) + Math.abs(t.amount))
  })
  const sorted = Array.from(byCat.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
  if (sorted.length <= topN) return sorted
  const head = sorted.slice(0, topN)
  const rest = sorted.slice(topN).reduce((s, c) => s + c.amount, 0)
  return rest > 0 ? [...head, { name: 'Other', amount: rest }] : head
}
