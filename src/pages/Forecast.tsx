import { useMemo, useState } from 'react'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useData } from '../lib/useData'
import {
  periodMonths, PERIOD_LABEL, type ForecastPeriod,
  buildLongRangeForecast, buildNetWorthProjection, buildInvestmentForecast, buildDebtForecast,
  buildGoalForecast, buildForecastOverview, generateForecastInsights,
} from '../lib/forecastCalc'
import { fmtLKR, fmtCompact, fmtDate, fmtMonthShort } from '../lib/format'
import { useCountUp } from '../lib/useCountUp'
import { INVESTMENT_TYPE_LABEL, LIABILITY_TYPE_LABEL } from '../lib/format'

const PERIODS: ForecastPeriod[] = ['1m', '3m', '6m', '1y', '5y', 'custom']

const INSIGHT_STYLE: Record<string, { cls: string; label: string }> = {
  positive: { cls: 'good', label: 'Good sign' },
  watch: { cls: 'warning', label: 'Watch' },
  risk: { cls: 'critical', label: 'Risk' },
  action: { cls: 'brand', label: 'Suggestion' },
}

export default function Forecast() {
  const {
    accounts, assets, investments, fixedDeposits, liabilities, transactions, invoices,
    subscriptions, goals, goalContributions, loading,
  } = useData()

  const [period, setPeriod] = useState<ForecastPeriod>('6m')
  const [customMonths, setCustomMonths] = useState(24)
  const horizonMonths = periodMonths(period, customMonths)

  const cashFlow = useMemo(
    () => buildLongRangeForecast({ accounts, transactions, liabilities, fixedDeposits, invoices, subscriptions, goals, goalContributions, horizonMonths }),
    [accounts, transactions, liabilities, fixedDeposits, invoices, subscriptions, goals, goalContributions, horizonMonths],
  )
  const netWorthProjection = useMemo(
    () => buildNetWorthProjection({ accounts, assets, investments, fixedDeposits, liabilities, cashFlow, horizonMonths }),
    [accounts, assets, investments, fixedDeposits, liabilities, cashFlow, horizonMonths],
  )
  const investmentForecast = useMemo(() => buildInvestmentForecast(investments, horizonMonths), [investments, horizonMonths])
  const debtForecast = useMemo(() => buildDebtForecast(liabilities, horizonMonths), [liabilities, horizonMonths])
  const goalForecast = useMemo(() => buildGoalForecast(goals, goalContributions, horizonMonths), [goals, goalContributions, horizonMonths])
  const overview = useMemo(
    () => buildForecastOverview({ accounts, assets, investments, fixedDeposits, liabilities, transactions, invoices, horizonMonths, cashFlow, netWorthProjection }),
    [accounts, assets, investments, fixedDeposits, liabilities, transactions, invoices, horizonMonths, cashFlow, netWorthProjection],
  )
  const insights = useMemo(
    () => generateForecastInsights({ overview, cashFlow, debtForecast, goalForecast }),
    [overview, cashFlow, debtForecast, goalForecast],
  )

  const netWorthAnimated = useCountUp(overview.predictedNetWorth)
  const nwChartData = netWorthProjection.map((p) => ({ ...p }))

  const nearTermCutoff = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + Math.min(45, Math.max(1, Math.round(horizonMonths * 30.44))))
    return d.toISOString().slice(0, 10)
  }, [horizonMonths])
  const nearTermEvents = cashFlow.events.filter((e) => e.date <= nearTermCutoff)

  const overdueReceivables = invoices.filter((i) => i.status === 'overdue').reduce((s, i) => s + i.balance, 0)

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Forecast</h2>
          <div className="sub">Predicted balance, net worth, and cash flow over {PERIOD_LABEL[period].toLowerCase()}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {period === 'custom' && (
            <div className="field" style={{ gap: 0 }}>
              <input
                type="number" min={1} max={120} value={customMonths}
                onChange={(e) => setCustomMonths(Number(e.target.value))}
                style={{ width: 78, padding: '7px 9px', fontSize: 12.5 }}
              />
            </div>
          )}
          <div className="tabs pill-tabs" style={{ marginBottom: 0 }}>
            {PERIODS.map((p) => (
              <button key={p} className={period === p ? 'active' : ''} onClick={() => setPeriod(p)}>
                {p === 'custom' ? 'Custom' : PERIOD_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? <div className="empty">Loading…</div> : (
        <>
          {overdueReceivables > 0 && (
            <div className="alert warning" style={{ marginBottom: 16 }}>
              {fmtLKR(overdueReceivables)} in overdue invoices is <strong>not</strong> included in this forecast — payment timing on overdue amounts is unpredictable.
            </div>
          )}
          {cashFlow.negativeBalanceDate && (
            <div className="alert critical" style={{ marginBottom: 16 }}>
              Your cash balance is projected to go <strong>negative around {fmtDate(cashFlow.negativeBalanceDate)}</strong> at the current pace.
            </div>
          )}
          {!cashFlow.negativeBalanceDate && cashFlow.lowBalanceDate && (
            <div className="alert warning" style={{ marginBottom: 16 }}>
              Your cash balance may fall below {fmtLKR(cashFlow.lowBalanceThreshold)} around <strong>{fmtDate(cashFlow.lowBalanceDate)}</strong>.
            </div>
          )}

          {/* Overview */}
          <section className="card hoverable" style={{ marginBottom: 14 }}>
            <div className="card-pad">
              <div className="hero-stat" style={{ paddingBottom: 6 }}>
                <span className="hero-value num" style={{ color: overview.predictedNetWorth >= 0 ? 'var(--ink-1)' : 'var(--critical)' }}>{fmtLKR(netWorthAnimated)}</span>
                <div className="hero-label">Predicted net worth by {fmtDate(overview.endDate)}</div>
              </div>
              <div className="sub" style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 14px', fontSize: 12.5, color: 'var(--ink-2)' }}>{overview.narrative}</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span className="pill brand">Health {overview.healthScore}/100 · {overview.healthLabel}</span>
                <span className={`pill ${overview.confidencePct >= 75 ? 'good' : overview.confidencePct >= 50 ? 'warning' : 'critical'}`}>{overview.confidenceLabel} · {overview.confidencePct}%</span>
                <span className={`pill ${overview.netWorthChange >= 0 ? 'good' : 'critical'}`}>{overview.netWorthChange >= 0 ? '+' : '−'}{fmtCompact(Math.abs(overview.netWorthChange))} vs today</span>
              </div>
            </div>
          </section>

          <div className="grid cols-5" style={{ marginBottom: 14 }}>
            <div className="card card-pad kpi">
              <span className="label">Predicted bank balance</span>
              <span className="value num" style={{ color: overview.predictedBankBalance < 0 ? 'var(--critical)' : undefined }}>{fmtCompact(overview.predictedBankBalance)}</span>
            </div>
            <div className="card card-pad kpi">
              <span className="label">Expected income</span>
              <span className="value num" style={{ color: 'var(--good)' }}>{fmtCompact(overview.expectedIncome)}</span>
            </div>
            <div className="card card-pad kpi">
              <span className="label">Expected expenses</span>
              <span className="value num" style={{ color: 'var(--critical)' }}>{fmtCompact(overview.expectedExpenses)}</span>
            </div>
            <div className="card card-pad kpi">
              <span className="label">Expected savings</span>
              <span className="value num" style={{ color: overview.expectedSavings >= 0 ? 'var(--good)' : 'var(--critical)' }}>{fmtCompact(overview.expectedSavings)}</span>
              <span className="sub">{overview.savingsRatePct.toFixed(0)}% savings rate</span>
            </div>
            <div className="card card-pad kpi">
              <span className="label">Monthly surplus / deficit</span>
              <span className="value num" style={{ color: overview.monthlyCashSurplus >= 0 ? 'var(--good)' : 'var(--critical)' }}>{fmtCompact(overview.monthlyCashSurplus)}</span>
              <span className="sub">avg per month</span>
            </div>
          </div>

          <div className="grid cols-3" style={{ marginBottom: 16 }}>
            <div className="card card-pad kpi">
              <span className="label">Investment value at horizon</span>
              <span className="value num">{fmtCompact(overview.expectedInvestmentValue)}</span>
            </div>
            <div className="card card-pad kpi">
              <span className="label">Debt balance at horizon</span>
              <span className="value num" style={{ color: 'var(--critical)' }}>{fmtCompact(overview.expectedDebtBalance)}</span>
            </div>
            <div className="card card-pad kpi">
              <span className="label">Net worth today</span>
              <span className="value num">{fmtCompact(overview.netWorthToday)}</span>
            </div>
          </div>

          {/* Net worth projection */}
          <section className="card" style={{ marginBottom: 16 }}>
            <div className="card-pad">
              <div className="section-head"><h3>Net worth projection</h3><span className="hint">Assets vs liabilities, projected monthly</span></div>
              {nwChartData.length < 2 ? <div className="empty">Not enough data to project yet.</div> : (
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={nwChartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="nwFore" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.32} />
                          <stop offset="95%" stopColor="var(--brand)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 10.5, fill: 'var(--ink-muted)' }} tickFormatter={(m) => fmtMonthShort(m)} minTickGap={28} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                      <YAxis tick={{ fontSize: 10.5, fill: 'var(--ink-muted)' }} tickFormatter={(v) => fmtCompact(v)} width={60} axisLine={false} tickLine={false} />
                      <ReferenceLine y={0} stroke="var(--critical)" strokeDasharray="4 4" />
                      <Tooltip formatter={(v, name) => [fmtLKR(Number(v)), name]} labelFormatter={(m) => fmtMonthShort(m as string)} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11.5 }} />
                      <Area type="monotone" dataKey="netWorth" name="Net worth" stroke="var(--brand)" strokeWidth={2.25} fill="url(#nwFore)" dot={false} />
                      <Line type="monotone" dataKey="assets" name="Assets" stroke="var(--cat-1)" strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="liabilities" name="Liabilities" stroke="var(--critical)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </section>

          {/* Cash-flow forecast */}
          <section className="card" style={{ marginBottom: 16 }}>
            <div className="card-pad">
              <div className="section-head"><h3>Cash-flow forecast</h3><span className="hint">Lowest point {fmtLKR(cashFlow.minBalance)} around {fmtDate(cashFlow.minDate)}</span></div>
              <div className="table-scroll" style={{ maxHeight: 360, overflowY: 'auto' }}>
                <table>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
                    <tr><th>Month</th><th className="num">Opening</th><th className="num">Income</th><th className="num">Bills</th><th className="num">Variable</th><th className="num">Debt</th><th className="num">Goals</th><th className="num">Closing</th><th className="num">Free cash</th></tr>
                  </thead>
                  <tbody>
                    {cashFlow.monthly.map((r) => (
                      <tr key={r.month}>
                        <td>{fmtMonthShort(r.month)} {r.month.slice(0, 4)}</td>
                        <td className="num">{fmtCompact(r.opening)}</td>
                        <td className="num" style={{ color: 'var(--good)' }}>{fmtCompact(r.income)}</td>
                        <td className="num">{fmtCompact(r.recurringBills)}</td>
                        <td className="num">{fmtCompact(r.variableExpenses)}</td>
                        <td className="num">{fmtCompact(r.debtPayments)}</td>
                        <td className="num">{fmtCompact(r.goalContributions)}</td>
                        <td className="num" style={{ color: r.closing < 0 ? 'var(--critical)' : undefined, fontWeight: 700 }}>{fmtCompact(r.closing)}</td>
                        <td className="num" style={{ color: r.freeCashAfterCommitments >= 0 ? 'var(--good)' : 'var(--critical)' }}>{fmtCompact(r.freeCashAfterCommitments)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="card" style={{ marginBottom: 16 }}>
            <div className="card-pad">
              <div className="section-head"><h3>Upcoming cash events</h3><span className="hint">Next {Math.min(45, Math.round(horizonMonths * 30.44))} days — {nearTermEvents.length} shown</span></div>
              {nearTermEvents.length === 0 ? (
                <div className="empty">No recurring transactions, loan due dates, FD maturities, or invoice due dates coming up. Mark transactions as "Recurring" to include them here.</div>
              ) : (
                <div className="table-scroll" style={{ maxHeight: 320, overflowY: 'auto' }}>
                  <table>
                    <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}><tr><th>Date</th><th>Event</th><th className="num">Amount</th></tr></thead>
                    <tbody>
                      {nearTermEvents.map((e, i) => (
                        <tr key={i}>
                          <td>{fmtDate(e.date)}</td>
                          <td>{e.label}</td>
                          <td className="num" style={{ color: e.amount >= 0 ? 'var(--good)' : 'var(--critical)' }}>{fmtLKR(e.amount, { sign: true })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          <div className="grid cols-2" style={{ marginBottom: 16 }}>
            {/* Investment forecast */}
            <section className="card">
              <div className="card-pad">
                <div className="section-head"><h3>Investment forecast</h3><span className="hint">Low / expected / high, by asset type</span></div>
                {investmentForecast.length === 0 ? <div className="empty">No investments recorded yet.</div> : (
                  <div className="table-scroll">
                    <table>
                      <thead><tr><th>Investment</th><th className="num">Now</th><th className="num">Low</th><th className="num">Expected</th><th className="num">High</th></tr></thead>
                      <tbody>
                        {investmentForecast.map((r) => (
                          <tr key={r.investment.id}>
                            <td>{r.investment.name}<div className="sub" style={{ fontSize: 11 }}>{INVESTMENT_TYPE_LABEL[r.investment.type]}</div></td>
                            <td className="num">{fmtCompact(r.currentValue)}</td>
                            <td className="num" style={{ color: 'var(--critical)' }}>{fmtCompact(r.lowValue)}</td>
                            <td className="num" style={{ fontWeight: 700 }}>{fmtCompact(r.expectedValue)}</td>
                            <td className="num" style={{ color: 'var(--good)' }}>{fmtCompact(r.highValue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            {/* Debt forecast */}
            <section className="card">
              <div className="card-pad">
                <div className="section-head"><h3>Debt forecast</h3><span className="hint">Highest-interest first (avalanche order)</span></div>
                {debtForecast.length === 0 ? <div className="empty">No liabilities recorded — nicely done.</div> : (
                  <div className="table-scroll">
                    <table>
                      <thead><tr><th>Liability</th><th className="num">Balance</th><th>Payoff date</th><th className="num">+Extra/mo saves</th></tr></thead>
                      <tbody>
                        {debtForecast.map((r) => (
                          <tr key={r.liability.id}>
                            <td>{r.liability.name}<div className="sub" style={{ fontSize: 11 }}>{LIABILITY_TYPE_LABEL[r.liability.type]} · {r.liability.interest_rate ?? 0}%</div></td>
                            <td className="num" style={{ color: 'var(--critical)' }}>{fmtCompact(r.balanceAtHorizon)}</td>
                            <td>{r.payoffDate ? fmtDate(r.payoffDate) : '—'}</td>
                            <td className="num" style={{ color: r.extraPaymentInterestSaved > 0 ? 'var(--good)' : undefined }}>
                              {r.extraPaymentInterestSaved > 0 ? `${fmtCompact(r.extraPaymentInterestSaved)} interest` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Goal forecast */}
          <section className="card" style={{ marginBottom: 16 }}>
            <div className="card-pad">
              <div className="section-head"><h3>Goal forecast</h3><span className="hint">Projected outcome at each goal's deadline</span></div>
              {goalForecast.length === 0 ? <div className="empty">No goals set yet.</div> : (
                <div className="grid cols-3">
                  {goalForecast.map((g) => (
                    <div key={g.goal.id} className="card" style={{ boxShadow: 'none', border: '1px solid var(--border)' }}>
                      <div className="card-pad" style={{ padding: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
                          <strong style={{ fontSize: 13 }}>{g.goal.name}</strong>
                          <span className={`pill ${g.onTrack ? 'good' : 'warning'}`}>{g.statusLabel}</span>
                        </div>
                        <div className="sub">
                          {g.requiredMonthly !== null ? `Needs ${fmtCompact(g.requiredMonthly)}/mo to hit deadline` : 'No deadline set'}
                        </div>
                        {g.projectedGapAtDeadline !== null && (
                          <div className="sub" style={{ color: g.projectedGapAtDeadline >= 0 ? 'var(--good)' : 'var(--critical)', marginTop: 4, fontWeight: 600 }}>
                            {g.projectedGapAtDeadline >= 0 ? `On pace with ${fmtCompact(g.projectedGapAtDeadline)} to spare` : `Projected to fall short by ${fmtCompact(Math.abs(g.projectedGapAtDeadline))}`}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* AI insights */}
          <section className="card">
            <div className="card-pad">
              <div className="section-head"><h3>Forecast insights</h3><span className="hint">Rule-based, from this forecast's own numbers</span></div>
              {insights.length === 0 ? <div className="empty">Nothing notable to flag — your forecast looks steady.</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {insights.map((ins, i) => {
                    const style = INSIGHT_STYLE[ins.kind]
                    return (
                      <div key={i} className="sub-row" style={{ padding: '8px 0', alignItems: 'flex-start' }}>
                        <span className={`pill ${style.cls}`} style={{ flex: 'none', marginTop: 1 }}>{style.label}</span>
                        <span style={{ fontSize: 12.5, color: 'var(--ink-2)', flex: 1 }}>{ins.text}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
