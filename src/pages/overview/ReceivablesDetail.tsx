import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../../lib/useData'
import { fmtLKR, fmtDate } from '../../lib/format'
import { useCountUp } from '../../lib/useCountUp'

export default function ReceivablesDetail() {
  const { invoices, clients, loading } = useData()

  const outstanding = invoices.filter((i) => i.status !== 'draft' && i.status !== 'paid')
  const overdue = invoices.filter((i) => i.status === 'overdue')
  const outstandingTotal = outstanding.reduce((s, i) => s + i.balance, 0)
  const overdueTotal = overdue.reduce((s, i) => s + i.balance, 0)
  const draftCount = invoices.filter((i) => i.status === 'draft').length
  const outstandingAnimated = useCountUp(outstandingTotal)

  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.name ?? '—'

  const sorted = useMemo(
    () => [...invoices].sort((a, b) => (b.due_date ?? '').localeCompare(a.due_date ?? '')),
    [invoices],
  )

  return (
    <div>
      <Link to="/" className="back-link rise">&larr; Back to dashboard</Link>
      <div className="page-head rise rise-1">
        <div>
          <h2>Receivables</h2>
          <div className="sub">Invoices sent, outstanding and overdue</div>
        </div>
        <Link to="/invoices" className="btn primary pill">Open invoices &amp; Zoho sync</Link>
      </div>

      <div className="grid cols-3 rise rise-2" style={{ marginBottom: 14 }}>
        <div className="card card-pad kpi"><span className="label">Outstanding</span><span className="value lg num" style={{ color: 'var(--critical)' }}>{fmtLKR(outstandingAnimated)}</span><span className="sub">{outstanding.length} invoice{outstanding.length === 1 ? '' : 's'}</span></div>
        <div className="card card-pad kpi"><span className="label">Overdue</span><span className="value lg num" style={{ color: 'var(--critical)' }}>{fmtLKR(overdueTotal)}</span><span className="sub">{overdue.length} overdue</span></div>
        <div className="card card-pad kpi"><span className="label">Drafts</span><span className="value lg num">{draftCount}</span><span className="sub">Not yet sent</span></div>
      </div>

      <section className="card hoverable rise rise-3">
        <div className="card-pad">
          <div className="section-head"><h3>All invoices</h3></div>
          {loading ? <div className="empty">Loading…</div> : sorted.length === 0 ? <div className="empty">No invoices yet.</div> : (
            <div className="table-scroll">
              <table>
                <thead><tr><th>Invoice</th><th>Client</th><th>Status</th><th>Due</th><th className="num">Amount</th><th className="num">Balance</th></tr></thead>
                <tbody>
                  {sorted.map((i) => (
                    <tr key={i.id}>
                      <td>{i.invoice_number ?? i.id.slice(0, 8)}</td>
                      <td>{clientName(i.client_id)}</td>
                      <td><span className={`pill ${i.status === 'paid' ? 'good' : i.status === 'overdue' ? 'critical' : i.status === 'sent' ? 'brand' : 'neutral'}`}>{i.status}</span></td>
                      <td>{fmtDate(i.due_date)}</td>
                      <td className="num">{fmtLKR(i.amount)}</td>
                      <td className="num" style={{ color: i.balance > 0 ? 'var(--critical)' : 'var(--ink-1)' }}>{fmtLKR(i.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
