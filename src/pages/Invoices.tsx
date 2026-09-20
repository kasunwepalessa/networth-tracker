import { useMemo, useState } from 'react'
import { useData } from '../lib/useData'
import { invoicesApi, clientsApi } from '../lib/api'
import Modal from '../components/Modal'
import { fmtLKR, fmtDate, todayISO } from '../lib/format'
import type { Invoice } from '../lib/types'

const empty: Partial<Invoice> = { client_id: null, invoice_number: '', amount: 0, balance: 0, status: 'draft', issue_date: todayISO(), due_date: '', paid_date: null, notes: '' }

const STATUS_PILL: Record<Invoice['status'], string> = { draft: 'neutral', sent: 'brand', paid: 'good', overdue: 'critical' }

export default function Invoices() {
  const { invoices, clients, refresh, loading } = useData()
  const [editing, setEditing] = useState<Partial<Invoice> | null>(null)
  const [saving, setSaving] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [addingClient, setAddingClient] = useState(false)

  async function save() {
    if (!editing) return
    setSaving(true)
    try {
      const payload = { ...editing, balance: editing.status === 'paid' ? 0 : (editing.balance ?? editing.amount ?? 0) }
      if (payload.id) await invoicesApi.update(payload.id, payload)
      else await invoicesApi.create(payload)
      await refresh('invoices')
      setEditing(null)
    } finally { setSaving(false) }
  }
  async function remove(id: string) {
    if (!confirm('Delete this invoice?')) return
    await invoicesApi.remove(id)
    await refresh('invoices')
  }
  async function addClient() {
    if (!newClientName.trim()) return
    setAddingClient(true)
    try {
      const c = await clientsApi.create({ name: newClientName.trim() })
      await refresh('clients')
      setEditing((e) => e ? { ...e, client_id: c.id } : e)
      setNewClientName('')
    } finally { setAddingClient(false) }
  }

  const outstanding = invoices.filter((i) => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + i.balance, 0)
  const overdue = invoices.filter((i) => i.status === 'overdue').reduce((s, i) => s + i.balance, 0)
  const draftCount = invoices.filter((i) => i.status === 'draft').length

  const clientTotals = useMemo(() => {
    const map = new Map<string, number>()
    invoices.filter((i) => i.status !== 'draft').forEach((i) => {
      if (!i.client_id) return
      map.set(i.client_id, (map.get(i.client_id) ?? 0) + i.amount)
    })
    return Array.from(map.entries())
      .map(([clientId, total]) => ({ client: clients.find((c) => c.id === clientId), total }))
      .filter((r) => r.client)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
  }, [invoices, clients])

  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.name ?? '—'

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Invoices</h2>
          <div className="sub">Client invoices — draft, sent, paid, overdue</div>
        </div>
        <button className="btn primary" onClick={() => setEditing(empty)}>+ Add invoice</button>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="card card-pad kpi"><span className="label">Outstanding</span><span className="value num" style={{ color: 'var(--critical)' }}>{fmtLKR(outstanding)}</span></div>
        <div className="card card-pad kpi"><span className="label">Overdue</span><span className="value num" style={{ color: 'var(--critical)' }}>{fmtLKR(overdue)}</span></div>
        <div className="card card-pad kpi"><span className="label">Drafts</span><span className="value num">{draftCount}</span></div>
        <div className="card card-pad kpi"><span className="label">Total invoices</span><span className="value num">{invoices.length}</span></div>
      </div>

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="card-pad">
          {loading ? <div className="empty">Loading…</div> : invoices.length === 0 ? (
            <div className="empty">No invoices yet.</div>
          ) : (
            <div className="table-scroll"><table>
              <thead><tr><th>Invoice</th><th>Client</th><th>Status</th><th className="num">Amount</th><th className="num">Balance</th><th>Due</th><th></th></tr></thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <td>{i.invoice_number || i.id.slice(0, 8)}</td>
                    <td>{clientName(i.client_id)}</td>
                    <td><span className={`pill ${STATUS_PILL[i.status]}`}>{i.status}</span></td>
                    <td className="num">{fmtLKR(i.amount)}</td>
                    <td className="num" style={{ color: i.balance > 0 ? 'var(--critical)' : undefined }}>{fmtLKR(i.balance)}</td>
                    <td>{fmtDate(i.due_date)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn sm" onClick={() => setEditing(i)}>Edit</button>{' '}
                      <button className="btn sm danger" onClick={() => remove(i.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-pad">
          <div className="section-head"><h3>Top clients by revenue</h3><span className="hint">Non-draft invoices, all-time</span></div>
          {clientTotals.length === 0 ? <div className="empty">No client revenue recorded yet.</div> : (
            <div className="table-scroll"><table>
              <thead><tr><th>Client</th><th className="num">Total invoiced</th></tr></thead>
              <tbody>{clientTotals.map((r) => (
                <tr key={r.client!.id}><td>{r.client!.name}</td><td className="num">{fmtLKR(r.total)}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      </section>

      {editing && (
        <Modal title={editing.id ? 'Edit invoice' : 'Add invoice'} onClose={() => setEditing(null)} footer={<>
          <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </>}>
          <div className="field">
            <label>Client</label>
            <select value={editing.client_id ?? ''} onChange={(e) => setEditing({ ...editing, client_id: e.target.value || null })}>
              <option value="">No client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input value={newClientName} onChange={(e) => setNewClientName(e.target.value)} placeholder="New client name…" style={{ flex: 1 }} />
              <button className="btn sm" type="button" onClick={addClient} disabled={addingClient || !newClientName.trim()}>Add</button>
            </div>
          </div>
          <div className="field-row">
            <div className="field"><label>Invoice number</label><input value={editing.invoice_number ?? ''} onChange={(e) => setEditing({ ...editing, invoice_number: e.target.value })} /></div>
            <div className="field"><label>Status</label>
              <select value={editing.status ?? 'draft'} onChange={(e) => setEditing({ ...editing, status: e.target.value as Invoice['status'] })}>
                <option value="draft">Draft</option><option value="sent">Sent</option><option value="paid">Paid</option><option value="overdue">Overdue</option>
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field"><label>Amount</label><input type="number" value={editing.amount ?? 0} onChange={(e) => setEditing({ ...editing, amount: Number(e.target.value), balance: editing.status === 'paid' ? 0 : Number(e.target.value) })} /></div>
            <div className="field"><label>Balance due</label><input type="number" value={editing.balance ?? 0} onChange={(e) => setEditing({ ...editing, balance: Number(e.target.value) })} disabled={editing.status === 'paid'} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Issue date</label><input type="date" value={editing.issue_date ?? ''} onChange={(e) => setEditing({ ...editing, issue_date: e.target.value })} /></div>
            <div className="field"><label>Due date</label><input type="date" value={editing.due_date ?? ''} onChange={(e) => setEditing({ ...editing, due_date: e.target.value })} /></div>
          </div>
          <div className="field"><label>Notes</label><input value={editing.notes ?? ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></div>
        </Modal>
      )}
    </div>
  )
}
