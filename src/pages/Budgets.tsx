import { useMemo, useState } from 'react'
import { useData } from '../lib/useData'
import { budgetsApi } from '../lib/api'
import Modal from '../components/Modal'
import { fmtLKR, monthKey, OWNER_LABEL } from '../lib/format'
import type { Budget, Owner } from '../lib/types'

const empty: Partial<Budget> = { category_id: '', owner: 'personal', month: monthKey(), limit_amount: 0 }

export default function Budgets() {
  const { budgets, categories, transactions, refresh, loading } = useData()
  const [month, setMonth] = useState(monthKey())
  const [editing, setEditing] = useState<Partial<Budget> | null>(null)
  const [saving, setSaving] = useState(false)

  const monthBudgets = budgets.filter((b) => b.month === month)

  const spentByCategory = useMemo(() => {
    const map = new Map<string, number>()
    transactions.filter((t) => monthKey(t.txn_date) === month && t.amount < 0 && t.category_id).forEach((t) => {
      map.set(t.category_id!, (map.get(t.category_id!) ?? 0) + Math.abs(t.amount))
    })
    return map
  }, [transactions, month])

  async function save() {
    if (!editing || !editing.category_id || !editing.month) return
    setSaving(true)
    try {
      if (editing.id) await budgetsApi.update(editing.id, editing)
      else await budgetsApi.create(editing)
      await refresh('budgets')
      setEditing(null)
    } finally { setSaving(false) }
  }
  async function remove(id: string) {
    if (!confirm('Delete this budget limit?')) return
    await budgetsApi.remove(id)
    await refresh('budgets')
  }

  const expenseCategories = categories.filter((c) => c.kind === 'expense')
  const totalLimit = monthBudgets.reduce((s, b) => s + b.limit_amount, 0)
  const totalSpent = monthBudgets.reduce((s, b) => s + (spentByCategory.get(b.category_id) ?? 0), 0)

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Budgets</h2>
          <div className="sub">Monthly category limits, personal and business</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--ink-1)' }} />
          <button className="btn primary" onClick={() => setEditing({ ...empty, month })}>+ Set budget</button>
        </div>
      </div>

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="card card-pad kpi"><span className="label">Total budgeted</span><span className="value num">{fmtLKR(totalLimit)}</span></div>
        <div className="card card-pad kpi"><span className="label">Total spent</span><span className="value num" style={{ color: totalSpent > totalLimit ? 'var(--critical)' : undefined }}>{fmtLKR(totalSpent)}</span></div>
        <div className="card card-pad kpi"><span className="label">Remaining</span><span className="value num" style={{ color: totalLimit - totalSpent < 0 ? 'var(--critical)' : 'var(--good)' }}>{fmtLKR(totalLimit - totalSpent)}</span></div>
      </div>

      <section className="card"><div className="card-pad">
        {loading ? <div className="empty">Loading…</div> : monthBudgets.length === 0 ? (
          <div className="empty">No budgets set for this month yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {monthBudgets.map((b) => {
              const cat = categories.find((c) => c.id === b.category_id)
              const spent = spentByCategory.get(b.category_id) ?? 0
              const pct = b.limit_amount > 0 ? Math.min(100, (spent / b.limit_amount) * 100) : 0
              const over = spent > b.limit_amount
              return (
                <div key={b.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'baseline', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <strong style={{ fontSize: 13.5 }}>{cat?.name ?? 'Unknown'}</strong>
                      <span className={`pill ${b.owner === 'business' ? 'brand' : 'accent'}`}>{OWNER_LABEL[b.owner]}</span>
                    </div>
                    <div className="num" style={{ fontSize: 12.5, color: over ? 'var(--critical)' : 'var(--ink-2)' }}>
                      {fmtLKR(spent)} / {fmtLKR(b.limit_amount)}
                    </div>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${pct}%`, background: over ? 'var(--critical)' : pct > 80 ? 'var(--warning)' : 'var(--good)' }} />
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                    <button className="btn sm" onClick={() => setEditing(b)}>Edit</button>
                    <button className="btn sm danger" onClick={() => remove(b.id)}>Delete</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div></section>

      {editing && (
        <Modal title={editing.id ? 'Edit budget' : 'Set budget'} onClose={() => setEditing(null)} footer={<>
          <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={saving || !editing.category_id}>{saving ? 'Saving…' : 'Save'}</button>
        </>}>
          <div className="field"><label>Category</label>
            <select value={editing.category_id ?? ''} onChange={(e) => setEditing({ ...editing, category_id: e.target.value })}>
              <option value="">Select a category</option>
              {expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field-row">
            <div className="field"><label>Owner</label>
              <select value={editing.owner ?? 'personal'} onChange={(e) => setEditing({ ...editing, owner: e.target.value as Owner })}>
                <option value="personal">Personal</option><option value="business">Business</option>
              </select>
            </div>
            <div className="field"><label>Month</label><input type="month" value={editing.month ?? month} onChange={(e) => setEditing({ ...editing, month: e.target.value })} /></div>
          </div>
          <div className="field"><label>Monthly limit (Rs)</label><input type="number" value={editing.limit_amount ?? 0} onChange={(e) => setEditing({ ...editing, limit_amount: Number(e.target.value) })} /></div>
        </Modal>
      )}
    </div>
  )
}
