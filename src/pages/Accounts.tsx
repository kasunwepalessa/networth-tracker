import { useState } from 'react'
import { useData } from '../lib/useData'
import { accountsApi } from '../lib/api'
import Modal from '../components/Modal'
import { fmtLKR, ACCOUNT_TYPE_LABEL, OWNER_LABEL } from '../lib/format'
import { BUSINESS_LABEL, BUSINESSES } from '../lib/businessCalc'
import type { Account, Owner } from '../lib/types'

const empty: Partial<Account> = { name: '', type: 'bank', owner: 'personal', business: null, currency: 'LKR', balance: 0, credit_limit: null, notes: '' }

export default function Accounts() {
  const { accounts, refresh, loading } = useData()
  const [editing, setEditing] = useState<Partial<Account> | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!editing || !editing.name) return
    setSaving(true)
    try {
      if (editing.id) await accountsApi.update(editing.id, editing)
      else await accountsApi.create(editing)
      await refresh('accounts')
      setEditing(null)
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this account? Transactions referencing it will keep their history but lose the link.')) return
    await accountsApi.remove(id)
    await refresh('accounts')
  }

  const visible = accounts.filter((a) => !a.archived)
  const totalByOwner = (o: Owner) => visible.filter((a) => a.owner === o && a.type !== 'credit_card').reduce((s, a) => s + a.balance, 0)

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Accounts</h2>
          <div className="sub">Bank accounts, cash, e-wallets and credit cards</div>
        </div>
        <button className="btn primary" onClick={() => setEditing(empty)}>+ Add account</button>
      </div>

      <div className="grid cols-3 kpi-grid" style={{ marginBottom: 16 }}>
        <div className="card card-pad kpi">
          <span className="label">Personal cash</span>
          <span className="value num">{fmtLKR(totalByOwner('personal'))}</span>
        </div>
        <div className="card card-pad kpi">
          <span className="label">Business cash</span>
          <span className="value num">{fmtLKR(totalByOwner('business'))}</span>
        </div>
        <div className="card card-pad kpi">
          <span className="label">Credit card balances</span>
          <span className="value num" style={{ color: 'var(--critical)' }}>
            {fmtLKR(visible.filter((a) => a.type === 'credit_card').reduce((s, a) => s + Math.abs(Math.min(0, a.balance)), 0))}
          </span>
        </div>
      </div>

      <section className="card">
        <div className="card-pad">
          {loading ? <div className="empty">Loading…</div> : visible.length === 0 ? (
            <div className="empty">No accounts yet. Add your first bank account, wallet, or card.</div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Name</th><th>Type</th><th>Owner</th><th className="num">Balance</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((a) => (
                    <tr key={a.id}>
                      <td>{a.name}{a.notes ? <div className="sub" style={{ fontSize: 11 }}>{a.notes}</div> : null}</td>
                      <td>{ACCOUNT_TYPE_LABEL[a.type]}</td>
                      <td><span className={`pill ${a.owner === 'business' ? 'brand' : 'accent'}`}>{a.owner === 'business' && a.business ? BUSINESS_LABEL[a.business] : OWNER_LABEL[a.owner]}</span></td>
                      <td className="num" style={{ color: a.balance < 0 ? 'var(--critical)' : undefined }}>{fmtLKR(a.balance)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn sm" onClick={() => setEditing(a)}>Edit</button>{' '}
                        <button className="btn sm danger" onClick={() => remove(a.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {editing && (
        <Modal title={editing.id ? 'Edit account' : 'Add account'} onClose={() => setEditing(null)} footer={
          <>
            <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn primary" onClick={save} disabled={saving || !editing.name}>{saving ? 'Saving…' : 'Save'}</button>
          </>
        }>
          <div className="field">
            <label>Name</label>
            <input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Commercial Bank Current" autoFocus />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Type</label>
              <select value={editing.type ?? 'bank'} onChange={(e) => setEditing({ ...editing, type: e.target.value as Account['type'] })}>
                {Object.entries(ACCOUNT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Owner</label>
              <select
                value={editing.owner ?? 'personal'}
                onChange={(e) => {
                  const owner = e.target.value as Owner
                  setEditing({ ...editing, owner, business: owner === 'business' ? (editing.business ?? 'nexxel') : null })
                }}
              >
                <option value="personal">Personal</option>
                <option value="business">Business</option>
              </select>
            </div>
            {editing.owner === 'business' && (
              <div className="field">
                <label>Which business</label>
                <select value={editing.business ?? 'nexxel'} onChange={(e) => setEditing({ ...editing, business: e.target.value as Account['business'] })}>
                  {BUSINESSES.map((b) => <option key={b} value={b}>{BUSINESS_LABEL[b]}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="field-row">
            <div className="field">
              <label>{editing.type === 'credit_card' ? 'Current balance (negative = owed)' : 'Current balance'}</label>
              <input type="number" value={editing.balance ?? 0} onChange={(e) => setEditing({ ...editing, balance: Number(e.target.value) })} />
            </div>
            {editing.type === 'credit_card' && (
              <div className="field">
                <label>Credit limit</label>
                <input type="number" value={editing.credit_limit ?? ''} onChange={(e) => setEditing({ ...editing, credit_limit: e.target.value ? Number(e.target.value) : null })} />
              </div>
            )}
          </div>
          <div className="field">
            <label>Notes</label>
            <input value={editing.notes ?? ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} placeholder="Optional" />
          </div>
        </Modal>
      )}
    </div>
  )
}
