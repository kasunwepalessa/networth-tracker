import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useData } from '../../lib/useData'
import {
  sumIncome, sumExpenses, transactionsInRange, expenseByCategoryInRange, monthlyFlowSeries,
} from '../../lib/calc'
import { fmtLKR, fmtCompact, fmtDate, fmtMonthShort, OWNER_LABEL } from '../../lib/format'
import { useCountUp } from '../../lib/useCountUp'
import PeriodFilterBar, { usePeriodFilter } from '../../components/PeriodFilter'
import type { Owner } from '../../lib/types'

type Scope = Owner | 'all'

const CAT_COLORS = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)', 'var(--cat-6)', 'var(--cat-7)', 'var(--cat-8)']

export default function CashFlowDetail() {
  const { transactions, categories, accounts, clients, loading } = useData()
  const [scope, setScope] = useState<Scope>('all')
  const ownerFilter = scope === 'all' ? undefined : scope
  const pf = usePeriodFilter('monthly')

  const periodTxns = useMemo(() => transactionsInRange(transactions, pf.range, ownerFilter), [transactions, pf.range, ownerFilter])
  const income = sumIncome(periodTxns)
  const expenses = sumExpenses(periodTxns)
  const net = income - expenses
  const incomeAnimated = useCountUp(income)
  const expensesAnimated = useCountUp(expenses)

  const catBreakdown = useMemo(() => expenseByCategoryInRange(transactions, categories, pf.range, ownerFilter, 20), [transactions, categories, pf.range, ownerFilter])
  const catTotal = catBreakdown.reduce((s, c) => s + c.amount, 0)

  const flowSeries = useMemo(() => monthlyFlowSeries(transactions, 6, ownerFilter).map((f) => ({ ...f, monthLabel: fmtMonthShort(f.month) })), [transactions, ownerFilter])

  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? '—'
  const accName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? '—'
  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.name

  const sorted = [...periodTxns].sort((a, b) => b.txn_date.localeCompare(a.txn_date))

  return (
    <div>
      <Link to="/" className="back-link rise">&larr; Back to dashboard</Link>
      <div className="page-head rise rise-1">
        <div>
          <h2>Cash flow</h2>
          <div className="sub">Income, expenses and where the money went</div>
        </div>
        <div className="tabs" style={{ borderBottom: 'none', marginBottom: 0 }}>
          {(['all', 'personal', 'business'] as Scope[]).map((s) => (
            <button key={s} className={scope === s ? 'active' : ''} onClick={() => setScope(s)}>{s === 'all' ? 'All' : s === 'personal' ? 'Personal' : 'Business'}</button>
          ))}
        </div>
      </div>

      <div className="card card-pad rise rise-2" style={{ marginBottom: 14 }}>
        <PeriodFilterBar pf={pf} bare />
      </div>

      <div className="grid cols-3 rise rise-2" style={{ marginBottom: 14 }}>
        <div className="card card-pad kpi"><span className="label">Income</span><span className="value lg num" style={{ color: 'var(--good)' }}>{fmtLKR(incomeAnimated)}</span></div>
        <div className="card card-pad kpi"><span className="label">Expenses</span><span className="value lg num" style={{ color: 'var(--critical)' }}>{fmtLKR(expensesAnimated)}</span></div>
        <div className="card card-pad kpi"><span className="label">Net</span><span className="value lg num" style={{ color: net >= 0 ? 'var(--good)' : 'var(--critical)' }}>{fmtLKR(net, { sign: true })}</span><span className="sub">{income > 0 ? `${((net / income) * 100).toFixed(0)}% savings rate` : 'No income this period'}</span></div>
      </div>

      <div className="grid cols-2 rise rise-3" style={{ alignItems: 'stretch', marginBottom: 14 }}>
        <section className="card hoverable">
          <div className="card-pad">
            <div className="section-head">
              <h3>Income vs expenses</h3>
              <div className="legend">
                <span className="legend-item"><span className="swatch" style={{ background: 'var(--accent)' }} />Income</span>
                <span className="legend-item"><span className="swatch" style={{ background: 'var(--critical)' }} />Expenses</span>
              </div>
            </div>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={flowSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={3} barCategoryGap="26%">
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: 'var(--ink-muted)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10.5, fill: 'var(--ink-muted)' }} tickFormatter={(v) => fmtCompact(v)} width={54} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => fmtLKR(Number(v))} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} cursor={{ fill: 'var(--surface-2)' }} />
                  <Bar dataKey="income" name="Income" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={20} />
                  <Bar dataKey="expenses" name="Expenses" fill="var(--critical)" radius={[4, 4, 0, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
        <section className="card hoverable">
          <div className="card-pad">
            <div className="section-head"><h3>Spending by category</h3><span className="hint">{pf.periodType !== 'all' ? pf.title : 'All time'}</span></div>
            {catBreakdown.length === 0 ? <div className="empty">No expenses recorded for this period yet.</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 240, overflowY: 'auto' }}>
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

      <section className="card hoverable rise rise-4">
        <div className="card-pad">
          <div className="section-head"><h3>Transactions this period</h3><span className="hint">{sorted.length} transaction{sorted.length === 1 ? '' : 's'}</span></div>
          {loading ? <div className="empty">Loading…</div> : sorted.length === 0 ? <div className="empty">No transactions in this period.</div> : (
            <div className="table-scroll">
              <table>
                <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Account</th><th>Owner</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {sorted.slice(0, 100).map((t) => (
                    <tr key={t.id}>
                      <td className="num">{fmtDate(t.txn_date)}</td>
                      <td>{t.description || '—'}{clientName(t.client_id) ? <div className="sub" style={{ fontSize: 11 }}>{clientName(t.client_id)}</div> : null}</td>
                      <td>{catName(t.category_id)}</td>
                      <td>{accName(t.account_id)}</td>
                      <td><span className={`pill ${t.owner === 'business' ? 'brand' : 'accent'}`}>{OWNER_LABEL[t.owner]}</span></td>
                      <td className="num" style={{ color: t.amount >= 0 ? 'var(--good)' : 'var(--critical)' }}>{fmtLKR(t.amount, { sign: true })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Link to="/transactions" className="btn sm pill" style={{ marginTop: 14, display: 'inline-flex' }}>Open full transactions log</Link>
        </div>
      </section>
    </div>
  )
}
