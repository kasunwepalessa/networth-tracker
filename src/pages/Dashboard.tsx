import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useData } from '../lib/useData'
import { upsertSnapshot } from '../lib/api'
import {
  accountsCashTotal, totalAssets, totalLiabilities, monthTransactions,
  sumIncome, sumExpenses, financialHealthScore,
} from '../lib/calc'
import { fmtLKR, fmtCompact, monthKey, daysUntil, fmtDate } from '../lib/format'
import type { Owner } from '../lib/types'

type Scope = Owner | 'all'
type Range = '6m' | '1y' | 'all'

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

  const health = financialHealthScore({
    netWorth,
    cash,
    monthlyExpenses: expenses || 1,
    overdueLiabilityCount: liabilities.filter((l) => l.next_due_date && daysUntil(l.next_due_date)! < 0).length,
    overdueInvoiceCount: invoices.filter((i) => i.status === 'overdue').length,
    savingsRatePct: savingsRate,
    liabilityToAssetRatio: nwAssets > 0 ? nwLiabilities / nwAssets : 0,
  })

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
        <div className="card card-pad kpi">
          <span className="label">Net worth</span>
          <span className="value lg num" style={{ color: netWorth >= 0 ? 'var(--ink-1)' : 'var(--critical)' }}>{fmtLKR(netWorth)}</span>
          <span className="sub">Assets {fmtCompact(nwAssets)} &minus; liabilities {fmtCompact(nwLiabilities)}</span>
        </div>
        <div className="card card-pad kpi">
          <span className="label">Total cash available</span>
          <span className="value lg num">{fmtLKR(cash)}</span>
          <span className="sub">Personal {fmtCompact(cashPersonal)} &middot; Business {fmtCompact(cashBusiness)}</span>
        </div>
        <div className="card card-pad kpi">
          <span className="label">Financial health</span>
          <span className="value lg num" style={{ color: health.score >= 65 ? 'var(--good)' : health.score >= 45 ? 'var(--warning)' : 'var(--critical)' }}>{health.score} / 100</span>
          <span className="sub">{health.label}</span>
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 14 }}>
        <div className="card card-pad kpi">
          <span className="label"><span className="swatch" style={{ background: 'var(--accent)' }} />Income (this month)</span>
          <span className="value num">{fmtLKR(income)}</span>
        </div>
        <div className="card card-pad kpi">
          <span className="label"><span className="swatch" style={{ background: 'var(--critical)' }} />Expenses (this month)</span>
          <span className="value num">{fmtLKR(expenses)}</span>
        </div>
        <div className="card card-pad kpi">
          <span className="label"><span className="swatch" style={{ background: 'var(--brand)' }} />Savings (this month)</span>
          <span className="value num" style={{ color: savings >= 0 ? 'var(--good)' : 'var(--critical)' }}>{fmtLKR(savings)}</span>
          <span className="sub">{savingsRate.toFixed(0)}% savings rate</span>
        </div>
        <div className="card card-pad kpi">
          <span className="label">Outstanding receivables</span>
          <span className="value num" style={{ color: 'var(--critical)' }}>{fmtLKR(outstandingReceivables)}</span>
          <span className="sub">{invoices.filter((i) => i.status === 'overdue').length} overdue invoices</span>
        </div>
      </div>

      <div className="grid cols-2" style={{ alignItems: 'stretch', gridTemplateColumns: '1.4fr 1fr' }}>
        <section className="card">
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
                  <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10.5, fill: 'var(--ink-muted)' }} tickFormatter={(d) => fmtDate(d)} />
                    <YAxis tick={{ fontSize: 10.5, fill: 'var(--ink-muted)' }} tickFormatter={(v) => fmtCompact(v)} width={60} />
                    <Tooltip formatter={(v) => fmtLKR(Number(v))} labelFormatter={(d) => fmtDate(d as string)} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }} />
                    <Line type="monotone" dataKey="netWorth" stroke="var(--brand)" strokeWidth={2.25} dot={{ r: 2.5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>

        <section className="card">
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
    </div>
  )
}
