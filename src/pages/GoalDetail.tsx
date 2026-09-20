import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useData } from '../lib/useData'
import { goalsApi, goalContributionsApi } from '../lib/api'
import Modal from '../components/Modal'
import { fmtLKR, fmtCompact, fmtDate, fmtMonthShort, todayISO } from '../lib/format'
import {
  GOAL_TYPES, GOAL_TYPE_LABEL, goalStatusInfo, requiredContribution, contributionPace,
  plannedVsActualSeries, nextMilestone, contributionBreakdown, generateGoalInsights,
  goalCashFlowImpact, scenarioMonthsToTarget,
} from '../lib/goalCalc'
import type { Goal } from '../lib/types'

const STATUS_STYLE: Record<string, { cls: string; label: string }> = {
  not_started: { cls: 'neutral', label: 'Not started' },
  on_track: { cls: 'good', label: 'On track' },
  behind: { cls: 'warning', label: 'Slightly behind' },
  at_risk: { cls: 'critical', label: 'At risk' },
  completed: { cls: 'good', label: 'Completed' },
  no_deadline: { cls: 'neutral', label: 'No deadline set' },
}

const INSIGHT_STYLE: Record<'positive' | 'watch' | 'risk' | 'action', { cls: string; label: string }> = {
  positive: { cls: 'good', label: 'On track' },
  watch: { cls: 'warning', label: 'Worth watching' },
  risk: { cls: 'critical', label: 'Risk' },
  action: { cls: 'brand', label: 'Recommendation' },
}

const emptyContribution = { contribution_date: todayISO(), amount: 0, note: '' }

export default function GoalDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { goals, goalContributions, transactions, refresh, loading } = useData()

  const goal = goals.find((g) => g.id === id)
  const contributions = useMemo(() => goalContributions.filter((c) => c.goal_id === id).sort((a, b) => b.contribution_date.localeCompare(a.contribution_date)), [goalContributions, id])

  const [editing, setEditing] = useState<Partial<Goal> | null>(null)
  const [logging, setLogging] = useState<typeof emptyContribution | null>(null)
  const [saving, setSaving] = useState(false)
  const [scenarioAmount, setScenarioAmount] = useState<number>(0)

  const info = goal ? goalStatusInfo(goal) : null
  const required = goal ? requiredContribution(goal) : null
  const pace = goal ? contributionPace(contributions, 3) : 0
  const series = useMemo(() => (goal ? plannedVsActualSeries(goal, contributions).map((p) => ({ ...p, monthLabel: fmtMonthShort(p.month) })) : []), [goal, contributions])
  const milestone = goal ? nextMilestone(goal, contributions) : null
  const breakdown = useMemo(() => contributionBreakdown(contributions, 12).map((b) => ({ ...b, monthLabel: fmtMonthShort(b.month) })), [contributions])
  const insights = useMemo(() => (goal ? generateGoalInsights(goal, contributions) : []), [goal, contributions])
  const cashFlow = useMemo(() => (goal ? goalCashFlowImpact(goal, transactions, 'personal') : null), [goal, transactions])
  const scenario = goal ? scenarioMonthsToTarget(goal, scenarioAmount) : { months: null, date: null }

  async function saveGoal() {
    if (!editing || !editing.name) return
    setSaving(true)
    try {
      if (editing.id) await goalsApi.update(editing.id, editing)
      await refresh('goals')
      setEditing(null)
    } finally { setSaving(false) }
  }

  async function saveContribution() {
    if (!logging || !goal || !logging.amount) return
    setSaving(true)
    try {
      await goalContributionsApi.create({ goal_id: goal.id, contribution_date: logging.contribution_date, amount: logging.amount, note: logging.note || null })
      await Promise.all([refresh('goals'), refresh('goalContributions')])
      setLogging(null)
    } finally { setSaving(false) }
  }

  async function removeContribution(cid: string) {
    if (!confirm('Delete this contribution?')) return
    await goalContributionsApi.remove(cid)
    await Promise.all([refresh('goals'), refresh('goalContributions')])
  }

  async function removeGoal() {
    if (!goal || !confirm('Delete this goal? This also deletes its logged contributions.')) return
    await goalsApi.remove(goal.id)
    await refresh('goals')
    navigate('/goals')
  }

  if (loading && !goal) return <div className="empty">Loading…</div>
  if (!goal) return (
    <div>
      <Link to="/goals" className="back-link">&larr; Back to goals</Link>
      <div className="empty" style={{ marginTop: 16 }}>Goal not found.</div>
    </div>
  )

  const statusStyle = STATUS_STYLE[info!.status]

  return (
    <div>
      <Link to="/goals" className="back-link rise">&larr; Back to goals</Link>

      {/* 1. Goal title, status and progress */}
      <div className="page-head rise rise-1">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>{goal.name}</h2>
            <span className="pill neutral">{GOAL_TYPE_LABEL[goal.type] ?? goal.type}</span>
            <span className={`pill ${statusStyle.cls}`}>{statusStyle.label}</span>
          </div>
          {goal.notes && <div className="sub" style={{ marginTop: 4 }}>{goal.notes}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn sm" onClick={() => setEditing(goal)}>Edit</button>
          <button className="btn sm danger" onClick={removeGoal}>Delete</button>
          <button className="btn primary sm" onClick={() => setLogging(emptyContribution)}>+ Log contribution</button>
        </div>
      </div>

      <div className="card card-pad rise rise-2" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span className="num" style={{ fontSize: 20, fontWeight: 800 }}>{fmtLKR(goal.current_amount)} <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--ink-muted)' }}>/ {fmtLKR(goal.target_amount)}</span></span>
          <span className="num" style={{ fontSize: 13, color: 'var(--ink-2)' }}>{info!.progressPct.toFixed(0)}%{info!.expectedProgressPct !== null ? ` (expected ${info!.expectedProgressPct.toFixed(0)}%)` : ''}</span>
        </div>
        <div className="progress-track" style={{ height: 10 }}>
          <div className="progress-fill" style={{ width: `${info!.progressPct}%`, background: statusStyle.cls === 'critical' ? 'var(--critical)' : statusStyle.cls === 'warning' ? 'var(--warning)' : 'var(--brand)' }} />
        </div>
      </div>

      {/* 2. Target, saved amount, remaining amount and deadline */}
      <div className="grid cols-4 rise rise-2" style={{ marginBottom: 14 }}>
        <div className="card card-pad kpi"><span className="label">Target</span><span className="value num">{fmtLKR(goal.target_amount)}</span></div>
        <div className="card card-pad kpi"><span className="label">Saved so far</span><span className="value num" style={{ color: 'var(--good)' }}>{fmtLKR(goal.current_amount)}</span></div>
        <div className="card card-pad kpi"><span className="label">Remaining</span><span className="value num">{fmtLKR(info!.remaining)}</span></div>
        <div className="card card-pad kpi">
          <span className="label">Deadline</span>
          <span className="value num" style={{ fontSize: 16 }}>{goal.target_date ? fmtDate(goal.target_date) : 'None set'}</span>
          {info!.daysLeft !== null && <span className="sub">{info!.daysLeft >= 0 ? `${info!.daysLeft} days left` : 'Past due'}</span>}
        </div>
      </div>

      {/* 3. Required daily / weekly / monthly contribution */}
      <section className="card hoverable rise rise-3" style={{ marginBottom: 14 }}>
        <div className="card-pad">
          <div className="section-head"><h3>Required contribution to stay on schedule</h3><span className="hint">Recent pace: {fmtLKR(pace)}/month</span></div>
          {required && required.monthly !== null ? (
            <div className="grid cols-3">
              <div className="card card-pad kpi"><span className="label">Daily</span><span className="value num">{fmtLKR(required.daily)}</span></div>
              <div className="card card-pad kpi"><span className="label">Weekly</span><span className="value num">{fmtLKR(required.weekly)}</span></div>
              <div className="card card-pad kpi"><span className="label">Monthly</span><span className="value num">{fmtLKR(required.monthly)}</span></div>
            </div>
          ) : (
            <div className="empty">{info!.status === 'completed' ? 'Goal is fully funded.' : 'Set a target date to calculate a required contribution rate.'}</div>
          )}
        </div>
      </section>

      {/* 4. Planned vs actual vs predicted chart */}
      <section className="card hoverable rise rise-3" style={{ marginBottom: 14 }}>
        <div className="card-pad">
          <div className="section-head"><h3>Planned vs actual vs predicted</h3></div>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 10.5, fill: 'var(--ink-muted)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                <YAxis tick={{ fontSize: 10.5, fill: 'var(--ink-muted)' }} tickFormatter={(v) => fmtCompact(v)} width={54} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => (v === null ? '—' : fmtLKR(Number(v)))} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11.5 }} />
                <Line type="monotone" dataKey="planned" name="Planned" stroke="var(--neutral)" strokeWidth={2} strokeDasharray="4 4" dot={false} connectNulls />
                <Line type="monotone" dataKey="actual" name="Actual" stroke="var(--brand)" strokeWidth={2.5} dot={{ r: 2.5 }} connectNulls />
                <Line type="monotone" dataKey="predicted" name="Predicted" stroke="var(--accent)" strokeWidth={2} strokeDasharray="2 3" dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <div className="grid cols-2 rise rise-4" style={{ alignItems: 'stretch', marginBottom: 14 }}>
        {/* 5. Next milestone */}
        <section className="card hoverable">
          <div className="card-pad">
            <div className="section-head"><h3>Next milestone</h3></div>
            {milestone ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span className="pill brand">{milestone.milestone.pct}% &middot; {fmtLKR(milestone.milestone.amount)}</span>
                </div>
                <div className="sub">{fmtLKR(milestone.amountNeeded)} more needed to reach it.</div>
                <div className="sub">{milestone.estimatedDate ? `Estimated around ${fmtDate(milestone.estimatedDate)} at the current pace.` : 'Log a few contributions to estimate a date.'}</div>
              </div>
            ) : <div className="empty">All milestones reached.</div>}
          </div>
        </section>

        {/* 8. Cash-flow impact */}
        <section className="card hoverable">
          <div className="card-pad">
            <div className="section-head"><h3>Cash-flow impact</h3><span className="hint">Personal, last 3 months</span></div>
            {cashFlow ? (
              <div>
                <div className="sub" style={{ marginBottom: 4 }}>Avg. monthly personal surplus: <span className="num" style={{ color: cashFlow.avgMonthlySurplus >= 0 ? 'var(--good)' : 'var(--critical)' }}>{fmtLKR(cashFlow.avgMonthlySurplus)}</span></div>
                {cashFlow.requiredMonthly !== null ? (
                  cashFlow.impactPct !== null ? (
                    <div className="sub">The required {fmtLKR(cashFlow.requiredMonthly)}/month would use <strong style={{ color: cashFlow.impactPct > 60 ? 'var(--critical)' : cashFlow.impactPct > 30 ? 'var(--warning)' : 'var(--good)' }}>{cashFlow.impactPct.toFixed(0)}%</strong> of that surplus.</div>
                  ) : <div className="sub">No positive personal surplus recently to compare against.</div>
                ) : <div className="empty">Goal is funded or has no deadline.</div>}
              </div>
            ) : <div className="empty">Not enough data.</div>}
          </div>
        </section>
      </div>

      {/* 6. Contribution and growth breakdown */}
      <section className="card hoverable rise rise-4" style={{ marginBottom: 14 }}>
        <div className="card-pad">
          <div className="section-head"><h3>Contribution &amp; growth breakdown</h3><span className="hint">Last 12 months</span></div>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={breakdown} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 10.5, fill: 'var(--ink-muted)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                <YAxis tick={{ fontSize: 10.5, fill: 'var(--ink-muted)' }} tickFormatter={(v) => fmtCompact(v)} width={54} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => fmtLKR(Number(v))} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} cursor={{ fill: 'var(--surface-2)' }} />
                <Bar dataKey="amount" name="Contributed" fill="var(--brand)" radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* 7. AI recommendation */}
      <section className="card hoverable rise rise-4" style={{ marginBottom: 14 }}>
        <div className="card-pad">
          <div className="section-head"><h3>AI recommendation</h3><span className="hint">Computed from this goal's actual numbers</span></div>
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

      {/* 9. Recent transactions and activity */}
      <section className="card hoverable rise rise-5" style={{ marginBottom: 14 }}>
        <div className="card-pad">
          <div className="section-head"><h3>Recent contributions &amp; activity</h3><span className="hint">{contributions.length} logged</span></div>
          {contributions.length === 0 ? (
            <div className="empty">No contributions logged yet. Use "+ Log contribution" to start tracking real progress.</div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead><tr><th>Date</th><th>Note</th><th className="num">Amount</th><th /></tr></thead>
                <tbody>
                  {contributions.slice(0, 50).map((c) => (
                    <tr key={c.id}>
                      <td>{fmtDate(c.contribution_date)}</td>
                      <td>{c.note || '—'}</td>
                      <td className="num" style={{ color: c.amount >= 0 ? 'var(--good)' : 'var(--critical)' }}>{fmtLKR(c.amount, { sign: true })}</td>
                      <td><button className="btn sm danger" onClick={() => removeContribution(c.id)}>Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* 10. Scenario calculator */}
      <section className="card hoverable rise rise-6">
        <div className="card-pad">
          <div className="section-head"><h3>Scenario calculator</h3><span className="hint">What if I contribute a fixed amount every month?</span></div>
          <div className="field-row" style={{ alignItems: 'flex-end' }}>
            <div className="field">
              <label>Monthly contribution</label>
              <input type="number" value={scenarioAmount || ''} placeholder={required?.monthly ? Math.round(required.monthly).toString() : '0'} onChange={(e) => setScenarioAmount(Number(e.target.value))} />
            </div>
            <div className="card card-pad kpi" style={{ flex: 1 }}>
              <span className="label">Time to reach target</span>
              {scenario.months === null ? (
                <span className="sub">Enter a monthly amount to see a projection.</span>
              ) : scenario.months === 0 ? (
                <span className="value num" style={{ color: 'var(--good)' }}>Already reached</span>
              ) : (
                <>
                  <span className="value num">{scenario.months} month{scenario.months === 1 ? '' : 's'}</span>
                  <span className="sub">Around {fmtDate(scenario.date)}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {editing && (
        <Modal title="Edit goal" onClose={() => setEditing(null)} footer={<>
          <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn primary" onClick={saveGoal} disabled={saving || !editing.name}>{saving ? 'Saving…' : 'Save'}</button>
        </>}>
          <div className="field"><label>Name</label><input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus /></div>
          <div className="field"><label>Type</label>
            <select value={editing.type ?? 'other'} onChange={(e) => setEditing({ ...editing, type: e.target.value })}>
              {GOAL_TYPES.map((t) => <option key={t} value={t}>{GOAL_TYPE_LABEL[t]}</option>)}
            </select>
          </div>
          <div className="field-row">
            <div className="field"><label>Target amount</label><input type="number" value={editing.target_amount ?? 0} onChange={(e) => setEditing({ ...editing, target_amount: Number(e.target.value) })} /></div>
            <div className="field"><label>Starting amount</label><input type="number" value={editing.starting_amount ?? 0} onChange={(e) => setEditing({ ...editing, starting_amount: Number(e.target.value) })} /></div>
          </div>
          <div className="field"><label>Target date</label><input type="date" value={editing.target_date ?? ''} onChange={(e) => setEditing({ ...editing, target_date: e.target.value })} /></div>
          <div className="field"><label>Notes</label><input value={editing.notes ?? ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></div>
        </Modal>
      )}

      {logging && (
        <Modal title="Log a contribution" onClose={() => setLogging(null)} footer={<>
          <button className="btn" onClick={() => setLogging(null)}>Cancel</button>
          <button className="btn primary" onClick={saveContribution} disabled={saving || !logging.amount}>{saving ? 'Saving…' : 'Save'}</button>
        </>}>
          <div className="field-row">
            <div className="field"><label>Date</label><input type="date" value={logging.contribution_date} onChange={(e) => setLogging({ ...logging, contribution_date: e.target.value })} /></div>
            <div className="field"><label>Amount</label><input type="number" value={logging.amount || ''} onChange={(e) => setLogging({ ...logging, amount: Number(e.target.value) })} autoFocus /></div>
          </div>
          <div className="field"><label>Note</label><input value={logging.note} onChange={(e) => setLogging({ ...logging, note: e.target.value })} placeholder="Optional" /></div>
        </Modal>
      )}
    </div>
  )
}
