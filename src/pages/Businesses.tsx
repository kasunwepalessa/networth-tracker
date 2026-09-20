import { useMemo, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useData } from '../lib/useData'
import { fmtLKR, fmtCompact, fmtDate, daysUntil, fmtMonthShort } from '../lib/format'
import { transactionsInRange, sumIncome, sumExpenses, totalMonthlySubscriptionCost, upcomingSubscriptions } from '../lib/calc'
import {
  BUSINESSES, BUSINESS_LABEL, BUSINESS_TAGLINE, BUSINESS_COLOR,
  businessTransactions, businessClients, businessInvoices, businessSubscriptions, businessCashTotal,
  businessMonthlyFlowSeries, businessExpenseByCategory, businessHealthScore, pctChange, generateBusinessInsights,
} from '../lib/businessCalc'
import PeriodFilterBar, { usePeriodFilter } from '../components/PeriodFilter'
import { useCountUp } from '../lib/useCountUp'
import type { Business, Invoice } from '../lib/types'

const CAT_COLORS = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)', 'var(--cat-6)', 'var(--cat-7)', 'var(--cat-8)']
const INVOICE_STATUS_ORDER: Invoice['status'][] = ['paid', 'sent', 'overdue', 'draft']
const INVOICE_STATUS_COLOR: Record<Invoice['status'], string> = { paid: 'var(--good)', sent: 'var(--brand)', overdue: 'var(--critical)', draft: 'var(--neutral)' }

const INSIGHT_STYLE: Record<'positive' | 'watch' | 'risk' | 'action', { cls: string; label: string }> = {
  positive: { cls: 'good', label: 'On track' },
  watch: { cls: 'warning', label: 'Worth watching' },
  risk: { cls: 'critical', label: 'Risk' },
  action: { cls: 'brand', label: 'Recommendation' },
}

function CountValue({ value }: { value: number }) {
  const animated = useCountUp(value)
  return <span className="value lg num">{fmtLKR(animated)}</span>
}

export default function Businesses() {
  const { transactions, accounts, categories, clients, invoices, subscriptions, goals, liabilities, loading } = useData()
  const pf = usePeriodFilter('monthly')
  const [focus, setFocus] = useState<Business>('nexxel')

  const stats = useMemo(() => {
    const out = {} as Record<Business, {
      income: number; expenses: number; profit: number; marginPct: number | null
      cash: number; clients: number
      invoices: Invoice[]; overdueCount: number; overdueAmount: number
      awaitingCount: number; awaitingAmount: number; receivablesTotal: number
      subCost: number; trendPct: number | null
    }>
    BUSINESSES.forEach((biz) => {
      const txns = transactionsInRange(businessTransactions(transactions, biz), pf.range)
      const income = sumIncome(txns)
      const expenses = sumExpenses(txns)
      const profit = income - expenses
      const marginPct = income > 0 ? (profit / income) * 100 : null
      const cash = businessCashTotal(accounts, biz)
      const bizInvoices = businessInvoices(invoices, clients, biz)
      const overdue = bizInvoices.filter((i) => i.status === 'overdue')
      const awaiting = bizInvoices.filter((i) => i.status === 'sent')
      const overdueAmount = overdue.reduce((s, i) => s + i.balance, 0)
      const awaitingAmount = awaiting.reduce((s, i) => s + i.balance, 0)
      const subCost = totalMonthlySubscriptionCost(businessSubscriptions(subscriptions, biz))
      const flow2 = businessMonthlyFlowSeries(transactions, biz, 2)
      const trendPct = pctChange(flow2[1]?.income ?? 0, flow2[0]?.income ?? 0)
      out[biz] = {
        income, expenses, profit, marginPct, cash, clients: businessClients(clients, biz).length,
        invoices: bizInvoices, overdueCount: overdue.length, overdueAmount,
        awaitingCount: awaiting.length, awaitingAmount, receivablesTotal: overdueAmount + awaitingAmount,
        subCost, trendPct,
      }
    })
    return out
  }, [transactions, accounts, invoices, clients, subscriptions, pf.range])

  const focusStats = stats[focus]

  const health = useMemo(() => businessHealthScore({
    cash: focusStats.cash,
    monthlyExpenses: focusStats.expenses || 1,
    profitMarginPct: focusStats.marginPct,
    overdueInvoiceCount: focusStats.overdueCount,
    revenueTrendPct: focusStats.trendPct,
  }), [focusStats])
  const healthColor = health.score >= 65 ? 'var(--good)' : health.score >= 45 ? 'var(--warning)' : 'var(--critical)'

  const flowSeries = useMemo(
    () => businessMonthlyFlowSeries(transactions, focus, 6).map((f) => ({ ...f, monthLabel: fmtMonthShort(f.month), profit: f.income - f.expenses })),
    [transactions, focus],
  )
  const hasFlow = flowSeries.some((f) => f.income !== 0 || f.expenses !== 0)

  const catBreakdown = useMemo(() => businessExpenseByCategory(transactions, categories, focus, pf.range, 6), [transactions, categories, focus, pf.range])
  const catTotal = catBreakdown.reduce((s, c) => s + c.amount, 0)

  const statusBreakdown = useMemo(() => {
    const map = new Map<Invoice['status'], { count: number; amount: number }>()
    focusStats.invoices.forEach((i) => {
      const cur = map.get(i.status) ?? { count: 0, amount: 0 }
      map.set(i.status, { count: cur.count + 1, amount: cur.amount + (i.status === 'paid' ? i.amount : i.balance) })
    })
    return INVOICE_STATUS_ORDER.map((s) => ({ status: s, ...(map.get(s) ?? { count: 0, amount: 0 }) })).filter((s) => s.count > 0)
  }, [focusStats.invoices])
  const statusTotal = focusStats.invoices.length

  const upcomingSubs = useMemo(
    () => upcomingSubscriptions(businessSubscriptions(subscriptions, focus), 30),
    [subscriptions, focus],
  )

  // Business-specific alerts: overdue receivables, low cash runway, a loss-making period,
  // and upcoming subscription renewals — one list per business, combined here.
  const alerts = useMemo(() => {
    const list: { level: 'critical' | 'warning'; business: Business; text: string }[] = []
    BUSINESSES.forEach((biz) => {
      const s = stats[biz]
      const label = BUSINESS_LABEL[biz]
      if (s.overdueCount > 0) {
        list.push({ level: 'critical', business: biz, text: `${label}: ${s.overdueCount} overdue invoice${s.overdueCount === 1 ? '' : 's'} worth ${fmtLKR(s.overdueAmount)}` })
      }
      if (s.expenses > 0 && s.cash / s.expenses < 1) {
        list.push({ level: 'critical', business: biz, text: `${label}: cash on hand covers less than one month of this period's expenses` })
      }
      if (s.income > 0 && s.profit < 0) {
        list.push({ level: 'warning', business: biz, text: `${label}: expenses exceeded income this period by ${fmtLKR(Math.abs(s.profit))}` })
      }
      businessSubscriptions(subscriptions, biz).filter((sub) => sub.status === 'active').forEach((sub) => {
        const d = daysUntil(sub.next_renewal_date)
        if (d !== null && d >= 0 && d <= 7) {
          list.push({ level: 'warning', business: biz, text: `${label}: ${sub.name} renews ${d === 0 ? 'today' : `in ${d} day${d === 1 ? '' : 's'}`} (${fmtLKR(sub.amount)})` })
        }
      })
    })
    return list
  }, [stats, subscriptions])

  const insights = useMemo(() => {
    const personalTxns = transactionsInRange(transactions.filter((t) => t.owner === 'personal'), pf.range)
    return generateBusinessInsights({
      businesses: {
        nexxel: { income: stats.nexxel.income, expenses: stats.nexxel.expenses, profit: stats.nexxel.profit, marginPct: stats.nexxel.marginPct, cash: stats.nexxel.cash, overdueReceivables: stats.nexxel.overdueAmount, trendPct: stats.nexxel.trendPct },
        sweet_cocoa: { income: stats.sweet_cocoa.income, expenses: stats.sweet_cocoa.expenses, profit: stats.sweet_cocoa.profit, marginPct: stats.sweet_cocoa.marginPct, cash: stats.sweet_cocoa.cash, overdueReceivables: stats.sweet_cocoa.overdueAmount, trendPct: stats.sweet_cocoa.trendPct },
      },
      personalIncome: sumIncome(personalTxns),
      personalExpenses: sumExpenses(personalTxns),
      goals,
      liabilities,
    })
  }, [stats, transactions, pf.range, goals, liabilities])

  return (
    <div>
      <div className="page-head rise">
        <div>
          <h2>Businesses</h2>
          <div className="sub">Nexxel &amp; Sweet Cocoa &mdash; profitability, health, and where the profit should go next</div>
        </div>
      </div>

      <div className="card card-pad rise rise-1" style={{ marginBottom: 14 }}>
        <PeriodFilterBar pf={pf} bare />
      </div>

      <div className="grid cols-2 rise rise-2" style={{ marginBottom: 14 }}>
        {BUSINESSES.map((biz) => {
          const s = stats[biz]
          return (
            <section key={biz} className="card hoverable clickable" onClick={() => setFocus(biz)} style={{ borderColor: focus === biz ? BUSINESS_COLOR[biz] : undefined }}>
              <div className="card-pad">
                <div className="section-head">
                  <div>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 3, background: BUSINESS_COLOR[biz], display: 'inline-block' }} />
                      {BUSINESS_LABEL[biz]}
                    </h3>
                    <span className="hint">{BUSINESS_TAGLINE[biz]}</span>
                  </div>
                  {focus === biz && <span className="pill brand">Viewing details</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                  <span className="value lg num" style={{ color: s.profit >= 0 ? 'var(--good)' : 'var(--critical)' }}>{fmtCompact(s.profit)}</span>
                  <span className="sub">{s.income > 0 ? `${s.marginPct!.toFixed(0)}% margin` : 'No income logged yet'}</span>
                </div>
                <div className="grid cols-3" style={{ marginTop: 12, gap: 8 }}>
                  <div>
                    <div className="hint">Income</div>
                    <div className="num" style={{ fontWeight: 700, fontSize: 13 }}>{fmtCompact(s.income)}</div>
                  </div>
                  <div>
                    <div className="hint">Expenses</div>
                    <div className="num" style={{ fontWeight: 700, fontSize: 13 }}>{fmtCompact(s.expenses)}</div>
                  </div>
                  <div>
                    <div className="hint">Cash</div>
                    <div className="num" style={{ fontWeight: 700, fontSize: 13 }}>{fmtCompact(s.cash)}</div>
                  </div>
                </div>
                {(s.overdueCount > 0 || s.awaitingCount > 0) && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {s.awaitingCount > 0 && <span className="pill brand">{s.awaitingCount} sent &middot; {fmtLKR(s.awaitingAmount)}</span>}
                    {s.overdueCount > 0 && <span className="pill critical">{s.overdueCount} overdue &middot; {fmtLKR(s.overdueAmount)}</span>}
                  </div>
                )}
              </div>
            </section>
          )
        })}
      </div>

      <div className="tabs pill-tabs rise rise-2" style={{ marginBottom: 14 }}>
        {BUSINESSES.map((biz) => (
          <button key={biz} className={focus === biz ? 'active' : ''} onClick={() => setFocus(biz)}>{BUSINESS_LABEL[biz]} details</button>
        ))}
      </div>

      <div className="grid cols-4 rise rise-3" style={{ marginBottom: 14 }}>
        <div className="card card-pad kpi">
          <span className="label">Profit{pf.periodType !== 'all' ? ` · ${pf.title}` : ''}</span>
          <CountValue value={focusStats.profit} />
          <span className="sub">{focusStats.income > 0 ? `${focusStats.marginPct!.toFixed(0)}% margin` : 'No income yet'}</span>
        </div>
        <div className="card card-pad kpi">
          <span className="label">Business health</span>
          <span className="value lg num" style={{ color: healthColor }}>{health.score} / 100</span>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${health.score}%`, background: healthColor }} /></div>
          <span className="sub">{health.label}</span>
        </div>
        <div className="card card-pad kpi">
          <span className="label">Outstanding receivables</span>
          <span className="value lg num" style={{ color: focusStats.receivablesTotal > 0 ? 'var(--critical)' : 'var(--ink-1)' }}>{fmtCompact(focusStats.receivablesTotal)}</span>
          <span className="sub">{fmtCompact(focusStats.awaitingAmount)} sent, awaiting payment &middot; {fmtCompact(focusStats.overdueAmount)} overdue</span>
        </div>
        <div className="card card-pad kpi">
          <span className="label">Monthly subscriptions</span>
          <span className="value lg num">{fmtCompact(focusStats.subCost)}</span>
          <span className="sub">{upcomingSubs.length} renewing in 30 days</span>
        </div>
      </div>

      <div className="grid cols-2 rise rise-4" style={{ alignItems: 'stretch', marginBottom: 14 }}>
        <section className="card hoverable">
          <div className="card-pad">
            <div className="section-head"><h3>Income vs expenses</h3><span className="hint">Last 6 months</span></div>
            {!hasFlow ? <div className="empty">No transactions logged for {BUSINESS_LABEL[focus]} in the last 6 months yet.</div> : (
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <AreaChart data={flowSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--good)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--good)" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--critical)" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="var(--critical)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: 'var(--ink-muted)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10.5, fill: 'var(--ink-muted)' }} tickFormatter={(v) => fmtCompact(v)} width={54} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v) => fmtLKR(Number(v))} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} />
                    <Area type="monotone" dataKey="income" name="Income" stroke="var(--good)" strokeWidth={2} fill="url(#incomeGrad)" />
                    <Area type="monotone" dataKey="expenses" name="Expenses" stroke="var(--critical)" strokeWidth={2} fill="url(#expenseGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>

        <section className="card hoverable">
          <div className="card-pad">
            <div className="section-head"><h3>Expenses by category</h3><span className="hint">{pf.periodType !== 'all' ? pf.title : 'All time'}</span></div>
            {catBreakdown.length === 0 ? <div className="empty">No expenses recorded for this period yet.</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {catBreakdown.map((c, i) => (
                  <div className="hbar-row" key={c.name}>
                    <span className="hbar-label" title={c.name}>{c.name}</span>
                    <div className="hbar-track"><div className="hbar-fill" style={{ width: `${catTotal > 0 ? (c.amount / catTotal) * 100 : 0}%`, background: CAT_COLORS[i % CAT_COLORS.length] }} /></div>
                    <span className="hbar-val num">{fmtCompact(c.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="grid cols-2 rise rise-5" style={{ alignItems: 'stretch', marginBottom: 14 }}>
        <section className="card hoverable">
          <div className="card-pad">
            <div className="section-head"><h3>Score factors</h3><span className="hint">{BUSINESS_LABEL[focus]}</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {health.factors.map((f) => (
                <div key={f.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700 }}>{f.label}</span>
                    <span className="num" style={{ fontSize: 12, fontWeight: 800, color: f.contribution >= 0 ? 'var(--good)' : 'var(--critical)' }}>{f.contribution >= 0 ? '+' : ''}{f.contribution.toFixed(0)} pts</span>
                  </div>
                  <span className="sub">{f.detail}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="card hoverable">
          <div className="card-pad">
            <div className="section-head"><h3>Invoices by status</h3><span className="hint">{statusTotal} total</span></div>
            {statusBreakdown.length === 0 ? <div className="empty">No invoices for {BUSINESS_LABEL[focus]} yet.</div> : (
              <>
                <div className="comp-bar" style={{ marginBottom: 14 }}>
                  {statusBreakdown.map((s) => (
                    <div key={s.status} className="comp-bar-seg" style={{ width: `${(s.count / statusTotal) * 100}%`, background: INVOICE_STATUS_COLOR[s.status] }} />
                  ))}
                </div>
                <div className="chip-legend">
                  {statusBreakdown.map((s) => (
                    <div className="chip-legend-row" key={s.status}>
                      <span className="chip-legend-dot" style={{ background: INVOICE_STATUS_COLOR[s.status] }} />
                      <span className="chip-legend-name" style={{ textTransform: 'capitalize' }}>{s.status}</span>
                      <span className="chip-legend-val num">{s.count} &middot; {fmtCompact(s.amount)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      <div className="grid cols-2 rise rise-5" style={{ alignItems: 'stretch', marginBottom: 14 }}>
        <section className="card hoverable">
          <div className="card-pad">
            <div className="section-head"><h3>Notifications</h3><span className="hint">{alerts.length} active</span></div>
            {loading ? <div className="empty">Loading…</div> : alerts.length === 0 ? <div className="empty">Nothing needs attention across either business right now.</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
                {alerts.map((a, i) => <div key={i} className={`alert ${a.level}`}>{a.text}</div>)}
              </div>
            )}
          </div>
        </section>

        <section className="card hoverable">
          <div className="card-pad">
            <div className="section-head"><h3>Upcoming renewals</h3><span className="hint">{BUSINESS_LABEL[focus]} &middot; next 30 days</span></div>
            {upcomingSubs.length === 0 ? <div className="empty">Nothing renewing soon.</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {upcomingSubs.map((s) => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span>{s.name}</span>
                    <span className="num" style={{ fontWeight: 700 }}>{fmtLKR(s.amount)} &middot; {fmtDate(s.next_renewal_date)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="card hoverable rise rise-5">
        <div className="card-pad">
          <div className="section-head">
            <h3>AI overview &amp; recommendations</h3>
            <span className="hint">Computed from your actual numbers, both businesses combined</span>
          </div>
          {insights.length === 0 ? <div className="empty">Not enough data yet to generate recommendations.</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {insights.map((ins, i) => {
                const style = INSIGHT_STYLE[ins.kind]
                return (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, fontSize: 12.5, background: `var(--${style.cls}-soft)`, color: `var(--${style.cls})` }}>
                    <span className={`pill ${style.cls}`} style={{ flex: 'none' }}>{style.label}</span>
                    <span style={{ color: 'var(--ink-1)' }}>{ins.text}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
