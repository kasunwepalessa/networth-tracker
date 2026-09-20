import { useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { useData } from '../lib/useData'
import { buildCashForecast } from '../lib/calc'
import { fmtLKR, fmtCompact, fmtDate } from '../lib/format'

export default function Forecast() {
  const { accounts, transactions, liabilities, fixedDeposits, invoices, loading } = useData()

  const forecast = useMemo(
    () => buildCashForecast(accounts, transactions, liabilities, fixedDeposits, invoices, 30),
    [accounts, transactions, liabilities, fixedDeposits, invoices],
  )

  const chartData = forecast.days.map((d) => ({ date: d.date, balance: Math.round(d.balance) }))
  const overdueReceivables = invoices.filter((i) => i.status === 'overdue').reduce((s, i) => s + i.balance, 0)

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>30-day cash forecast</h2>
          <div className="sub">Projected from recurring transactions, loan payments due, FD maturities, and invoices expected</div>
        </div>
      </div>

      {loading ? <div className="empty">Loading…</div> : (
        <>
          <div className="grid cols-4" style={{ marginBottom: 16 }}>
            <div className="card card-pad kpi">
              <span className="label">Cash today</span>
              <span className="value num">{fmtLKR(forecast.startBalance)}</span>
            </div>
            <div className="card card-pad kpi">
              <span className="label">Predicted balance in 30 days</span>
              <span className="value num" style={{ color: forecast.endBalance < 0 ? 'var(--critical)' : undefined }}>{fmtLKR(forecast.endBalance)}</span>
            </div>
            <div className="card card-pad kpi">
              <span className="label">Lowest point</span>
              <span className="value num" style={{ color: forecast.minBalance < 0 ? 'var(--critical)' : undefined }}>{fmtLKR(forecast.minBalance)}</span>
              <span className="sub">Around {fmtDate(forecast.minDate)}</span>
            </div>
            <div className="card card-pad kpi">
              <span className="label">Safe to spend</span>
              <span className="value num" style={{ color: 'var(--good)' }}>{fmtLKR(forecast.safeToSpend)}</span>
              <span className="sub">Without dipping below Rs 0 in the next 30 days</span>
            </div>
          </div>

          {overdueReceivables > 0 && (
            <div className="alert warning" style={{ marginBottom: 16 }}>
              {fmtLKR(overdueReceivables)} in overdue invoices is <strong>not</strong> included in this forecast — payment timing on overdue amounts is unpredictable.
            </div>
          )}

          <section className="card" style={{ marginBottom: 16 }}>
            <div className="card-pad">
              <div className="section-head"><h3>Projected cash balance</h3></div>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="bal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--brand)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10.5, fill: 'var(--ink-muted)' }} tickFormatter={(d) => fmtDate(d)} minTickGap={30} />
                    <YAxis tick={{ fontSize: 10.5, fill: 'var(--ink-muted)' }} tickFormatter={(v) => fmtCompact(v)} width={60} />
                    <ReferenceLine y={0} stroke="var(--critical)" strokeDasharray="4 4" />
                    <Tooltip formatter={(v) => fmtLKR(Number(v))} labelFormatter={(d) => fmtDate(d as string)} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }} />
                    <Area type="monotone" dataKey="balance" stroke="var(--brand)" strokeWidth={2.25} fill="url(#bal)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-pad">
              <div className="section-head"><h3>Expected cash events (next 30 days)</h3></div>
              {forecast.events.length === 0 ? (
                <div className="empty">No recurring transactions, loan due dates, FD maturities, or invoice due dates in the next 30 days. Mark transactions as "Recurring" to include them here.</div>
              ) : (
                <div className="table-scroll"><table>
                  <thead><tr><th>Date</th><th>Event</th><th className="num">Amount</th></tr></thead>
                  <tbody>
                    {forecast.events.map((e, i) => (
                      <tr key={i}>
                        <td>{fmtDate(e.date)}</td>
                        <td>{e.label}</td>
                        <td className="num" style={{ color: e.amount >= 0 ? 'var(--good)' : 'var(--critical)' }}>{fmtLKR(e.amount, { sign: true })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
