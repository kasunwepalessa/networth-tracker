import type { Goal, GoalContribution, Transaction, Owner } from './types'
import { monthKey } from './format'
import { sumIncome, sumExpenses } from './calc'

export const GOAL_TYPES = ['emergency_fund', 'vehicle', 'property', 'travel', 'education', 'business_equipment', 'retirement', 'other']

export const GOAL_TYPE_LABEL: Record<string, string> = {
  emergency_fund: 'Emergency fund', vehicle: 'Vehicle', property: 'Property', travel: 'Travel',
  education: 'Education', business_equipment: 'Business equipment', retirement: 'Retirement / long-term', other: 'Other',
}

export type GoalStatus = 'not_started' | 'on_track' | 'behind' | 'at_risk' | 'completed' | 'no_deadline'

export interface GoalStatusInfo {
  status: GoalStatus
  label: string
  progressPct: number // current/target, 0-100
  remaining: number
  daysLeft: number | null
  expectedProgressPct: number | null // where progress "should" be today, linear from created_at to target_date
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

export function goalDaysLeft(g: Goal): number | null {
  if (!g.target_date) return null
  const target = new Date(g.target_date + 'T00:00:00')
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return daysBetween(now, target)
}

/** Status + progress read for a goal, comparing actual progress against a straight-line plan
 *  from when the goal was created to its deadline. */
export function goalStatusInfo(g: Goal): GoalStatusInfo {
  const progressPct = g.target_amount > 0 ? Math.min(100, Math.max(0, (g.current_amount / g.target_amount) * 100)) : 0
  const remaining = Math.max(0, g.target_amount - g.current_amount)
  const daysLeft = goalDaysLeft(g)

  if (g.current_amount >= g.target_amount && g.target_amount > 0) {
    return { status: 'completed', label: 'Completed', progressPct: 100, remaining: 0, daysLeft, expectedProgressPct: null }
  }
  if (!g.target_date) {
    return { status: 'no_deadline', label: 'No deadline set', progressPct, remaining, daysLeft: null, expectedProgressPct: null }
  }
  if (g.current_amount <= g.starting_amount && progressPct < 1) {
    if (daysLeft !== null && daysLeft < 0) {
      return { status: 'at_risk', label: 'Past due', progressPct, remaining, daysLeft, expectedProgressPct: 100 }
    }
    return { status: 'not_started', label: 'Not started', progressPct, remaining, daysLeft, expectedProgressPct: null }
  }

  const created = new Date(g.created_at)
  const target = new Date(g.target_date + 'T00:00:00')
  const now = new Date()
  const totalSpan = daysBetween(created, target)
  const elapsed = daysBetween(created, now)
  const expectedProgressPct = totalSpan > 0 ? Math.min(100, Math.max(0, (elapsed / totalSpan) * 100)) : 100

  if (daysLeft !== null && daysLeft < 0) {
    return { status: 'at_risk', label: 'Past due', progressPct, remaining, daysLeft, expectedProgressPct }
  }
  const gap = expectedProgressPct - progressPct
  if (gap > 15) return { status: 'at_risk', label: 'At risk', progressPct, remaining, daysLeft, expectedProgressPct }
  if (gap > 5) return { status: 'behind', label: 'Slightly behind', progressPct, remaining, daysLeft, expectedProgressPct }
  return { status: 'on_track', label: 'On track', progressPct, remaining, daysLeft, expectedProgressPct }
}

export interface RequiredContribution {
  daily: number | null
  weekly: number | null
  monthly: number | null
}

/** How much needs to be saved per day/week/month to hit the target by the deadline, from today. */
export function requiredContribution(g: Goal): RequiredContribution {
  const remaining = Math.max(0, g.target_amount - g.current_amount)
  const daysLeft = goalDaysLeft(g)
  if (remaining <= 0) return { daily: 0, weekly: 0, monthly: 0 }
  if (daysLeft === null || daysLeft <= 0) return { daily: null, weekly: null, monthly: null }
  return {
    daily: remaining / daysLeft,
    weekly: remaining / (daysLeft / 7),
    monthly: remaining / (daysLeft / 30.44),
  }
}

/** Average actual monthly contribution pace over the last `months` months (from logged contributions). */
export function contributionPace(contributions: GoalContribution[], months = 3): number {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const cutoffISO = cutoff.toISOString().slice(0, 10)
  const recent = contributions.filter((c) => c.contribution_date >= cutoffISO)
  if (recent.length === 0) return 0
  const total = recent.reduce((s, c) => s + c.amount, 0)
  return total / months
}

export interface GoalSeriesPoint {
  month: string
  planned: number | null
  actual: number | null
  predicted: number | null
}

/** Monthly planned-vs-actual-vs-predicted series from the goal's creation month through its
 *  deadline (or +12 months out if there's no deadline). Planned is a straight line from
 *  starting_amount to target_amount; actual is cumulative contributions through the current
 *  month; predicted extrapolates from the recent contribution pace for months after now. */
export function plannedVsActualSeries(g: Goal, contributions: GoalContribution[]): GoalSeriesPoint[] {
  const created = new Date(g.created_at)
  const startMonth = new Date(created.getFullYear(), created.getMonth(), 1)
  const target = g.target_date ? new Date(g.target_date + 'T00:00:00') : new Date(startMonth.getFullYear(), startMonth.getMonth() + 12, 1)
  const endMonth = new Date(target.getFullYear(), target.getMonth(), 1)
  const now = new Date()
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const totalMonths = Math.max(1, (endMonth.getFullYear() - startMonth.getFullYear()) * 12 + (endMonth.getMonth() - startMonth.getMonth()))
  const pace = contributionPace(contributions, 3)

  // cumulative actual amount by month (starting_amount + contributions up to & including that month)
  const sorted = [...contributions].sort((a, b) => a.contribution_date.localeCompare(b.contribution_date))

  const points: GoalSeriesPoint[] = []
  let cursor = new Date(startMonth)
  let monthIdx = 0
  while (cursor <= endMonth) {
    const key = monthKey(cursor)
    const cursorEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).toISOString().slice(0, 10)
    const isPast = cursor <= currentMonth

    const planned = g.starting_amount + (g.target_amount - g.starting_amount) * Math.min(1, monthIdx / totalMonths)

    let actual: number | null = null
    if (isPast) {
      const contributedByThen = sorted.filter((c) => c.contribution_date <= cursorEnd).reduce((s, c) => s + c.amount, 0)
      actual = g.starting_amount + contributedByThen
    }

    let predicted: number | null = null
    if (!isPast || cursor.getTime() === currentMonth.getTime()) {
      const monthsAhead = (cursor.getFullYear() - currentMonth.getFullYear()) * 12 + (cursor.getMonth() - currentMonth.getMonth())
      predicted = Math.min(g.target_amount, g.current_amount + pace * Math.max(0, monthsAhead))
    }

    points.push({ month: key, planned: Math.round(planned), actual: actual !== null ? Math.round(actual) : null, predicted: predicted !== null ? Math.round(predicted) : null })
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    monthIdx++
  }
  return points
}

export interface Milestone {
  pct: number
  amount: number
  reached: boolean
  reachedDate: string | null
}

export function goalMilestones(g: Goal, contributions: GoalContribution[]): Milestone[] {
  const sorted = [...contributions].sort((a, b) => a.contribution_date.localeCompare(b.contribution_date))
  return [25, 50, 75, 100].map((pct) => {
    const amount = g.target_amount * (pct / 100)
    const reached = g.current_amount >= amount
    let reachedDate: string | null = null
    if (reached) {
      let running = g.starting_amount
      for (const c of sorted) {
        running += c.amount
        if (running >= amount) { reachedDate = c.contribution_date; break }
      }
    }
    return { pct, amount, reached, reachedDate }
  })
}

export interface NextMilestoneInfo {
  milestone: Milestone
  amountNeeded: number
  estimatedDate: string | null // based on recent contribution pace
}

export function nextMilestone(g: Goal, contributions: GoalContribution[]): NextMilestoneInfo | null {
  const milestones = goalMilestones(g, contributions)
  const next = milestones.find((m) => !m.reached)
  if (!next) return null
  const amountNeeded = Math.max(0, next.amount - g.current_amount)
  const pace = contributionPace(contributions, 3)
  let estimatedDate: string | null = null
  if (pace > 0) {
    const monthsNeeded = amountNeeded / pace
    const d = new Date()
    d.setMonth(d.getMonth() + Math.ceil(monthsNeeded))
    estimatedDate = d.toISOString().slice(0, 10)
  }
  return { milestone: next, amountNeeded, estimatedDate }
}

export interface MonthlyContributionBucket {
  month: string
  amount: number
  count: number
}

export function contributionBreakdown(contributions: GoalContribution[], months = 12): MonthlyContributionBucket[] {
  const out: MonthlyContributionBucket[] = []
  const now = new Date()
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = monthKey(d)
    const inMonth = contributions.filter((c) => monthKey(c.contribution_date) === key)
    out.push({ month: key, amount: inMonth.reduce((s, c) => s + c.amount, 0), count: inMonth.length })
  }
  return out
}

export interface GoalInsight {
  kind: 'positive' | 'watch' | 'risk' | 'action'
  text: string
}

/** Rule-based recommendations for one goal, built from its own numbers plus recent contribution pace. */
export function generateGoalInsights(g: Goal, contributions: GoalContribution[]): GoalInsight[] {
  const out: GoalInsight[] = []
  const info = goalStatusInfo(g)
  const required = requiredContribution(g)
  const pace = contributionPace(contributions, 3)

  if (info.status === 'completed') {
    out.push({ kind: 'positive', text: `"${g.name}" is fully funded — consider moving this amount into a fixed deposit or investment if it's sitting idle in a low-interest account.` })
    return out
  }

  if (info.status === 'not_started') {
    out.push({ kind: 'watch', text: `No contributions logged yet toward "${g.name}". Log the first one to start tracking real pace against the plan.` })
  } else if (info.status === 'at_risk') {
    out.push({ kind: 'risk', text: info.daysLeft !== null && info.daysLeft < 0
      ? `"${g.name}" is past its target date with ${info.remaining.toLocaleString('en-LK', { maximumFractionDigits: 0 })} still remaining — worth resetting the deadline or increasing contributions.`
      : `"${g.name}" is falling behind plan — at this pace you're likely to miss the target date unless contributions pick up.` })
  } else if (info.status === 'behind') {
    out.push({ kind: 'watch', text: `"${g.name}" is a little behind where it should be by now — a slightly bigger contribution over the next month or two would close the gap.` })
  } else if (info.status === 'on_track') {
    out.push({ kind: 'positive', text: `"${g.name}" is on track to hit its target by the deadline at the current pace.` })
  }

  if (required.monthly !== null && pace > 0) {
    if (pace < required.monthly * 0.8) {
      out.push({ kind: 'risk', text: `Recent contributions are averaging ${pace.toLocaleString('en-LK', { maximumFractionDigits: 0 })}/month, below the ${required.monthly.toLocaleString('en-LK', { maximumFractionDigits: 0 })}/month needed to hit the deadline.` })
    } else if (pace >= required.monthly) {
      out.push({ kind: 'positive', text: `Recent contributions (${pace.toLocaleString('en-LK', { maximumFractionDigits: 0 })}/month) are already covering the required pace.` })
    }
  } else if (required.monthly !== null && pace === 0 && info.status !== 'not_started') {
    out.push({ kind: 'watch', text: `No contributions logged in the last 3 months — ${required.monthly.toLocaleString('en-LK', { maximumFractionDigits: 0 })}/month is needed from here to stay on schedule.` })
  }

  const next = nextMilestone(g, contributions)
  if (next && next.estimatedDate) {
    out.push({ kind: 'action', text: `At the current pace, the next milestone (${next.milestone.pct}%) should be reached around ${next.estimatedDate}.` })
  }

  return out.slice(0, 5)
}

export interface CashFlowImpact {
  requiredMonthly: number | null
  avgMonthlySurplus: number
  impactPct: number | null // requiredMonthly as % of avgMonthlySurplus
}

/** How much the goal's required monthly contribution eats into average personal cash flow
 *  (income - expenses) over the last 3 months. */
export function goalCashFlowImpact(g: Goal, transactions: Transaction[], owner: Owner = 'personal'): CashFlowImpact {
  const required = requiredContribution(g)
  const now = new Date()
  let totalSurplus = 0
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = monthKey(d)
    const txns = transactions.filter((t) => monthKey(t.txn_date) === key && t.owner === owner)
    totalSurplus += sumIncome(txns) - sumExpenses(txns)
  }
  const avgMonthlySurplus = totalSurplus / 3
  const impactPct = required.monthly !== null && avgMonthlySurplus > 0 ? (required.monthly / avgMonthlySurplus) * 100 : null
  return { requiredMonthly: required.monthly, avgMonthlySurplus, impactPct }
}

/** Scenario calculator: given a hypothetical monthly contribution, how many months (and what
 *  date) until the target is reached from the current amount. */
export function scenarioMonthsToTarget(g: Goal, monthlyContribution: number): { months: number | null; date: string | null } {
  const remaining = Math.max(0, g.target_amount - g.current_amount)
  if (remaining <= 0) return { months: 0, date: new Date().toISOString().slice(0, 10) }
  if (monthlyContribution <= 0) return { months: null, date: null }
  const months = Math.ceil(remaining / monthlyContribution)
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return { months, date: d.toISOString().slice(0, 10) }
}
