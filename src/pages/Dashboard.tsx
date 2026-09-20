import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useData } from '../lib/useData'
import { upsertSnapshot, transactionsApi } from '../lib/api'
import {
  accountsCashTotal, totalAssets, totalLiabilities, monthTransactions,
  sumIncome, sumExpenses, financialHealthScore, monthlyFlowSeries, expenseByCategoryInRange, investmentValue,
  transactionsInRange, totalMonthlySubscriptionCost, upcomingSubscriptions,
} from '../lib/calc'
import { fmtLKR, fmtCompact, monthKey, daysUntil, fmtDate, fmtMonthShort, todayISO } from '../lib/format'
import { useCountUp } from '../lib/useCountUp'
import PeriodFilterBar, { usePeriodFilter } from '../components/PeriodFilter'
import Modal from '../components/Modal'
import type { Owner, Transaction } from '../lib/types'

type Scope = Owner | 'all'
type Range = '6m' | '1y' | 'all'
type IconName = 'trend' | 'wallet' | 'pulse' | 'up' | 'down' | 'target' | 'file' | 'bell' | 'arrow' | 'send' | 'receive' | 'plus' | 'repeat'

const CAT_COLORS = [
  'var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)',
  'var(--cat-5)', 'var(--cat-6)', 'var(--cat-7)', 'var(--cat-8)',
]
const AVATAR_COLORS = ['var(--brand)', 'var(--accent)', 'var(--cat-1)', 'var(--cat-5)', 'var(--cat-7)']

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
    case 'bell':
      return <svg {...c}><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>
    case 'arrow':
      return <svg {...c}><line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" /></svg>
    case 'send':
      return <svg {...c}><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
    case 'receive':
      return <svg {...c}><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>
    case 'plus':
      return <svg {...c}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
    case 'repeat':
      return <svg {...c}><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" /></svg>
  }
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'
}

function CountValue({ value, format = fmtLKR, className, style }: { value: number; format?: (v: number) => string; className?: string; style?: CSSProperties }) {
  const animated = useCountUp(value)
  return <span className={className} style={style}>{format(animated)}</span>
}

const quickEmpty: Partial<Transaction> = {
  txn_date: todayISO(), amount: 0, description: '', owner: 'personal',
  account_id: null, category_id: null, client_id: null, is_recurring: false, recurring_frequency: null,
}

export default function Dashboard() {
  const {
    accounts, assets, investments, fixedDeposits, liabilities, transactions, invoices, budgets, categories,
    snapshots, subscriptions, loading, refresh,
  } = useData()
  const navigate = useNavigate()
  const [scope, setScope] = useState<Scope>('all')
  const [range, setRange] = useState<Range>('1y')
  const [bellOpen, setBellOpen] = useState(false)
  const [quickAdd, setQuickAdd] = useState<Partial<Transaction> | null>(null)
  const [quickFlow, setQuickFlow] = useState<'income' | 'expense'>('expense')
  const [saving, setSaving] = useState(false)
  const ownerFilter = scope === 'all' ? undefined : scope

  const pf = usePeriodFilter('monthly')

  const nwAssets = totalAssets(accounts, assets, investments, fixedDeposits, ownerFilter)
  const nwLiabilities = totalLiabilities(accounts, liabilities, ownerFilter)
  const netWorth = nwAssets - nwLiabilities
  const cash = accountsCashTotal(accounts, ownerFilter)

  const cashPersonal = accountsCashTotal(accounts, 'personal')
  const cashBusiness = accountsCashTotal(accounts, 'business')

  const thisMonth = monthKey()
  const monthTxns = monthTransactions(transactions, thisMonth, ownerFilter)

  const periodTxns = useMemo(() => transactionsInRange(transactions, pf.range, ownerFilter), [transactions, pf.range, ownerFilter])
  const income = sumIncome(periodTxns)
  const expenses = sumExpenses(periodTxns)
  const savings = income - expenses
  const savingsRate = income > 0 ? (savings / income) * 100 : 0
  const periodSuffix = pf.periodType !== 'all' ? ` · ${pf.title}` : ''

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
    budgets.filter((b) => b.month === thisMonth).forEach((b) => {
      const cat = categories.find((c) => c.id === b.category_id)
      if (!cat) return
      const spent = monthTxns.filter((t) => t.category_id === b.category_id && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
      if (spent > b.limit_amount) list.push({ level: 'warning', text: `${cat.name} spending (${fmtLKR(spent)}) is over budget (${fmtLKR(b.limit_amount)})` })
    })
    upcomingSubscriptions(subscriptions, 3, ownerFilter).forEach((s) => {
      list.push({ level: 'warning', text: `${s.name} subscription renews ${daysUntil(s.next_renewal_date) === 0 ? 'today' : `in ${daysUntil(s.next_renewal_date)} day(s)`} (${fmtLKR(s.amount)})` })
    })
    return list.slice(0, 8)
  }, [accounts, liabilities, fixedDeposits, invoices, budgets, categories, monthTxns, thisMonth, subscriptions, ownerFilter])

  const outstandingReceivables = invoices.filter((i) => i.status !== 'draft' && i.status !== 'paid').reduce((s, i) => s + i.balance, 0)

  const flowSeries = useMemo(
    () => monthlyFlowSeries(transactions, 6, ownerFilter).map((f) => ({ ...f, monthLabel: fmtMonthShort(f.month), net: f.income - f.expenses })),
    [transactions, ownerFilter],
  )
  const hasFlow = flowSeries.some((f) => f.income !== 0 || f.expenses !== 0)
  const flowMax = Math.max(1, ...flowSeries.map((f) => Math.abs(f.net)))

  const catBreakdown = useMemo(
    () => expenseByCategoryInRange(transactions, categories, pf.range, ownerFilter, 6),
    [transactions, categories, pf.range, ownerFilter],
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

  const monthlySubCost = totalMonthlySubscriptionCost(subscriptions, ownerFilter)
  const upcomingSubs = useMemo(() => upcomingSubscriptions(subscriptions, 30, ownerFilter), [subscriptions, ownerFilter])

  const firstName = 'Kasun'
  const todayLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  async function saveQuickAdd() {
    if (!quickAdd || !quickAdd.txn_date) return
    const magnitude = Math.abs(Number(quickAdd.amount) || 0)
    if (magnitude <= 0) return
    const signed = quickFlow === 'income' ? magnitude : -magnitude
    setSaving(true)
    try {
      await transactionsApi.create({ ...quickAdd, amount: signed })
      await refresh('transactions')
      setQuickAdd(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="topbar">
        <div className="welcome rise">
          <h2>Welcome back, <span className="name">{firstName}</span></h2>
          <span className="sub">{todayLabel} &middot; personal &amp; business net worth, at a glance</span>
        </div>
        <div className="topbar-actions">
          <div className="tabs" style={{ borderBottom: 'none', marginBottom: 0 }}>
            {(['all', 'personal', 'business'] as Scope[]).map((s) => (
              <button key={s} className={scope === s ? 'active' : ''} onClick={() => setScope(s)}>
                {s === 'all' ? 'All' : s === 'personal' ? 'Personal' : 'Business'}
              </button>
            ))}
          </div>
          <div style={{ position: 'relative' }}>
            <button className="icon-pill" onClick={() => setBellOpen((v) => !v)} aria-label="Alerts">
              <Icon name="bell" />
              {alerts.length > 0 && <span className="dot" />}
            </button>
            {bellOpen && (
              <div className="theme-pop" style={{ width: 280 }}>
                <p className="theme-pop-label">Needs attention ({alerts.length})</p>
                {alerts.length === 0 ? (
                  <div className="empty" style={{ padding: '14px 4px' }}>Nothing needs attention right now.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                    {alerts.map((a, i) => <div key={i} className={`alert ${a.level}`} style={{ fontSize: 11.5 }}>{a.text}</div>)}
                  </div>
                )}
              </div>
            )}
          </div>
          <button className="btn primary pill" onClick={() => { setQuickFlow('expense'); setQuickAdd({ ...quickEmpty, owner: scope === 'business' ? 'business' : 'personal' }) }}>
            <Icon name="plus" /> Add transaction
          </button>
          <div className="avatar-circle">{initials(firstName)}</div>
        </div>
      </div>

      <div className="card card-pad rise rise-1" style={{ marginBottom: 14 }}>
        <PeriodFilterBar pf={pf} bare />
      </div>

      <div className="grid cols-3 rise rise-1" style={{ marginBottom: 14 }}>
        <div className="card card-pad kpi hoverable clickable" onClick={() => navigate('/overview/net-worth')}>
          <div className="kpi-top">
            <span className="label">Net worth</span>
            <span className="card-goto"><Icon name="arrow" /></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <CountValue value={netWorth} className="value lg num" style={{ color: netWorth >= 0 ? 'var(--ink-1)' : 'var(--critical)' }} />
            {scope === 'all' && nwTrend && Math.abs(nwTrend.delta) > 1 && (
              <span className={`trend-badge ${nwTrend.delta > 0 ? 'up' : 'down'}`}>
                {nwTrend.delta > 0 ? '▲' : '▼'} {fmtCompact(Math.abs(nwTrend.delta))}
              </span>
            )}
          </div>
          <span className="sub">Assets {fmtCompact(nwAssets)} &minus; liabilities {fmtCompact(nwLiabilities)}{scope === 'all' && nwTrend ? ' · last 30 days' : ''}</span>
        </div>
        <div className="card card-pad kpi hoverable clickable" onClick={() => navigate('/accounts')}>
          <div className="kpi-top">
            <span className="label">Total cash available</span>
            <span className="card-goto"><Icon name="arrow" /></span>
          </div>
          <CountValue value={cash} className="value lg num" />
          <span className="sub">Personal {fmtCompact(cashPersonal)} &middot; Business {fmtCompact(cashBusiness)}</span>
        </div>
        <div className="card card-pad kpi hoverable clickable" onClick={() => navigate('/overview/health')}>
          <div className="kpi-top">
            <span className="label">Financial health</span>
            <span className="card-goto"><Icon name="arrow" /></span>
          </div>
          <span className="value lg num" style={{ color: healthColor }}>{health.score} / 100</span>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${health.score}%`, background: healthColor, transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)' }} /></div>
          <span className="sub">{health.label}</span>
        </div>
      </div>

      <div className="grid cols-4 rise rise-2" style={{ marginBottom: 14 }}>
        <div className="card card-pad kpi hoverable clickable" onClick={() => navigate('/overview/cash-flow')}>
          <div className="kpi-top">
            <span className="label">Income{periodSuffix}</span>
            <span className="kpi-icon" style={{ background: 'var(--good-soft)', color: 'var(--good)' }}><Icon name="up" /></span>
          </div>
          <CountValue value={income} className="value num" />
        </div>
        <div className="card card-pad kpi hoverable clickable" onClick={() => navigate('/overview/cash-flow')}>
          <div className="kpi-top">
            <span className="label">Expenses{periodSuffix}</span>
            <span className="kpi-icon" style={{ background: 'var(--critical-soft)', color: 'var(--critical)' }}><Icon name="down" /></span>
          </div>
          <CountValue value={expenses} className="value num" />
        </div>
        <div className="card card-pad kpi hoverable clickable" onClick={() => navigate('/overview/cash-flow')}>
          <div className="kpi-top">
            <span className="label">Savings{periodSuffix}</span>
            <span className="kpi-icon" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}><Icon name="target" /></span>
          </div>
          <CountValue value={savings} className="value num" style={{ color: savings >= 0 ? 'var(--good)' : 'var(--critical)' }} />
          <span className="sub">{income > 0 ? `${savingsRate.toFixed(0)}% savings rate` : 'No income recorded'}</span>
        </div>
        <div className="card card-pad kpi hoverable clickable" onClick={() => navigate('/overview/receivables')}>
          <div className="kpi-top">
            <span className="label">Outstanding receivables</span>
            <span className="kpi-icon" style={{ background: 'var(--critical-soft)', color: 'var(--critical)' }}><Icon name="file" /></span>
          </div>
          <CountValue value={outstandingReceivables} className="value num" style={{ color: outstandingReceivables > 0 ? 'var(--critical)' : 'var(--ink-1)' }} />
          <span className="sub">{invoices.filter((i) => i.status === 'overdue').length} overdue invoices</span>
        </div>
      </div>

      <div className="grid cols-2 rise rise-3" style={{ alignItems: 'stretch', gridTemplateColumns: '1.4fr 1fr', marginBottom: 14 }}>
        <section className="card hoverable">
          <div className="card-pad balance-card">
            <div className="section-head">
              <h3>Net worth growth</h3>
              <div className="tabs pill-tabs" style={{ marginBottom: 0 }}>
                {(['6m', '1y', 'all'] as Range[]).map((r) => (
                  <button key={r} className={range === r ? 'active' : ''} onClick={() => setRange(r)}>{r === '6m' ? '6M' : r === '1y' ? '1Y' : 'All'}</button>
                ))}
              </div>
            </div>
            <span className="balance-value num">{fmtLKR(netWorth)}</span>
            {chartData.length < 2 ? (
              <div className="empty">Net worth is snapshotted automatically each day you open the dashboard.<br />Check back after a few days to see the trend line.</div>
            ) : (
              <div style={{ width: '100%', height: 200, marginTop: 4 }}>
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
                    <Tooltip formatter={(v) => fmtLKR(Number(v))} labelFormatter={(d) => fmtDate(d as string)} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} />
                    <Area type="monotone" dataKey="netWorth" stroke="var(--brand)" strokeWidth={2.25} fill="url(#nwGradient)" dot={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} animationDuration={700} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="spark-actions">
              <button className="btn primary sm pill" onClick={() => { setQuickFlow('income'); setQuickAdd({ ...quickEmpty, owner: scope === 'business' ? 'business' : 'personal' }) }}>
                <Icon name="receive" /> Add income
              </button>
              <button className="btn sm pill" onClick={() => navigate('/overview/net-worth')}>
                <Icon name="send" /> View report
              </button>
            </div>
          </div>
        </section>

        <section className="card hoverable">
          <div className="card-pad">
            <div className="section-head"><h3>Alerts</h3><span className="hint">{alerts.length} active</span></div>
            {alerts.length === 0 ? (
              <div className="empty">Nothing needs attention right now.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                {alerts.map((a, i) => (
                  <div key={i} className={`alert ${a.level}`}>{a.text}</div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="grid cols-2 rise rise-4" style={{ alignItems: 'stretch', marginBottom: 14 }}>
        <section className="card hoverable">
          <div className="card-pad">
            <div className="section-head">
              <h3>Net cash flow</h3>
              <span className="hint">Last 6 months &middot; current month highlighted</span>
            </div>
            {!hasFlow ? (
              <div className="empty">No transactions in the last 6 months yet.</div>
            ) : (
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={flowSeries} margin={{ top: 26, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
                    <defs>
                      <pattern id="hatchBrand" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                        <rect width="6" height="6" fill="var(--brand-dark)" />
                        <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
                      </pattern>
                    </defs>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: 'var(--ink-muted)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                    <YAxis domain={[-flowMax * 1.1, flowMax * 1.1]} tick={{ fontSize: 10.5, fill: 'var(--ink-muted)' }} tickFormatter={(v) => fmtCompact(v)} width={54} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v) => fmtLKR(Number(v))} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} cursor={{ fill: 'var(--surface-2)' }} />
                    <Bar dataKey="net" name="Net cash flow" radius={[6, 6, 6, 6]} maxBarSize={34} animationDuration={700}>
                      {flowSeries.map((f, i) => {
                        const isCurrent = f.month === thisMonth
                        const positive = f.net >= 0
                        return (
                          <Cell
                            key={i}
                            fill={isCurrent ? 'url(#hatchBrand)' : positive ? 'var(--brand-soft)' : 'var(--critical-soft)'}
                            stroke={isCurrent ? 'var(--brand-dark)' : positive ? 'var(--brand)' : 'var(--critical)'}
                            strokeWidth={isCurrent ? 0 : 1.5}
                          />
                        )
                      })}
                    </Bar>
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
              <span className="hint">{pf.periodType !== 'all' ? pf.title : 'All time'}</span>
            </div>
            {catBreakdown.length === 0 ? (
              <div className="empty">No expenses recorded for this period yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {catBreakdown.map((c, i) => (
                  <div className="hbar-row" key={c.name}>
                    <span className="hbar-label" title={c.name}>{c.name}</span>
                    <div className="hbar-track">
                      <div className="hbar-fill" style={{ width: `${catTotal > 0 ? (c.amount / catTotal) * 100 : 0}%`, background: CAT_COLORS[i % CAT_COLORS.length], transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)' }} />
                    </div>
                    <span className="hbar-val num">{fmtCompact(c.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="grid cols-2 rise rise-5" style={{ alignItems: 'stretch' }}>
        <section className="card hoverable">
          <div className="card-pad">
            <div className="section-head"><h3>Net worth composition</h3></div>
            {compTotal === 0 ? <div className="empty">No assets recorded yet.</div> : (
              <>
                <div className="comp-bar" style={{ marginBottom: 14 }}>
                  {compItems.map((c) => (
                    <div key={c.name} className="comp-bar-seg" style={{ width: `${(c.value / compTotal) * 100}%`, background: c.color, transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)' }} />
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
        </section>

        <section className="card hoverable clickable" onClick={() => navigate('/subscriptions')}>
          <div className="card-pad">
            <div className="section-head">
              <h3>Subscriptions</h3>
              <span className="card-goto"><Icon name="arrow" /></span>
            </div>
            <div className="hero-stat" style={{ padding: '2px 0 14px' }}>
              <CountValue value={monthlySubCost} className="hero-value num" />
              <div className="hero-label">per month &middot; {subscriptions.filter((s) => s.status === 'active' && (!ownerFilter || s.owner === ownerFilter)).length} active</div>
            </div>
            {upcomingSubs.length === 0 ? (
              <div className="empty" style={{ padding: '10px 0' }}>No renewals in the next 30 days.</div>
            ) : (
              <>
                <div className="avatar-stack" style={{ marginBottom: 10 }}>
                  {upcomingSubs.slice(0, 5).map((s, i) => (
                    <span key={s.id} className="stack-item" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }} title={s.name}>{initials(s.name)}</span>
                  ))}
                  {upcomingSubs.length > 5 && <span className="stack-item stack-more">+{upcomingSubs.length - 5}</span>}
                </div>
                <span className="hint">Next: {upcomingSubs[0].name} &middot; {fmtLKR(upcomingSubs[0].amount)} &middot; {fmtDate(upcomingSubs[0].next_renewal_date)}</span>
              </>
            )}
          </div>
        </section>
      </div>

      {quickAdd && (
        <Modal title={quickFlow === 'income' ? 'Add income' : 'Add transaction'} onClose={() => setQuickAdd(null)} footer={
          <>
            <button className="btn" onClick={() => setQuickAdd(null)}>Cancel</button>
            <button className="btn primary" onClick={saveQuickAdd} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </>
        }>
          <div className="tabs" style={{ marginBottom: 0 }}>
            <button className={quickFlow === 'expense' ? 'active' : ''} onClick={() => setQuickFlow('expense')}>Expense</button>
            <button className={quickFlow === 'income' ? 'active' : ''} onClick={() => setQuickFlow('income')}>Income</button>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Date</label>
              <input type="date" value={quickAdd.txn_date ?? todayISO()} onChange={(e) => setQuickAdd({ ...quickAdd, txn_date: e.target.value })} />
            </div>
            <div className="field">
              <label>Amount (Rs)</label>
              <input type="number" value={Math.abs(quickAdd.amount ?? 0)} onChange={(e) => setQuickAdd({ ...quickAdd, amount: Number(e.target.value) })} autoFocus />
            </div>
          </div>
          <div className="field">
            <label>Description</label>
            <input value={quickAdd.description ?? ''} onChange={(e) => setQuickAdd({ ...quickAdd, description: e.target.value })} placeholder="e.g. Grocery shopping, Client deposit…" />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Category</label>
              <select value={quickAdd.category_id ?? ''} onChange={(e) => setQuickAdd({ ...quickAdd, category_id: e.target.value || null })}>
                <option value="">Uncategorised</option>
                {categories.filter((c) => c.kind === quickFlow).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Owner</label>
              <select value={quickAdd.owner ?? 'personal'} onChange={(e) => setQuickAdd({ ...quickAdd, owner: e.target.value as Owner })}>
                <option value="personal">Personal</option>
                <option value="business">Business</option>
              </select>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
