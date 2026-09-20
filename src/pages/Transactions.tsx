import { useMemo, useState } from 'react'
import { useData } from '../lib/useData'
import { transactionsApi } from '../lib/api'
import Modal from '../components/Modal'
import { fmtLKR, fmtDate, todayISO, OWNER_LABEL } from '../lib/format'
import { inRange } from '../lib/calc'
import { BUSINESS_LABEL, BUSINESSES } from '../lib/businessCalc'
import PeriodFilterBar, { usePeriodFilter } from '../components/PeriodFilter'
import type { Transaction, Owner } from '../lib/types'

const empty: Partial<Transaction> = {
  txn_date: todayISO(), amount: 0, description: '', owner: 'personal', business: null,
  account_id: null, category_id: null, client_id: null, is_recurring: false, recurring_frequency: null,
}

export default function Transactions() {
  const { transactions, accounts, categories, clients, refresh, loading } = useData()
  const [editing, setEditing] = useState<Partial<Transaction> | null>(null)
  const [flow, setFlow] = useState<'income' | 'expense'>('expense')
  const [saving, setSaving] = useState(false)
  const [filterOwner, setFilterOwner] = useState<Owner | 'all'>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [search, setSearch] = useState('')

  const pf = usePeriodFilter('all')
  const { periodType, range, title } = pf

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (filterOwner !== 'all' && t.owner !== filterOwner) return false
      if (filterCategory !== 'all' && t.category_id !== filterCategory) return false
      if (search && !(t.description ?? '').toLowerCase().includes(search.toLowerCase())) return false
      if (!inRange(t.txn_date, range)) return false
      return true
    })
  }, [transactions, filterOwner, filterCategory, search, range])

  const periodIncome = filtered.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const periodExpenses = Math.abs(filtered.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0))
  const periodNet = periodIncome - periodExpenses

  function openNew() {
    setFlow('expense')
    setEditing({ ...empty })
  }
  function openEdit(t: Transaction) {
    setFlow(t.amount >= 0 ? 'income' : 'expense')
    setEditing(t)
  }

  async function save() {
    if (!editing || !editing.txn_date) return
    const magnitude = Math.abs(Number(editing.amount) || 0)
    const signed = flow === 'income' ? magnitude : -magnitude
    const payload = { ...editing, amount: signed }
    setSaving(true)
    try {
      if (payload.id) await transactionsApi.update(payload.id, payload)
      else await transactionsApi.create(payload)
      await refresh('transactions')
      setEditing(null)
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this transaction?')) return
    await transactionsApi.remove(id)
    await refresh('transactions')
  }

  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? '—'
  const accName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? '—'
  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.name

  const availableCategories = categories.filter((c) => c.kind === (flow === 'income' ? 'income' : 'expense'))

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Transactions</h2>
          <div className="sub">{transactions.length} recorded &middot; personal and business, split by owner</div>
        </div>
        <button className="btn primary" onClick={openNew}>+ Add transaction</button>
      </div>

      <PeriodFilterBar pf={pf} />

      <div className="grid cols-3" style={{ marginBottom: 14 }}>
        <div className="card card-pad kpi">
          <span className="label">Income {periodType !== 'all' ? `· ${title}` : ''}</span>
          <span className="value num" style={{ color: 'var(--good)' }}>{fmtLKR(periodIncome)}</span>
        </div>
        <div className="card card-pad kpi">
          <span className="label">Expenses {periodType !== 'all' ? `· ${title}` : ''}</span>
          <span className="value num" style={{ color: 'var(--critical)' }}>{fmtLKR(periodExpenses)}</span>
        </div>
        <div className="card card-pad kpi">
          <span className="label">Net</span>
          <span className="value num" style={{ color: periodNet >= 0 ? 'var(--good)' : 'var(--critical)' }}>{fmtLKR(periodNet, { sign: true })}</span>
          <span className="sub">{filtered.length} transaction{filtered.length === 1 ? '' : 's'}</span>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 14, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field" style={{ minWidth: 160 }}>
          <label>Owner</label>
          <select value={filterOwner} onChange={(e) => setFilterOwner(e.target.value as Owner | 'all')}>
            <option value="all">All</option>
            <option value="personal">Personal</option>
            <option value="business">Business</option>
          </select>
        </div>
        <div className="field" style={{ minWidth: 200 }}>
          <label>Category</label>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="all">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
          <label>Search description</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" />
        </div>
      </div>

      <section className="card">
        <div className="card-pad">
          {loading ? <div className="empty">Loading…</div> : filtered.length === 0 ? (
            <div className="empty">No transactions match. Add one, or clear your filters.</div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>Date</th><th>Description</th><th>Category</th><th>Account</th><th>Owner</th><th className="num">Amount</th><th></th></tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr key={t.id}>
                      <td className="num">{fmtDate(t.txn_date)}</td>
                      <td>
                        {t.description || '—'}
                        {clientName(t.client_id) ? <div className="sub" style={{ fontSize: 11 }}>{clientName(t.client_id)}</div> : null}
                        {t.zoho_expense_id ? <div style={{ marginTop: 4 }}><span className="pill good" title={`Synced to Zoho Invoice on ${fmtDate(t.zoho_pushed_at)}`}>Synced to Zoho</span></div> : null}
                      </td>
                      <td>{catName(t.category_id)}</td>
                      <td>{accName(t.account_id)}</td>
                      <td>
                        <span className={`pill ${t.owner === 'business' ? 'brand' : 'accent'}`}>
                          {t.owner === 'business' && t.business ? BUSINESS_LABEL[t.business] : OWNER_LABEL[t.owner]}
                        </span>
                      </td>
                      <td className="num" style={{ color: t.amount >= 0 ? 'var(--good)' : 'var(--critical)' }}>{fmtLKR(t.amount, { sign: true })}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn sm" onClick={() => openEdit(t)}>Edit</button>{' '}
                        <button className="btn sm danger" onClick={() => remove(t.id)}>Delete</button>
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
        <Modal title={editing.id ? 'Edit transaction' : 'Add transaction'} onClose={() => setEditing(null)} footer={
          <>
            <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </>
        }>
          <div className="tabs" style={{ marginBottom: 0 }}>
            <button className={flow === 'expense' ? 'active' : ''} onClick={() => setFlow('expense')}>Expense</button>
            <button className={flow === 'income' ? 'active' : ''} onClick={() => setFlow('income')}>Income</button>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Date</label>
              <input type="date" value={editing.txn_date ?? todayISO()} onChange={(e) => setEditing({ ...editing, txn_date: e.target.value })} />
            </div>
            <div className="field">
              <label>Amount (Rs)</label>
              <input type="number" value={Math.abs(editing.amount ?? 0)} onChange={(e) => setEditing({ ...editing, amount: Number(e.target.value) })} autoFocus />
            </div>
          </div>
          <div className="field">
            <label>Description</label>
            <input value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="e.g. Grocery shopping, Client deposit…" />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Category</label>
              <select value={editing.category_id ?? ''} onChange={(e) => setEditing({ ...editing, category_id: e.target.value || null })}>
                <option value="">Uncategorised</option>
                {availableCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Account</label>
              <select value={editing.account_id ?? ''} onChange={(e) => setEditing({ ...editing, account_id: e.target.value || null })}>
                <option value="">No account</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Owner (personal / business split)</label>
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
                <select value={editing.business ?? 'nexxel'} onChange={(e) => setEditing({ ...editing, business: e.target.value as Transaction['business'] })}>
                  {BUSINESSES.map((b) => <option key={b} value={b}>{BUSINESS_LABEL[b]}</option>)}
                </select>
              </div>
            )}
          </div>
          {editing.owner === 'business' && (
            <div className="field-row">
              <div className="field">
                <label>Client (optional)</label>
                <select value={editing.client_id ?? ''} onChange={(e) => setEditing({ ...editing, client_id: e.target.value || null })}>
                  <option value="">No client</option>
                  {clients.filter((c) => c.business === editing.business).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
          )}
          <div className="field-row" style={{ alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>
              <input type="checkbox" checked={!!editing.is_recurring} onChange={(e) => setEditing({ ...editing, is_recurring: e.target.checked })} style={{ width: 'auto' }} />
              Recurring
            </label>
            {editing.is_recurring && (
              <div className="field" style={{ maxWidth: 160 }}>
                <select value={editing.recurring_frequency ?? 'monthly'} onChange={(e) => setEditing({ ...editing, recurring_frequency: e.target.value as Transaction['recurring_frequency'] })}>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
