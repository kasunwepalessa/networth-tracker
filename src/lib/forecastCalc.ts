import type {
  Account, Transaction, Liability, FixedDeposit, Invoice, Investment, Asset, Goal, GoalContribution, Subscription, InvestmentType,
} from './types'
import {
  accountsCashTotal, totalAssets, totalLiabilities, monthlyFlowSeries,
  financialHealthScore, advanceRenewal, addMonths, monthsToPayoff as monthsToPayoffCalc, investmentValue,
} from './calc'
import { goalStatusInfo, requiredContribution as goalRequiredContribution, contributionPace as goalContributionPace } from './goalCalc'
import { monthKey, fmtDate } from './format'

// ---------------------------------------------------------------------------
// Period handling
// ---------------------------------------------------------------------------

export type ForecastPeriod = '1m' | '3m' | '6m' | '1y' | '5y' | 'custom'

export const PERIOD_MONTHS: Record<Exclude<ForecastPeriod, 'custom'>, number> = { '1m': 1, '3m': 3, '6m': 6, '1y': 12, '5y': 60 }
export const PERIOD_LABEL: Record<ForecastPeriod, string> = { '1m': '1 month', '3m': '3 months', '6m': '6 months', '1y': '1 year', '5y': '5 years', custom: 'Custom' }

export function periodMonths(period: ForecastPeriod, customMonths = 24): number {
  return period === 'custom' ? Math.max(1, Math.min(120, Math.round(customMonths))) : PERIOD_MONTHS[period]
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function todayMidnight(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

// ---------------------------------------------------------------------------
// Investment forecast — return assumptions are a documented, editable-in-future
// guess per asset type, not a guarantee. Values shown as low/expected/high.
// ---------------------------------------------------------------------------

export const INVESTMENT_RETURN_ASSUMPTIONS: Record<InvestmentType, { low: number; expected: number; high: number }> = {
  shares: { low: -0.10, expected: 0.09, high: 0.22 },
  unit_trust: { low: -0.04, expected: 0.07, high: 0.14 },
  etf: { low: -0.08, expected: 0.08, high: 0.18 },
  crypto: { low: -0.40, expected: 0.15, high: 0.70 },
}

export interface InvestmentForecastRow {
  investment: Investment
  currentValue: number
  lowValue: number
  expectedValue: number
  highValue: number
}

export function buildInvestmentForecast(investments: Investment[], horizonMonths: number): InvestmentForecastRow[] {
  const years = horizonMonths / 12
  return investments.map((inv) => {
    const cv = investmentValue(inv)
    const a = INVESTMENT_RETURN_ASSUMPTIONS[inv.type]
    return {
      investment: inv,
      currentValue: cv,
      lowValue: Math.round(cv * Math.pow(1 + a.low, years)),
      expectedValue: Math.round(cv * Math.pow(1 + a.expected, years)),
      highValue: Math.round(cv * Math.pow(1 + a.high, years)),
    }
  })
}

export function blendedExpectedAnnualReturn(investments: Investment[]): number | null {
  const total = investments.reduce((s, i) => s + investmentValue(i), 0)
  if (total <= 0) return null
  return investments.reduce((s, i) => s + investmentValue(i) * INVESTMENT_RETURN_ASSUMPTIONS[i.type].expected, 0) / total
}

// ---------------------------------------------------------------------------
// Debt forecast
// ---------------------------------------------------------------------------

/** Remaining balance after `months` of payments at a fixed monthly payment and annual rate. */
export function amortizedBalance(principal: number, annualRatePct: number, monthlyPayment: number, months: number): number {
  if (principal <= 0) return 0
  const r = (annualRatePct || 0) / 100 / 12
  let bal = principal
  for (let i = 0; i < months && bal > 0; i++) {
    bal = bal + bal * r - monthlyPayment
  }
  return Math.max(0, Math.round(bal))
}

/** Total interest paid over `months` of payments (or until payoff if sooner). */
function totalInterestOverMonths(principal: number, annualRatePct: number, monthlyPayment: number, months: number): number {
  const r = (annualRatePct || 0) / 100 / 12
  let bal = principal
  let interest = 0
  for (let i = 0; i < months && bal > 0; i++) {
    const monthInterest = bal * r
    interest += monthInterest
    bal = bal + monthInterest - monthlyPayment
  }
  return Math.max(0, Math.round(interest))
}

export interface DebtForecastRow {
  liability: Liability
  monthsToPayoff: number | null
  payoffDate: string | null
  balanceAtHorizon: number
  totalRemainingInterest: number
  extraPayment: number
  extraPaymentMonthsToPayoff: number | null
  extraPaymentInterestSaved: number
}

/** Per-liability payoff projection, ordered highest-interest-rate first (avalanche order —
 *  the mathematically optimal payoff priority when extra money is available). */
export function buildDebtForecast(liabilities: Liability[], horizonMonths: number): DebtForecastRow[] {
  return liabilities
    .map((l) => {
      const rate = l.interest_rate ?? 0
      const payment = l.monthly_payment ?? 0
      const monthsLeft = monthsToPayoffCalc(l.remaining_balance, rate, payment)
      const payoffDate = monthsLeft !== null ? isoDate(addMonths(new Date(), monthsLeft)) : null
      const balanceAtHorizon = payment > 0 ? amortizedBalance(l.remaining_balance, rate, payment, horizonMonths) : l.remaining_balance
      const horizonForInterest = monthsLeft ?? horizonMonths
      const totalRemainingInterest = payment > 0 ? totalInterestOverMonths(l.remaining_balance, rate, payment, horizonForInterest) : 0

      const extraPayment = payment > 0 ? Math.max(1000, Math.round(payment * 0.2 / 500) * 500) : 0
      let extraPaymentMonthsToPayoff: number | null = null
      let extraPaymentInterestSaved = 0
      if (extraPayment > 0) {
        extraPaymentMonthsToPayoff = monthsToPayoffCalc(l.remaining_balance, rate, payment + extraPayment)
        if (extraPaymentMonthsToPayoff !== null) {
          const newInterest = totalInterestOverMonths(l.remaining_balance, rate, payment + extraPayment, extraPaymentMonthsToPayoff)
          extraPaymentInterestSaved = Math.max(0, totalRemainingInterest - newInterest)
        }
      }

      return { liability: l, monthsToPayoff: monthsLeft, payoffDate, balanceAtHorizon, totalRemainingInterest, extraPayment, extraPaymentMonthsToPayoff, extraPaymentInterestSaved }
    })
    .sort((a, b) => (b.liability.interest_rate ?? 0) - (a.liability.interest_rate ?? 0))
}

// ---------------------------------------------------------------------------
// Goal forecast — thin wrapper around goalCalc, scoped to the forecast horizon
// ---------------------------------------------------------------------------

export interface GoalForecastRow {
  goal: Goal
  onTrack: boolean
  statusLabel: string
  requiredMonthly: number | null
  recentPace: number
  completesWithinHorizon: boolean
  projectedGapAtDeadline: number | null // negative = shortfall, positive/0 = surplus, null = no deadline
}

export function buildGoalForecast(goals: Goal[], contributions: GoalContribution[], horizonMonths: number): GoalForecastRow[] {
  const horizonEnd = addMonths(new Date(), horizonMonths)
  return goals.map((g) => {
    const info = goalStatusInfo(g)
    const gContribs = contributions.filter((c) => c.goal_id === g.id)
    const required = goalRequiredContribution(g)
    const pace = goalContributionPace(gContribs, 3)
    const completesWithinHorizon = !!g.target_date && new Date(g.target_date + 'T00:00:00') <= horizonEnd
    let projectedGapAtDeadline: number | null = null
    if (required.monthly !== null && g.target_date) {
      const monthsLeft = Math.max(0, Math.round((new Date(g.target_date + 'T00:00:00').getTime() - Date.now()) / 2629800000))
      const projectedSaved = g.current_amount + pace * monthsLeft
      projectedGapAtDeadline = Math.round(projectedSaved - g.target_amount)
    }
    return {
      goal: g,
      onTrack: info.status === 'on_track' || info.status === 'completed',
      statusLabel: info.label,
      requiredMonthly: required.monthly,
      recentPace: pace,
      completesWithinHorizon,
      projectedGapAtDeadline,
    }
  })
}

// ---------------------------------------------------------------------------
// Long-range cash-flow simulation — the engine behind the cash-flow forecast,
// the calendar/risk alerts, and the overview's predicted bank balance.
// ---------------------------------------------------------------------------

export type ForecastEventKind = 'income' | 'recurring_bill' | 'variable_expense' | 'debt_payment' | 'goal_contribution' | 'fd_maturity' | 'invoice_expected' | 'subscription'

export interface ForecastCalEvent {
  date: string
  label: string
  amount: number
  kind: ForecastEventKind
}

export interface ForecastDay {
  date: string
  balance: number
  events: ForecastCalEvent[]
}

export interface ForecastMonthRow {
  month: string
  opening: number
  income: number
  recurringBills: number
  variableExpenses: number
  debtPayments: number
  goalContributions: number
  closing: number
  freeCashAfterCommitments: number
}

export interface LongRangeForecastResult {
  days: ForecastDay[] // full daily resolution, capped to the first 180 days for a usable calendar
  monthly: ForecastMonthRow[] // one row per calendar month across the whole horizon
  events: ForecastCalEvent[]
  startBalance: number
  endBalance: number
  minBalance: number
  minDate: string
  lowBalanceThreshold: number
  lowBalanceDate: string | null
  negativeBalanceDate: string | null
  avgMonthlyIncome: number
  avgMonthlyVariableExpense: number
}

const CALENDAR_DAYS_CAP = 180

export function buildLongRangeForecast(input: {
  accounts: Account[]
  transactions: Transaction[]
  liabilities: Liability[]
  fixedDeposits: FixedDeposit[]
  invoices: Invoice[]
  subscriptions: Subscription[]
  goals: Goal[]
  goalContributions: GoalContribution[]
  horizonMonths: number
}): LongRangeForecastResult {
  const { accounts, transactions, liabilities, fixedDeposits, invoices, subscriptions, goals, horizonMonths } = input
  const today = todayMidnight()
  const horizonDays = Math.round(horizonMonths * 30.44)
  const horizonEnd = new Date(today)
  horizonEnd.setDate(horizonEnd.getDate() + horizonDays)

  const startBalance = accountsCashTotal(accounts)
  const events: ForecastCalEvent[] = []

  // Recurring transaction templates (most-recent instance per description/category/account/owner/direction)
  const templates = new Map<string, Transaction>()
  transactions.filter((t) => t.is_recurring && t.recurring_frequency).forEach((t) => {
    const key = `${t.description ?? ''}|${t.category_id ?? ''}|${t.account_id ?? ''}|${t.owner}|${t.amount < 0 ? 'exp' : 'inc'}`
    const existing = templates.get(key)
    if (!existing || new Date(t.txn_date) > new Date(existing.txn_date)) templates.set(key, t)
  })
  const recurringDescriptions = new Set(Array.from(templates.values()).map((t) => (t.description ?? '').trim().toLowerCase()))
  templates.forEach((t) => {
    const freq = t.recurring_frequency!
    let d = new Date(t.txn_date)
    let guard = 0
    while (d <= today && guard < 1000) { d = stepDate(d, freq); guard++ }
    while (d <= horizonEnd && guard < 3000) {
      events.push({
        date: isoDate(d),
        label: t.description || (t.amount >= 0 ? 'Recurring income' : 'Recurring expense'),
        amount: t.amount,
        kind: t.amount >= 0 ? 'income' : 'recurring_bill',
      })
      d = stepDate(d, freq)
      guard++
    }
  })

  // Debt payments — repeat monthly from next_due_date until payoff or horizon end
  liabilities.forEach((l) => {
    if (!l.next_due_date || !l.monthly_payment) return
    const rate = l.interest_rate ?? 0
    let bal = l.remaining_balance
    let d = new Date(l.next_due_date + 'T00:00:00')
    let guard = 0
    while (d <= horizonEnd && bal > 0 && guard < 600) {
      if (d > today) {
        events.push({ date: isoDate(d), label: `${l.name} payment`, amount: -Math.abs(l.monthly_payment), kind: 'debt_payment' })
      }
      bal = bal + bal * (rate / 100 / 12) - l.monthly_payment
      d = addMonths(d, 1)
      guard++
    }
  })

  // FD maturities
  fixedDeposits.forEach((f) => {
    if (f.status !== 'active' || !f.maturity_date) return
    const d = new Date(f.maturity_date + 'T00:00:00')
    if (d > today && d <= horizonEnd) {
      events.push({ date: f.maturity_date, label: `${f.bank} FD matures`, amount: f.amount + (f.expected_interest ?? 0), kind: 'fd_maturity' })
    }
  })

  // Invoices expected (sent, not yet paid)
  invoices.forEach((inv) => {
    if (inv.status !== 'sent' || !inv.due_date || inv.balance <= 0) return
    const d = new Date(inv.due_date + 'T00:00:00')
    if (d > today && d <= horizonEnd) {
      events.push({ date: inv.due_date, label: `Invoice ${inv.invoice_number ?? inv.id.slice(0, 8)} expected`, amount: inv.balance, kind: 'invoice_expected' })
    }
  })

  // Subscriptions with no matching recurring-transaction history yet (avoids double counting
  // subscriptions that are already being logged as recurring transactions)
  subscriptions.filter((s) => s.status === 'active' && !recurringDescriptions.has(s.name.trim().toLowerCase())).forEach((s) => {
    let d = new Date(s.next_renewal_date + 'T00:00:00')
    let guard = 0
    while (d <= horizonEnd && guard < 600) {
      if (d > today) events.push({ date: isoDate(d), label: `${s.name} subscription`, amount: -s.amount, kind: 'subscription' })
      d = new Date(advanceRenewal(isoDate(d), s.billing_cycle) + 'T00:00:00')
      guard++
    }
  })

  // Estimated variable (non-recurring) spending, spread as one monthly lump on the 15th —
  // the single biggest lever on forecast accuracy, since recurring items alone understate
  // real spending.
  const avgVariableMonthly = estimateAvgVariableMonthly(transactions)
  for (let m = 0; m <= horizonMonths; m++) {
    const d = addMonths(new Date(today.getFullYear(), today.getMonth(), 15), m)
    if (d > today && d <= horizonEnd && avgVariableMonthly > 0) {
      events.push({ date: isoDate(d), label: 'Estimated variable spending', amount: -Math.round(avgVariableMonthly), kind: 'variable_expense' })
    }
  }

  // Goal contributions — required monthly amount, once per month on the 1st, until the goal's
  // deadline (or the horizon end if no deadline / deadline beyond horizon)
  goals.forEach((g) => {
    const info = goalStatusInfo(g)
    if (info.status === 'completed') return
    const required = goalRequiredContribution(g)
    if (!required.monthly || required.monthly <= 0) return
    const stopAt = g.target_date ? new Date(Math.min(new Date(g.target_date + 'T00:00:00').getTime(), horizonEnd.getTime())) : horizonEnd
    let d = addMonths(new Date(today.getFullYear(), today.getMonth(), 1), 1)
    let guard = 0
    while (d <= stopAt && guard < 600) {
      events.push({ date: isoDate(d), label: `${g.name} contribution`, amount: -Math.round(required.monthly), kind: 'goal_contribution' })
      d = addMonths(d, 1)
      guard++
    }
  })

  events.sort((a, b) => a.date.localeCompare(b.date))

  // Day-by-day simulation
  const byDate = new Map<string, ForecastCalEvent[]>()
  events.forEach((e) => {
    if (!byDate.has(e.date)) byDate.set(e.date, [])
    byDate.get(e.date)!.push(e)
  })

  const days: ForecastDay[] = []
  const monthlyMap = new Map<string, ForecastMonthRow>()
  let running = startBalance
  let minBalance = startBalance
  let minDate = isoDate(today)
  let lowBalanceDate: string | null = null
  let negativeBalanceDate: string | null = null
  const avgMonthlyIncome = monthlyFlowSeries(transactions, 3).reduce((s, f) => s + f.income, 0) / 3
  const lowBalanceThreshold = Math.max(5000, Math.round(avgMonthlyIncome * 0.15))

  for (let i = 0; i <= horizonDays; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    const iso = isoDate(d)
    const dayEvents = byDate.get(iso) ?? []
    running += dayEvents.reduce((s, e) => s + e.amount, 0)

    if (running < minBalance) { minBalance = running; minDate = iso }
    if (lowBalanceDate === null && running < lowBalanceThreshold) lowBalanceDate = iso
    if (negativeBalanceDate === null && running < 0) negativeBalanceDate = iso

    if (i <= CALENDAR_DAYS_CAP) days.push({ date: iso, balance: Math.round(running), events: dayEvents })

    const mKey = monthKey(d)
    if (!monthlyMap.has(mKey)) {
      monthlyMap.set(mKey, { month: mKey, opening: Math.round(running - dayEvents.reduce((s, e) => s + e.amount, 0)), income: 0, recurringBills: 0, variableExpenses: 0, debtPayments: 0, goalContributions: 0, closing: 0, freeCashAfterCommitments: 0 })
    }
    const row = monthlyMap.get(mKey)!
    dayEvents.forEach((e) => {
      if (e.kind === 'income') row.income += e.amount
      else if (e.kind === 'recurring_bill' || e.kind === 'subscription') row.recurringBills += Math.abs(e.amount)
      else if (e.kind === 'variable_expense') row.variableExpenses += Math.abs(e.amount)
      else if (e.kind === 'debt_payment') row.debtPayments += Math.abs(e.amount)
      else if (e.kind === 'goal_contribution') row.goalContributions += Math.abs(e.amount)
      else if (e.kind === 'fd_maturity' || e.kind === 'invoice_expected') row.income += e.amount
    })
    row.closing = Math.round(running)
  }

  const monthly = Array.from(monthlyMap.values()).map((r) => ({
    ...r,
    income: Math.round(r.income),
    recurringBills: Math.round(r.recurringBills),
    variableExpenses: Math.round(r.variableExpenses),
    debtPayments: Math.round(r.debtPayments),
    goalContributions: Math.round(r.goalContributions),
    freeCashAfterCommitments: Math.round(r.income - r.recurringBills - r.debtPayments - r.goalContributions),
  }))

  return {
    days,
    monthly,
    events,
    startBalance,
    endBalance: Math.round(running),
    minBalance: Math.round(minBalance),
    minDate,
    lowBalanceThreshold,
    lowBalanceDate,
    negativeBalanceDate,
    avgMonthlyIncome: Math.round(avgMonthlyIncome),
    avgMonthlyVariableExpense: Math.round(avgVariableMonthly),
  }
}

function stepDate(d: Date, freq: 'weekly' | 'monthly' | 'yearly'): Date {
  const next = new Date(d)
  if (freq === 'weekly') next.setDate(next.getDate() + 7)
  else if (freq === 'monthly') next.setMonth(next.getMonth() + 1)
  else next.setFullYear(next.getFullYear() + 1)
  return next
}

/** Average monthly spend from transactions that are NOT flagged recurring, over the trailing
 *  3 months — the "everyday variable spending" a forecast needs on top of known bills. */
function estimateAvgVariableMonthly(transactions: Transaction[]): number {
  const now = new Date()
  let total = 0
  for (let i = 0; i < 3; i++) {
    const key = monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1))
    const monthTxns = transactions.filter((t) => monthKey(t.txn_date) === key && !t.is_recurring && t.amount < 0)
    total += monthTxns.reduce((s, t) => s + Math.abs(t.amount), 0)
  }
  return total / 3
}

// ---------------------------------------------------------------------------
// Net-worth projection
// ---------------------------------------------------------------------------

export interface NetWorthProjectionPoint {
  month: string
  assets: number
  liabilities: number
  netWorth: number
}

export function buildNetWorthProjection(input: {
  accounts: Account[]
  assets: Asset[]
  investments: Investment[]
  fixedDeposits: FixedDeposit[]
  liabilities: Liability[]
  cashFlow: LongRangeForecastResult
  horizonMonths: number
}): NetWorthProjectionPoint[] {
  const { accounts, assets, investments, fixedDeposits, liabilities, cashFlow, horizonMonths } = input
  const otherAssetsToday = assets.reduce((s, a) => s + a.current_value * (a.quantity || 1), 0)
  const fdToday = fixedDeposits.filter((f) => f.status === 'active').reduce((s, f) => s + f.amount, 0)
  const investToday = investments.reduce((s, i) => s + investmentValue(i), 0)
  const blendedReturn = blendedExpectedAnnualReturn(investments) ?? 0.08

  const cardBalancesToday = accounts
    .filter((a) => !a.archived && a.type === 'credit_card' && a.balance < 0)
    .reduce((s, a) => s + Math.abs(a.balance), 0)

  const cashByMonth = new Map(cashFlow.monthly.map((r) => [r.month, r.closing]))
  const points: NetWorthProjectionPoint[] = []
  const start = new Date()
  for (let m = 0; m <= horizonMonths; m++) {
    const d = new Date(start.getFullYear(), start.getMonth() + m, 1)
    const key = monthKey(d)
    const cashAtMonth = cashByMonth.get(key) ?? accountsCashTotal(accounts)
    const investAtMonth = investToday * Math.pow(1 + blendedReturn, m / 12)
    const liabAtMonth = liabilities.reduce((s, l) => s + (l.monthly_payment ? amortizedBalance(l.remaining_balance, l.interest_rate ?? 0, l.monthly_payment, m) : l.remaining_balance), 0)
      + cardBalancesToday
    const assetsAtMonth = cashAtMonth + otherAssetsToday + fdToday + investAtMonth
    points.push({ month: key, assets: Math.round(assetsAtMonth), liabilities: Math.round(liabAtMonth), netWorth: Math.round(assetsAtMonth - liabAtMonth) })
  }
  return points
}

// ---------------------------------------------------------------------------
// Overview — the headline numbers + narrative
// ---------------------------------------------------------------------------

export interface ForecastOverview {
  horizonMonths: number
  endDate: string
  predictedBankBalance: number
  predictedNetWorth: number
  netWorthToday: number
  netWorthChange: number
  expectedIncome: number
  expectedExpenses: number
  expectedSavings: number
  expectedInvestmentValue: number
  expectedDebtBalance: number
  monthlyCashSurplus: number
  savingsRatePct: number
  healthScore: number
  healthLabel: string
  confidencePct: number
  confidenceLabel: string
  narrative: string
}

function confidenceFor(transactions: Transaction[], horizonMonths: number): { pct: number; label: string } {
  const monthsWithData = new Set(transactions.map((t) => monthKey(t.txn_date))).size
  let score = 40 + Math.min(12, monthsWithData) * 4
  if (horizonMonths > 12) score -= (horizonMonths - 12) * 1.2
  score = Math.max(15, Math.min(95, Math.round(score)))
  const label = score >= 75 ? 'High confidence' : score >= 50 ? 'Medium confidence' : 'Low confidence'
  return { pct: score, label }
}

export function buildForecastOverview(input: {
  accounts: Account[]
  assets: Asset[]
  investments: Investment[]
  fixedDeposits: FixedDeposit[]
  liabilities: Liability[]
  transactions: Transaction[]
  invoices: Invoice[]
  horizonMonths: number
  cashFlow: LongRangeForecastResult
  netWorthProjection: NetWorthProjectionPoint[]
}): ForecastOverview {
  const { accounts, assets, investments, fixedDeposits, liabilities, transactions, invoices, horizonMonths, cashFlow, netWorthProjection } = input

  const netWorthToday = totalAssets(accounts, assets, investments, fixedDeposits) - totalLiabilities(accounts, liabilities)
  const lastPoint = netWorthProjection[netWorthProjection.length - 1]
  const predictedNetWorth = lastPoint?.netWorth ?? netWorthToday
  const predictedBankBalance = cashFlow.endBalance

  const monthlyRows = cashFlow.monthly
  const expectedIncome = Math.round(monthlyRows.reduce((s, r) => s + r.income, 0))
  const expectedExpenses = Math.round(monthlyRows.reduce((s, r) => s + r.recurringBills + r.variableExpenses + r.debtPayments + r.goalContributions, 0))
  const expectedSavings = expectedIncome - expectedExpenses
  const monthlyCashSurplus = horizonMonths > 0 ? Math.round(expectedSavings / horizonMonths) : 0
  const savingsRatePct = expectedIncome > 0 ? (expectedSavings / expectedIncome) * 100 : 0

  const investToday = investments.reduce((s, i) => s + investmentValue(i), 0)
  const blendedReturn = blendedExpectedAnnualReturn(investments) ?? 0.08
  const expectedInvestmentValue = Math.round(investToday * Math.pow(1 + blendedReturn, horizonMonths / 12))
  const expectedDebtBalance = lastPoint?.liabilities ?? totalLiabilities(accounts, liabilities)

  const health = financialHealthScore({
    netWorth: predictedNetWorth,
    cash: predictedBankBalance,
    monthlyExpenses: (expectedExpenses / Math.max(1, horizonMonths)) || 1,
    overdueLiabilityCount: liabilities.filter((l) => l.next_due_date && new Date(l.next_due_date) < new Date()).length,
    overdueInvoiceCount: invoices.filter((i) => i.status === 'overdue').length,
    savingsRatePct,
    liabilityToAssetRatio: predictedNetWorth + expectedDebtBalance > 0 ? expectedDebtBalance / (predictedNetWorth + expectedDebtBalance) : 0,
  })

  const confidence = confidenceFor(transactions, horizonMonths)

  const netWorthChange = predictedNetWorth - netWorthToday
  const end = addMonths(new Date(), horizonMonths)
  const endDate = isoDate(end)
  const periodLabel = horizonMonths === 12 ? '12 months' : horizonMonths === 1 ? '1 month' : horizonMonths % 12 === 0 ? `${horizonMonths / 12} year${horizonMonths / 12 === 1 ? '' : 's'}` : `${horizonMonths} months`

  let narrative = `In ${periodLabel}, your net worth is forecast to reach ${fmtNarrative(predictedNetWorth)}—${netWorthChange >= 0 ? 'an increase' : 'a decrease'} of ${fmtNarrative(Math.abs(netWorthChange))}.`
  if (cashFlow.negativeBalanceDate) {
    narrative += ` Your cash balance is projected to go negative around ${fmtDate(cashFlow.negativeBalanceDate)}.`
  } else if (cashFlow.lowBalanceDate) {
    narrative += ` However, your cash balance may fall below ${fmtNarrative(cashFlow.lowBalanceThreshold)} around ${fmtDate(cashFlow.lowBalanceDate)}.`
  }

  return {
    horizonMonths, endDate, predictedBankBalance, predictedNetWorth, netWorthToday, netWorthChange,
    expectedIncome, expectedExpenses, expectedSavings, expectedInvestmentValue, expectedDebtBalance,
    monthlyCashSurplus, savingsRatePct, healthScore: health.score, healthLabel: health.label,
    confidencePct: confidence.pct, confidenceLabel: confidence.label, narrative,
  }
}

function fmtNarrative(v: number): string {
  return `Rs ${Math.round(v).toLocaleString('en-LK')}`
}

// ---------------------------------------------------------------------------
// AI insights
// ---------------------------------------------------------------------------

export interface ForecastInsight {
  kind: 'positive' | 'watch' | 'risk' | 'action'
  text: string
  confidence: 'high' | 'medium' | 'low'
}

export function generateForecastInsights(input: {
  overview: ForecastOverview
  cashFlow: LongRangeForecastResult
  debtForecast: DebtForecastRow[]
  goalForecast: GoalForecastRow[]
}): ForecastInsight[] {
  const { overview, cashFlow, debtForecast, goalForecast } = input
  const out: ForecastInsight[] = []

  if (cashFlow.negativeBalanceDate) {
    out.push({ kind: 'risk', text: `Your account is projected to go negative around ${fmtDate(cashFlow.negativeBalanceDate)} at the current pace — build a buffer or trim spending before then.`, confidence: 'medium' })
  } else if (cashFlow.lowBalanceDate) {
    out.push({ kind: 'watch', text: `Your account may fall below Rs ${cashFlow.lowBalanceThreshold.toLocaleString('en-LK')} around ${fmtDate(cashFlow.lowBalanceDate)}.`, confidence: 'medium' })
  }

  if (overview.expectedExpenses > overview.expectedIncome) {
    out.push({ kind: 'risk', text: `Projected spending over this period (Rs ${overview.expectedExpenses.toLocaleString('en-LK')}) exceeds projected income (Rs ${overview.expectedIncome.toLocaleString('en-LK')}) — the gap is being covered by your current cash balance.`, confidence: 'medium' })
  } else if (overview.savingsRatePct > 20) {
    out.push({ kind: 'positive', text: `Projected savings rate is ${overview.savingsRatePct.toFixed(0)}% — comfortably above the 20% often recommended.`, confidence: 'medium' })
  }

  if (cashFlow.avgMonthlyVariableExpense > 0 && cashFlow.avgMonthlyIncome > 0) {
    const variablePct = (cashFlow.avgMonthlyVariableExpense / cashFlow.avgMonthlyIncome) * 100
    if (variablePct > 30) {
      out.push({ kind: 'watch', text: `Everyday variable spending is averaging Rs ${cashFlow.avgMonthlyVariableExpense.toLocaleString('en-LK')}/month (${variablePct.toFixed(0)}% of income) — trimming this is usually the fastest lever to improve the forecast.`, confidence: 'low' })
    }
  }

  const worstDebt = debtForecast[0]
  if (worstDebt && worstDebt.extraPaymentInterestSaved > 1000) {
    out.push({ kind: 'action', text: `An extra Rs ${worstDebt.extraPayment.toLocaleString('en-LK')}/month on ${worstDebt.liability.name} (your highest-interest debt at ${worstDebt.liability.interest_rate ?? 0}%) could save roughly Rs ${worstDebt.extraPaymentInterestSaved.toLocaleString('en-LK')} in interest.`, confidence: 'medium' })
  }

  const atRiskGoals = goalForecast.filter((g) => !g.onTrack && g.projectedGapAtDeadline !== null && g.projectedGapAtDeadline < 0)
  atRiskGoals.slice(0, 2).forEach((g) => {
    out.push({ kind: 'risk', text: `"${g.goal.name}" is projected to fall short by about Rs ${Math.abs(g.projectedGapAtDeadline!).toLocaleString('en-LK')} by its deadline at the current contribution pace.`, confidence: 'low' })
  })

  if (overview.confidencePct < 50) {
    out.push({ kind: 'watch', text: `Forecast confidence is ${overview.confidencePct}% — log more months of transactions to sharpen this projection, especially for variable spending.`, confidence: 'high' })
  }

  return out.slice(0, 6)
}
