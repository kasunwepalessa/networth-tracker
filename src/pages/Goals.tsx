import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../lib/useData'
import { goalsApi } from '../lib/api'
import Modal from '../components/Modal'
import { fmtLKR, fmtDate, daysUntil } from '../lib/format'
import { GOAL_TYPES, GOAL_TYPE_LABEL, goalStatusInfo } from '../lib/goalCalc'
import type { Goal } from '../lib/types'

const empty: Partial<Goal> = { name: '', type: 'other', target_amount: 0, target_date: '', starting_amount: 0, current_amount: 0, notes: '' }

const STATUS_STYLE: Record<string, { cls: string; label: string }> = {
  not_started: { cls: 'neutral', label: 'Not started' },
  on_track: { cls: 'good', label: 'On track' },
  behind: { cls: 'warning', label: 'Slightly behind' },
  at_risk: { cls: 'critical', label: 'At risk' },
  completed: { cls: 'good', label: 'Completed' },
  no_deadline: { cls: 'neutral', label: 'No deadline' },
}

export default function Goals() {
  const { goals, refresh, loading } = useData()
  const navigate = useNavigate()
  const [editing, setEditing] = useState<Partial<Goal> | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!editing || !editing.name) return
    setSaving(true)
    try {
      if (editing.id) await goalsApi.update(editing.id, editing)
      else await goalsApi.create(editing)
      await refresh('goals')
      setEditing(null)
    } finally { setSaving(false) }
  }
  async function remove(id: string) {
    if (!confirm('Delete this goal? This also deletes its logged contributions.')) return
    await goalsApi.remove(id)
    await refresh('goals')
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Goals</h2>
          <div className="sub">Emergency fund, big purchases, and long-term targets</div>
        </div>
        <button className="btn primary" onClick={() => setEditing(empty)}>+ Add goal</button>
      </div>

      {loading ? <div className="empty">Loading…</div> : goals.length === 0 ? (
        <div className="card"><div className="card-pad empty">No goals yet — set a savings target and track progress toward it.</div></div>
      ) : (
        <div className="grid cols-3">
          {goals.map((g) => {
            const info = goalStatusInfo(g)
            const statusStyle = STATUS_STYLE[info.status]
            const d = daysUntil(g.target_date)
            return (
              <div key={g.id} className="card card-pad hoverable" style={{ cursor: 'pointer' }} onClick={() => navigate(`/goals/${g.id}`)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, gap: 6, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 14 }}>{g.name}</strong>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span className="pill neutral">{GOAL_TYPE_LABEL[g.type] ?? g.type}</span>
                    <span className={`pill ${statusStyle.cls}`}>{statusStyle.label}</span>
                  </div>
                </div>
                <div className="num" style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{fmtLKR(g.current_amount)} <span style={{ fontWeight: 500, fontSize: 12, color: 'var(--ink-muted)' }}>/ {fmtLKR(g.target_amount)}</span></div>
                <div className="progress-track" style={{ marginBottom: 8 }}><div className="progress-fill" style={{ width: `${info.progressPct}%`, background: 'var(--brand)' }} /></div>
                {g.target_date && <div className="sub" style={{ marginBottom: 4 }}>Target: {fmtDate(g.target_date)}{d !== null && d >= 0 ? ` (${d}d left)` : d !== null ? ' (past due)' : ''}</div>}
                <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                  <button className="btn sm" onClick={(e) => { e.stopPropagation(); setEditing(g) }}>Edit</button>
                  <button className="btn sm danger" onClick={(e) => { e.stopPropagation(); remove(g.id) }}>Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? 'Edit goal' : 'Add goal'} onClose={() => setEditing(null)} footer={<>
          <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={saving || !editing.name}>{saving ? 'Saving…' : 'Save'}</button>
        </>}>
          <div className="field"><label>Name</label><input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. 6-month emergency fund" autoFocus /></div>
          <div className="field"><label>Type</label>
            <select value={editing.type ?? 'other'} onChange={(e) => setEditing({ ...editing, type: e.target.value })}>
              {GOAL_TYPES.map((t) => <option key={t} value={t}>{GOAL_TYPE_LABEL[t]}</option>)}
            </select>
          </div>
          <div className="field-row">
            <div className="field"><label>Target amount</label><input type="number" value={editing.target_amount ?? 0} onChange={(e) => setEditing({ ...editing, target_amount: Number(e.target.value) })} /></div>
            <div className="field"><label>Starting amount</label><input type="number" value={editing.starting_amount ?? 0} onChange={(e) => setEditing({ ...editing, starting_amount: Number(e.target.value) })} /></div>
          </div>
          {editing.id && <div className="sub" style={{ marginTop: -8, marginBottom: 10 }}>Log new progress as a contribution from the goal's detail page — this field is just the base to add contributions on top of.</div>}
          <div className="field"><label>Target date</label><input type="date" value={editing.target_date ?? ''} onChange={(e) => setEditing({ ...editing, target_date: e.target.value })} /></div>
          <div className="field"><label>Notes</label><input value={editing.notes ?? ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></div>
        </Modal>
      )}
    </div>
  )
}
