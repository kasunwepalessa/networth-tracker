import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../../lib/useData'
import {
  accountsCashTotal, totalAssets, totalLiabilities, monthTransactions, sumIncome, sumExpenses, financialHealthScore,
} from '../../lib/calc'
import { fmtLKR, monthKey, daysUntil, fmtDate } from '../../lib/format'
import { useCountUp } from '../../lib/useCountUp'

export default function HealthDetail() {
  const { accounts, assets, investments, fixedDeposits, liabilities, transactions, invoices, budgets, categories, loading } = useData()

  const nwAssets = totalAssets(accounts, assets, investments, fixedDeposits)
  const nwLiabilities = totalLiabilities(accounts, liabilities)
  const netWorth = nwAssets - nwLiabilities
  const cash = accountsCashTotal(accounts)

  const thisMonth = monthKey()
  const monthTxns = monthTransactions(transactions, thisMonth)
  const income = sumIncome(monthTxns)
  const expenses = sumExpenses(monthTxns)
  const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0

  const overdueLiabilities = liabilities.filter((l) => l.next_due_date && daysUntil(l.next_due_date)! < 0)
  const overdueInvoices = invoices.filter((i) => i.status === 'overdue')

  const health = financialHealthScore({
    netWorth, cash, monthlyExpenses: expenses || 1,
    overdueLiabilityCount: overdueLiabilities.length, overdueInvoiceCount: overdueInvoices.length,
    savingsRatePct: savingsRate, liabilityToAssetRatio: nwAssets > 0 ? nwLiabilities / nwAssets : 0,
  })
  const scoreAnimated = useCountUp(health.score)
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
    overdueInvoices.forEach((i) => list.push({ level: 'critical', text: `Invoice ${i.invoice_number ?? i.id.slice(0, 8)} overdue: ${fmtLKR(i.balance)}` }))
    budgets.filter((b) => b.month === thisMonth).forEach((b) => {
      const cat = categories.find((c) => c.id === b.category_id)
      if (!cat) return
      const spent = monthTxns.filter((t) => t.category_id === b.category_id && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
      if (spent > b.limit_amount) list.push({ level: 'warning', text: `${cat.name} spending (${fmtLKR(spent)}) is over budget (${fmtLKR(b.limit_amount)})` })
    })
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, liabilities, fixedDeposits, invoices, budgets, categories, monthTxns, thisMonth])

  return (
    <div>
      <Link to="/" className="back-link rise">&larr; Back to dashboard</Link>
      <div className="page-head rise rise-1">
        <div>
          <h2>Financial health</h2>
          <div className="sub">What's driving your score, and what needs attention right now</div>
        </div>
      </div>

      <section className="card hoverable rise rise-2" style={{ marginBottom: 14 }}>
        <div className="card-pad hero-stat">
          <span className="hero-value num" style={{ color: healthColor }}>{Math.round(scoreAnimated)} / 100</span>
          <div className="hero-label">{health.label}</div>
          <div className="progress-track" style={{ margin: '14px auto 0', maxWidth: 420 }}>
            <div className="progress-fill" style={{ width: `${health.score}%`, background: healthColor, transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)' }} />
          </div>
        </div>
      </section>

      <section className="card hoverable rise rise-3" style={{ marginBottom: 14 }}>
        <div className="card-pad">
          <div className="section-head"><h3>Score factors</h3></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {health.factors.map((f) => (
              <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{f.label}</span>
                    <span className="num" style={{ fontSize: 12.5, fontWeight: 800, color: f.contribution >= 0 ? 'var(--good)' : 'var(--critical)' }}>{f.contribution >= 0 ? '+' : ''}{f.contribution.toFixed(0)} pts</span>
                  </div>
                  <span className="sub">{f.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card hoverable rise rise-4">
        <div className="card-pad">
          <div className="section-head"><h3>Alerts</h3><span className="hint">{alerts.length} active</span></div>
          {loading ? <div className="empty">Loading…</div> : alerts.length === 0 ? <div className="empty">Nothing needs attention right now.</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {alerts.map((a, i) => <div key={i} className={`alert ${a.level}`}>{a.text}</div>)}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
