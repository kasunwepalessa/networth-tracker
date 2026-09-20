import { useEffect, useMemo, useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useData } from '../lib/useData'
import { upsertSnapshot } from '../lib/api'
import {
  accountsCashTotal, totalAssets, totalLiabilities, monthTransactions,
  sumIncome, sumExpenses, financialHealthScore, monthlyFlowSeries, expenseByCategory, investmentValue,
} from '../lib/calc'
import { fmtLKR, fmtCompact, monthKey, daysUntil, fmtDate, fmtMonthShort } from '../lib/format'
import type { Owner } from '../lib/types'

type Scope = Owner | 'all'
type Range = '6m' | '1y' | 'all'
type IconName = 'trend' | 'wallet' | 'pulse' | 'up' | 'down' | 'target' | 'file'

const CAT_COLORS = [
  'var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)',
  'var(--cat-5)', 'var(--cat-6)', 'var(--cat-7)', 'var(--cat-8)',
]

function Icon({ name }: { name: IconName }) {
  const c = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (name) {
    case 'trend':
      return <svg {...c}><polyline points="3 17 9 11 13 15 21 7" /><polyline points="14 7 21 7 21 14" /></svg>
    case 'wallet':
      return <svg {...c}><rect x="1" y="5" width="22" height="14" rx="2.5" /><path d="M1 9h22" /><circle cx="17.5" cy="14.5" r="1.3" fill="currentColor" stroke="none" /></svg>
    case 'pulse':
      return <svg {...c}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
    case 'up':
      return <svg {...c}><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
    case 'down':
      return <svg {...c}><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>
    case 'target':
      return <svg {...c}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></svg>
    case 'file':
      return <svg {...c}><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="13 2 13 8 19 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" /></svg>
  }
}

export default function Dashboard() {
  const { accounts, assets, investments, fixedDeposits, liabilities, transactions, invoices, budgets, categories, snapshots, loading, refresh } = useData()
  const [scope, setScope] = useState<Scope>('all')
  const [range, setRange] = useState<Range>('1y')
  const ownerFilter = scope === 'all' ? undefined : scope

  const nwAssets = totalAssets(accounts, assets, investments, fixedDeposits, ownerFilter)
  const nwLiabilities = totalLiabilities(accounts, liabilities, ownerFilter)
  const netWorth = nwAssets - nwLiabilities
  const cash = accountsCashTotal(accounts, ownerFilter)

  const cashPersonal = accountsCashTotal(accounts, 'personal')
  const cashBusiness = accountsCashTotal(accounts, 'business')

  const thisMonth = monthKey()
  const monthTxns = monthTransactions(transactions, thisMonth, ownerFilter)
  const income = sumIncome(monthTxns)
  const expenses = sumExpenses(monthTxns)
  const savings = income - expenses
  const savingsRate = income > 0 ? (savings / income) * 100 : 0

  // upsert today's net worth snapshot (whole-portfolio, not scoped) once data is loaded
  useEffect(() => {
    if (loading) return
    const allAssets = totalAssets(accounts, assets, investments, fixedDeposits)
    const allLiabilities = totalLiabilities(accounts, liabilities)
    const allCash = accountsCashTotal(accounts)
    const today = new Date().toISOString().slice(0, 10)
    const already = snapshots.find((s) => s.snapshot_date === today)
    if (already && Math.abs(already.net_worth - (allAssets - allLiabilities)) < 1) return
    upsertSnapshot({
      snapshot_date: today,
      total_assets: allAssets,
      total_liabilities: allLiabilities,
      net_worth: allAssets - allLiabilities,
      cash_total: allCash,
      created_at: new Date().toISOString(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any).then(() => refresh('snapshots')).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  const chartData = useMemo(() => {
    const cutoff = new Date()
    if (range === '6m') cutoff.setMonth(cutoff.getMonth() - 6)
    else if (range === '1y') cutoff.setFullYear(cutoff.getFullYear() - 1)
    else cutoff.setFullYear(2000)
    return snapshots
      .filter((s) => new Date(s.snapshot_date) >= cutoff)
      .map((s) => ({ date: s.snapshot_date, netWorth: s.net_worth }))
  }, [snapshots, range])

  // net worth trend vs. ~30 days ago (whole portfolio, matches the snapshot series)
  const nwTrend = useMemo(() => {
    if (snapshots.length < 2) return null
    const sorted = [...snapshots].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
    const latest = sorted[sorted.length - 1]
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    const cutoffISO = cutoff.toISOString().slice(0, 10)
    const past = sorted.find((s) => s.snapshot_date >= cutoffISO) ?? sorted[0]
    if (past.snapshot_date === latest.snapshot_date) return null
    const delta = latest.net_worth - past.net_worth
    return { delta }
  }, [snapshots])

  const health = financialHealthScore({
    netWorth,
    cash,
    monthlyExpenses: expenses || 1,
    overdueLiabilityCount: liabilities.filter((l) => l.next_due_date && daysUntil(l.next_due_date)! < 0).length,
    overdueInvoiceCount: invoices.filter((i) => i.status === 'overdue').length,
    savingsRatePct: savingsRate,
    liabilityToAssetRatio: nwAssets > 0 ? nwLiabilities / nwAssets : 0,
  })
  const healthColor = health.score >= 65 ? 'var(--good)' : health.score >= 45 ? 'var(--warning)' : 'var(--critical)'
  const healthSoft = health.score >= 65 ? 'var(--good-soft)' : health.score >= 45 ? 'var(--warning-soft)' : 'var(--critical-soft)'

  const alerts = useMemo(() => {
    const list: { level: 'critical' | 'warning'; text: string }[] = []
    accounts.filter((a) => !a.archived && a.type !== 'credit_card' && a.balance < 5000).forEach((a) => {
      list.push({ level: 'warning', text: `${a.name} balance is low: ${fmtLKR(a.balance)}` })
    })
    liabilities.forEach((l) => {
      const d = daysUntil(l.next_due_date)
      if (d === null) return
      if (d < 0) list.push({ level: 'critical', text: `${l.name} payment is overdue (was due ${fmtDate(l.next_due_date)})` })
      else if (d <= 7) list.push({ level: 'warning', text: `${l.name} payment due in ${d} day${d === 1 ? '' : 's'} (${fmtLKR(l.monthly_payment)})` })
    })
    fixedDeposits.filter((f) => f.status === 'active').forEach((f) => {
      const d = daysUntil(f.maturity_date)
      if (d !== null && d >= 0 && d <= 14) list.push({ level: 'warning', text: `${f.bank} FD of ${fmtLKR(f.amount)} matures in ${d} day${d === 1 ? '' : 's'}` })
    })
    invoices.filter((i) => i.status === 'overdue').forEach((i) => {
      list.push({ level: 'critical', text: `Invoice ${i.invoice_number ?? i.id.slice(0, 8)} overdue: ${fmtLKR(i.balance)}` })
    })
    // budgets exceeded this month
    budgets.filter((b) => b.month === thisMonth).forEach((b) => {
      const cat = categories.find((c) => c.id === b.category_id)
      if (!cat) return
      const spent = monthTxns.filter((t) => t.category_id === b.category_id && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
      if (spent > b.limit_amount) list.push({ level: 'warning', text: `${cat.name} spending (${fmtLKR(spent)}) is over budget (${fmtLKR(b.limit_amount)})` })
    })
    return list.slice(0, 8)
  }, [accounts, liabilities, fixedDeposits, invoices, budgets, categories, monthTxns, thisMonth])

  const outstandingReceivables = invoices.filter((i) => i.status !== 'draft' && i.status !== 'paid').reduce((s, i) => s + i.balance, 0)

  const flowSeries = useMemo(
    () => monthlyFlowSeries(transactions, 6, ownerFilter).map((f) => ({ ...f, monthLabel: fmtMonthShort(f.month) })),
    [transactions, ownerFilter],
  )
  const hasFlow = flowSeries.some((f) => f.income !== 0 || f.expenses !== 0)

  const catBreakdown = useMemo(
    () => expenseByCategory(transactions, categories, thisMonth, ownerFilter, 6),
    [transactions, categories, thisMonth, ownerFilter],
  )
  const catTotal = catBreakdown.reduce((s, c) => s + c.amount, 0)

  const compItems = useMemo(() => {
    const cashV = cash
    const invV = investments.filter((i) => !ownerFilter || i.owner === ownerFilter).reduce((s, i) => s + investmentValue(i), 0)
    const fdV = fixedDeposits.filter((f) => f.status === 'active' && (!ownerFilter || f.owner === ownerFilter)).reduce((s, f) => s + f.amount, 0)
    const otherV = assets.filter((a) => !ownerFilter || a.owner === ownerFilter).reduce((s, a) => s + a.current_value * (a.quantity || 1), 0)
    return [
      { name: 'Cash', value: cashV, color: 'var(--cat-1)' },
      { name: 'Investments', value: invV, color: 'var(--cat-3)' },
      { name: 'Fixed deposits', value: fdV, color: 'var(--cat-4)' },
      { name: 'Other assets', value: otherV, color: 'var(--cat-7)' },
    ].filter((c) => c.value > 0)
  }, [cash, investments, fixedDeposits, assets, ownerFilter])
  const compTotal = compItems.reduce((s, c) => s + c.value, 0)
  const liabRatio = nwAssets > 0 ? Math.min(1, nwLiabilities / nwAssets) : 0
  const liabColor = liabRatio < 0.3 ? 'var(--good)' : liabRatio < 0.55 ? 'var(--warning)' : 'var(--critical)'

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Dashboard</h2>
          <div className="sub">Personal &amp; business net worth, at a glance</div>
        </div>
        <div className="tabs" style={{ borderBottom: 'none', marginBottom: 0 }}>
          {(['all', 'personal', 'business'] as Scope[]).map((s) => (
            <button key={s} className={scope === s ? 'active' : ''} onClick={() => setScope(s)}>
              {s === 'all' ? 'All' : s === 'personal' ? 'Personal' : 'Business'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid cols-3" style={{ marginBottom: 14 }}>
        <div className="card card-pad kpi hoverable">
          <div className="kpi-top">
            <span className="label">Net worth</span>
            <span className="kpi-icon" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}><Icon name="trend" /></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span className="value lg num" style={{ color: netWorth >= 0 ? 'var(--ink-1)' : 'var(--critical)' }}>{fmtLKR(netWorth)}</span>
            {scope === 'all' && nwTrend && Math.abs(nwTrend.delta) > 1 && (
              <span className={`trend-badge ${nwTrend.delta > 0 ? 'up' : 'down'}`}>
                {nwTrend.delta > 0 ? '▲' : '▼'} {fmtCompact(Math.abs(nwTrend.delta))}
              </span>
            )}
          </div>
          <span className="sub">Assets {fmtCompact(nwAssets)} &minus; liabilities {fmtCompact(nwLiabilities)}{scope === 'all' && nwTrend ? ' · last 30 days' : ''}</span>
        </div>
        <div className="card card-pad kpi hoverable">
          <div className="kpi-top">
            <span className="label">Total cash available</span>
            <span className="kpi-icon" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="wallet" /></span>
          </div>
          <span className="value lg num">{fmtLKR(cash)}</span>
          <span className="sub">Personal {fmtCompact(cashPersonal)} &middot; Business {fmtCompact(cashBusiness)}</span>
        </div>
        <div className="card card-pad kpi hoverable">
          <div className="kpi-top">
            <span className="label">Financial health</span>
            <span className="kpi-icon" style={{ background: healthSoft, color: healthColor }}><Icon name="pulse" /></span>
          </div>
          <span className="value lg num" style={{ color: healthColor }}>{health.score} / 100</span>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${health.score}%`, background: healthColor }} /></div>
          <span className="sub">{health.label}</span>
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 14 }}>
        <div className="card card-pad kpi hoverable">
          <div className="kpi-top">
            <span className="label">Income (this month)</span>
            <span className="kpi-icon" style={{ background: 'var(--good-soft)', color: 'var(--good)' }}><Icon name="up" /></span>
          </div>
          <span className="value num">{fmtLKR(income)}</span>
        </div>
        <div className="card card-pad kpi hoverable">
          <div className="kpi-top">
            <span className="label">Expenses (this month)</span>
            <span className="kpi-icon" style={{ background: 'var(--critical-soft)', color: 'var(--critical)' }}><Icon name="down" /></span>
          </div>
          <span className="value num">{fmtLKR(expenses)}</span>
        </div>
        <div className="card card-pad kpi hoverable">
          <div className="kpi-top">
            <span className="label">Savings (this month)</span>
            <span className="kpi-icon" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}><Icon name="target" /></span>
          </div>
          <span className="value num" style={{ color: savings >= 0 ? 'var(--good)' : 'var(--critical)' }}>{fmtLKR(savings)}</span>
          <span className="sub">{savingsRate.toFixed(0)}% savings rate</span>
        </div>
        <div className="card card-pad kpi hoverable">
          <div className="kpi-top">
            <span className="label">Outstanding receivables</span>
            <span className="kpi-icon" style={{ background: 'var(--critical-soft)', color: 'var(--critical)' }}><Icon name="file" /></span>
          </div>
          <span className="value num" style={{ color: 'var(--critical)' }}>{fmtLKR(outstandingReceivables)}</span>
          <span className="sub">{invoices.filter((i) => i.status === 'overdue').length} overdue invoices</span>
        </div>
      </div>

      <div className="grid cols-2" style={{ alignItems: 'stretch', gridTemplateColumns: '1.4fr 1fr', marginBottom: 14 }}>
        <section className="card hoverable">
          <div className="card-pad">
            <div className="section-head">
              <h3>Net worth growth</h3>
              <div className="tabs" style={{ borderBottom: 'none', marginBottom: 0 }}>
                {(['6m', '1y', 'all'] as Range[]).map((r) => (
                  <button key={r} className={range === r ? 'active' : ''} onClick={() => setRange(r)}>{r === '6m' ? '6M' : r === '1y' ? '1Y' : 'All'}</button>
                ))}
              </div>
            </div>
            {chartData.length < 2 ? (
              <div className="empty">Net worth is snapshotted automatically each day you open the dashboard.<br />Check back after a few days to see the trend line.</div>
            ) : (
              <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer>
                  <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="nwGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.32} />
                        <stop offset="95%" stopColor="var(--brand)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10.5, fill: 'var(--ink-muted)' }} tickFormatter={(d) => fmtDate(d)} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10.5, fill: 'var(--ink-muted)' }} tickFormatter={(v) => fmtCompact(v)} width={60} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v) => fmtLKR(Number(v))} labelFormatter={(d) => fmtDate(d as string)} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }} />
                    <Area type="monotone" dataKey="netWorth" stroke="var(--brand)" strokeWidth={2.25} fill="url(#nwGradient)" dot={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>

        <section className="card hoverable">
          <div className="card-pad">
            <div className="section-head"><h3>Alerts</h3></div>
            {alerts.length === 0 ? (
              <div className="empty">Nothing needs attention right now.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {alerts.map((a, i) => (
                  <div key={i} className={`alert ${a.level}`}>{a.text}</div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="grid cols-2" style={{ alignItems: 'stretch', marginBottom: 14 }}>
        <section className="card hoverable">
          <div className="card-pad">
            <div className="section-head">
              <h3>Income vs expenses</h3>
              <div className="legend">
                <span className="legend-item"><span className="swatch" style={{ background: 'var(--accent)' }} />Income</span>
                <span className="legend-item"><span className="swatch" style={{ background: 'var(--critical)' }} />Expenses</span>
              </div>
            </div>
            {!hasFlow ? (
              <div className="empty">No transactions in the last 6 months yet.</div>
            ) : (
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={flowSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={3} barCategoryGap="26%">
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: 'var(--ink-muted)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10.5, fill: 'var(--ink-muted)' }} tickFormatter={(v) => fmtCompact(v)} width={54} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v) => fmtLKR(Number(v))} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }} cursor={{ fill: 'var(--surface-2)' }} />
                    <Bar dataKey="income" name="Income" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={20} />
                    <Bar dataKey="expenses" name="Expenses" fill="var(--critical)" radius={[4, 4, 0, 0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>

        <section className="card hoverable">
          <div className="card-pad">
            <div className="section-head">
              <h3>Spending by category</h3>
              <span className="hint">This month</span>
            </div>
            {catBreakdown.length === 0 ? (
              <div className="empty">No expenses recorded this month yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {catBreakdown.map((c, i) => (
                  <div className="hbar-row" key={c.name}>
                    <span className="hbar-label" title={c.name}>{c.name}</span>
                    <div className="hbar-track">
                      <div className="hbar-fill" style={{ width: `${catTotal > 0 ? (c.amount / catTotal) * 100 : 0}%`, background: CAT_COLORS[i % CAT_COLORS.length] }} />
                    </div>
                    <span className="hbar-val num">{fmtCompact(c.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="card hoverable">
        <div className="card-pad">
          <div className="section-head"><h3>Net worth composition</h3></div>
          <div className="grid cols-2" style={{ gap: 26, alignItems: 'center' }}>
            <div>
              {compTotal === 0 ? <div className="empty">No assets recorded yet.</div> : (
                <>
                  <div className="comp-bar" style={{ marginBottom: 14 }}>
                    {compItems.map((c) => (
                      <div key={c.name} className="comp-bar-seg" style={{ width: `${(c.value / compTotal) * 100}%`, background: c.color }} />
                    ))}
                  </div>
                  <div className="chip-legend">
                    {compItems.map((c) => (
                      <div className="chip-legend-row" key={c.name}>
                        <span className="chip-legend-dot" style={{ background: c.color }} />
                        <span className="chip-legend-name">{c.name}</span>
                        <span className="chip-legend-val num">{fmtCompact(c.value)} · {((c.value / compTotal) * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div>
              <span style={{ fontSize: 11, color: 'var(--ink-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Liabilities vs assets</span>
              <div className="progress-track" style={{ marginTop: 9, marginBottom: 7 }}>
                <div className="progress-fill" style={{ width: `${liabRatio * 100}%`, background: liabColor }} />
              </div>
              <span className="sub">{fmtLKR(nwLiabilities)} of {fmtLKR(nwAssets)} in assets ({(liabRatio * 100).toFixed(0)}%)</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
