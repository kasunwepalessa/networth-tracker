import type { Transaction, Invoice, Client, Subscription, Account, Business, Category, Goal, Liability } from './types'
import { sumIncome, sumExpenses, inRange, type PeriodRange, type CategorySlice } from './calc'
import { monthKey } from './format'

export const BUSINESSES: Business[] = ['nexxel', 'sweet_cocoa']

export const BUSINESS_LABEL: Record<Business, string> = {
  nexxel: 'Nexxel',
  sweet_cocoa: 'Sweet Cocoa',
}

export const BUSINESS_TAGLINE: Record<Business, string> = {
  nexxel: 'Content marketing agency — retainer clients, ad & video production',
  sweet_cocoa: 'Digital & printed wedding invitations',
}

// Two visually distinct, theme-aware colors from the app's existing category palette.
export const BUSINESS_COLOR: Record<Business, string> = {
  nexxel: 'var(--cat-8)',
  sweet_cocoa: 'var(--cat-5)',
}

export function businessTransactions(transactions: Transaction[], business: Business): Transaction[] {
  return transactions.filter((t) => t.business === business)
}

export function businessClients(clients: Client[], business: Business): Client[] {
  return clients.filter((c) => c.business === business)
}

/** Invoices belonging to a business, resolved via the invoice's client. */
export function businessInvoices(invoices: Invoice[], clients: Client[], business: Business): Invoice[] {
  const ids = new Set(businessClients(clients, business).map((c) => c.id))
  return invoices.filter((i) => i.client_id && ids.has(i.client_id))
}

export function businessSubscriptions(subscriptions: Subscription[], business: Business): Subscription[] {
  return subscriptions.filter((s) => s.business === business)
}

export function businessAccounts(accounts: Account[], business: Business): Account[] {
  return accounts.filter((a) => a.business === business)
}

export function businessCashTotal(accounts: Account[], business: Business): number {
  return businessAccounts(accounts, business)
    .filter((a) => !a.archived && a.type !== 'credit_card')
    .reduce((s, a) => s + a.balance, 0)
}

export interface BusinessMonthlyFlow {
  month: string
  income: number
  expenses: number
}

/** Income vs. expense totals for each of the last `months` calendar months, oldest first, for one business. */
export function businessMonthlyFlowSeries(transactions: Transaction[], business: Business, months: number): BusinessMonthlyFlow[] {
  const txns = businessTransactions(transactions, business)
  const out: BusinessMonthlyFlow[] = []
  const now = new Date()
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = monthKey(d)
    const monthTxns = txns.filter((t) => monthKey(t.txn_date) === key)
    out.push({ month: key, income: sumIncome(monthTxns), expenses: sumExpenses(monthTxns) })
  }
  return out
}

/** Expense total per category over a period range, for one business, sorted descending. */
export function businessExpenseByCategory(
  transactions: Transaction[], categories: Category[], business: Business, range: PeriodRange | null, topN = 6,
): CategorySlice[] {
  const txns = businessTransactions(transactions, business).filter((t) => t.amount < 0 && inRange(t.txn_date, range))
  const byCat = new Map<string, number>()
  txns.forEach((t) => {
    const cat = categories.find((c) => c.id === t.category_id)
    const name = cat?.name ?? 'Uncategorized'
    byCat.set(name, (byCat.get(name) ?? 0) + Math.abs(t.amount))
  })
  const sorted = Array.from(byCat.entries()).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount)
  if (sorted.length <= topN) return sorted
  const head = sorted.slice(0, topN)
  const rest = sorted.slice(topN).reduce((s, c) => s + c.amount, 0)
  return rest > 0 ? [...head, { name: 'Other', amount: rest }] : head
}

export interface BusinessHealthFactor {
  key: string
  label: string
  detail: string
  contribution: number
}

export interface BusinessHealth {
  score: number
  label: string
  factors: BusinessHealthFactor[]
}

/** A 0-100 business-health score from profitability, cash runway, receivables and revenue trend. */
export function businessHealthScore(input: {
  cash: number
  monthlyExpenses: number
  profitMarginPct: number | null // null when there's no revenue yet to compute a margin from
  overdueInvoiceCount: number
  revenueTrendPct: number | null // % change vs the prior comparable period; null if not enough history
}): BusinessHealth {
  let score = 50
  const factors: BusinessHealthFactor[] = []

  const runwayMonths = input.monthlyExpenses > 0 ? input.cash / input.monthlyExpenses : 3
  const runwayPts = Math.max(-15, Math.min(20, (runwayMonths - 1) * 6))
  score += runwayPts
  factors.push({
    key: 'runway', label: 'Cash runway',
    detail: `${runwayMonths.toFixed(1)} months of expenses covered by cash on hand`,
    contribution: runwayPts,
  })

  if (input.profitMarginPct !== null) {
    const marginPts = Math.max(-20, Math.min(25, input.profitMarginPct * 0.5))
    score += marginPts
    factors.push({
      key: 'margin', label: 'Profit margin',
      detail: `${input.profitMarginPct.toFixed(0)}% of revenue is kept as profit`,
      contribution: marginPts,
    })
  }

  const overduePts = -(input.overdueInvoiceCount * 3)
  score += overduePts
  factors.push({
    key: 'receivables', label: 'Overdue receivables',
    detail: `${input.overdueInvoiceCount} overdue invoice${input.overdueInvoiceCount === 1 ? '' : 's'}`,
    contribution: overduePts,
  })

  if (input.revenueTrendPct !== null) {
    const trendPts = Math.max(-10, Math.min(15, input.revenueTrendPct * 0.3))
    score += trendPts
    factors.push({
      key: 'trend', label: 'Revenue trend',
      detail: `Revenue is ${input.revenueTrendPct >= 0 ? 'up' : 'down'} ${Math.abs(input.revenueTrendPct).toFixed(0)}% vs the prior period`,
      contribution: trendPts,
    })
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  const label = score >= 80 ? 'Excellent' : score >= 65 ? 'Good' : score >= 45 ? 'Fair' : score >= 25 ? 'Needs attention' : 'At risk'
  return { score, label, factors }
}

/** % change of `current` vs `previous`; null if there's nothing meaningful to compare. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? null : null
  return ((current - previous) / Math.abs(previous)) * 100
}

export interface Insight {
  kind: 'positive' | 'watch' | 'risk' | 'action'
  text: string
}

/** Computed (rule-based, not LLM-generated) narrative insights + savings/investment recommendations,
 *  built from the same numbers already on screen — combined business profit, personal cash flow,
 *  goals, and liabilities. */
export function generateBusinessInsights(input: {
  businesses: Record<Business, { income: number; expenses: number; profit: number; marginPct: number | null; cash: number; overdueReceivables: number; trendPct: number | null }>
  personalIncome: number
  personalExpenses: number
  goals: Goal[]
  liabilities: Liability[]
}): Insight[] {
  const out: Insight[] = []
  const { businesses } = input

  const totalProfit = businesses.nexxel.profit + businesses.sweet_cocoa.profit
  const totalIncome = businesses.nexxel.income + businesses.sweet_cocoa.income

  // Overall profitability
  if (totalIncome === 0) {
    out.push({ kind: 'watch', text: 'No business income logged yet for either business over this period — insights will get sharper once a few months of real invoices and expenses are in.' })
  } else if (totalProfit > 0) {
    const blendedMargin = (totalProfit / totalIncome) * 100
    out.push({ kind: 'positive', text: `Combined, your two businesses are profitable: ${blendedMargin.toFixed(0)}% blended margin across ${(['nexxel', 'sweet_cocoa'] as Business[]).map((b) => BUSINESS_LABEL[b]).join(' and ')}.` })
  } else {
    out.push({ kind: 'risk', text: `Combined business expenses exceeded income for this period by ${Math.abs(totalProfit).toLocaleString('en-LK', { maximumFractionDigits: 0 })} — worth checking whether this is a one-off (equipment, a big campaign) or a trend.` })
  }

  // Per-business comparison
  const withRevenue = (['nexxel', 'sweet_cocoa'] as Business[]).filter((b) => businesses[b].income > 0)
  if (withRevenue.length === 2) {
    const [a, b] = withRevenue
    const stronger = businesses[a].marginPct! >= businesses[b].marginPct! ? a : b
    const weaker = stronger === a ? b : a
    if (businesses[stronger].marginPct !== null && businesses[weaker].marginPct !== null && businesses[stronger].marginPct! - businesses[weaker].marginPct! > 10) {
      out.push({ kind: 'watch', text: `${BUSINESS_LABEL[stronger]} is running a noticeably higher margin (${businesses[stronger].marginPct!.toFixed(0)}%) than ${BUSINESS_LABEL[weaker]} (${businesses[weaker].marginPct!.toFixed(0)}%) — worth reviewing ${BUSINESS_LABEL[weaker]}'s pricing or biggest cost lines.` })
    }
  } else if (withRevenue.length === 1) {
    const active = withRevenue[0]
    const quiet = active === 'nexxel' ? 'sweet_cocoa' : 'nexxel'
    out.push({ kind: 'watch', text: `${BUSINESS_LABEL[quiet]} has no income logged for this period — if that's accurate, ${BUSINESS_LABEL[active]} is currently carrying the household on its own.` })
  }

  // Receivables risk
  const totalOverdue = businesses.nexxel.overdueReceivables + businesses.sweet_cocoa.overdueReceivables
  if (totalOverdue > 0) {
    out.push({ kind: 'risk', text: `${totalOverdue.toLocaleString('en-LK', { maximumFractionDigits: 0 })} is sitting in overdue invoices across both businesses — collecting this would be the fastest way to boost cash on hand, faster than cutting costs.` })
  }

  // Cash runway per business
  ;(['nexxel', 'sweet_cocoa'] as Business[]).forEach((b) => {
    const biz = businesses[b]
    const monthlyExp = biz.expenses > 0 ? biz.expenses : null
    if (monthlyExp && biz.cash / monthlyExp < 1) {
      out.push({ kind: 'risk', text: `${BUSINESS_LABEL[b]} is holding less than one month of expenses in cash — keep an eye on upcoming bills until receivables catch up.` })
    }
  })

  // Savings / investment recommendation from surplus profit
  if (totalProfit > 0) {
    const investable = totalProfit * 0.3
    out.push({
      kind: 'action',
      text: `With a combined profit of ${totalProfit.toLocaleString('en-LK', { maximumFractionDigits: 0 })} this period, consider moving roughly 30% (${investable.toLocaleString('en-LK', { maximumFractionDigits: 0 })}) into savings or a fixed deposit before it gets absorbed into day-to-day spending — keep the rest as working capital.`,
    })
  }

  // Liabilities vs investing
  const interestBearing = input.liabilities.filter((l) => (l.interest_rate ?? 0) > 0)
  if (interestBearing.length > 0) {
    const worst = interestBearing.reduce((a, b) => (b.interest_rate ?? 0) > (a.interest_rate ?? 0) ? b : a)
    out.push({ kind: 'action', text: `${worst.name} is carrying ${worst.interest_rate}% interest on ${worst.remaining_balance.toLocaleString('en-LK', { maximumFractionDigits: 0 })} outstanding — paying this down usually beats what a savings account or FD would earn, so prioritise it over new investing until it's cleared.` })
  } else if (input.liabilities.length > 0 && totalProfit > 0) {
    out.push({ kind: 'watch', text: `Your outstanding liabilities don't carry a logged interest rate — add one on each so this recommendation can weigh payoff-vs-invest accurately.` })
  }

  // Goals
  input.goals.forEach((g) => {
    if (!g.target_date) return
    const remaining = g.target_amount - g.current_amount
    if (remaining <= 0) return
    const daysLeft = Math.round((new Date(g.target_date + 'T00:00:00').getTime() - Date.now()) / 86400000)
    if (daysLeft > 0 && daysLeft <= 60) {
      out.push({ kind: 'action', text: `Goal "${g.name}" needs ${remaining.toLocaleString('en-LK', { maximumFractionDigits: 0 })} more within ${daysLeft} days — if this is business equipment, funding it from this period's profit avoids dipping into reserves.` })
    }
  })

  // Personal savings rate
  if (input.personalIncome > 0) {
    const personalSavingsRate = ((input.personalIncome - input.personalExpenses) / input.personalIncome) * 100
    if (personalSavingsRate < 10) {
      out.push({ kind: 'watch', text: `Personal savings rate is ${personalSavingsRate.toFixed(0)}% this period — below the 20% often recommended. Business profit is healthier than personal cash flow right now, so consider paying yourself a slightly larger, consistent draw instead of ad-hoc transfers.` })
    }
  } else if (totalProfit > 0) {
    out.push({ kind: 'watch', text: `No personal income is logged even though the businesses are profitable — if you're drawing money from Nexxel or Sweet Cocoa personally, logging it as personal income would make your real personal savings rate visible.` })
  }

  return out.slice(0, 8)
}
