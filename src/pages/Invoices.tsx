import { useMemo, useState } from 'react'
import { useData } from '../lib/useData'
import { invoicesApi, clientsApi, workEntriesApi, zohoApi } from '../lib/api'
import Modal from '../components/Modal'
import { fmtLKR, fmtDate, todayISO, monthKey, fmtMonthShort } from '../lib/format'
import type { Invoice, Client, WorkEntry } from '../lib/types'

const empty: Partial<Invoice> = { client_id: null, invoice_number: '', amount: 0, balance: 0, status: 'draft', issue_date: todayISO(), due_date: '', paid_date: null, notes: '' }

const ZOHO_ORG_ID = '879035148'

// Zoho Invoice groups every invoice into three top-level categories — Draft, Unpaid, Paid —
// with "sent" and "overdue" both falling under "Unpaid" (overdue just flags urgency via color).
// This app tracks the finer-grained status locally (for the real Zoho sync), but categorizes
// the same way Zoho itself does everywhere it's displayed here.
type InvoiceCategory = 'draft' | 'unpaid' | 'paid'
const CATEGORY_OF: Record<Invoice['status'], InvoiceCategory> = { draft: 'draft', sent: 'unpaid', overdue: 'unpaid', paid: 'paid' }
const CATEGORY_LABEL: Record<InvoiceCategory, string> = { draft: 'Draft', unpaid: 'Unpaid', paid: 'Paid' }
const CATEGORY_ORDER: InvoiceCategory[] = ['draft', 'unpaid', 'paid']
function categoryPillClass(i: Invoice): string {
  if (i.status === 'overdue') return 'critical'
  if (i.status === 'paid') return 'good'
  if (i.status === 'draft') return 'neutral'
  return 'brand'
}

export default function Invoices() {
  const { invoices, clients, refresh, loading, workEntries } = useData()
  const [editing, setEditing] = useState<Partial<Invoice> | null>(null)
  const [saving, setSaving] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<InvoiceCategory | 'all'>('all')
  const [newClientName, setNewClientName] = useState('')
  const [addingClient, setAddingClient] = useState(false)
  const [zohoSyncing, setZohoSyncing] = useState(false)

  // --- work log / Zoho state ---
  const [syncing, setSyncing] = useState(false)
  const [workClientId, setWorkClientId] = useState('')
  const [workMonth, setWorkMonth] = useState(monthKey())
  const [workDesc, setWorkDesc] = useState('')
  const [workQty, setWorkQty] = useState(1)
  const [workRate, setWorkRate] = useState(0)
  const [addingWork, setAddingWork] = useState(false)
  const [pushingKey, setPushingKey] = useState<string | null>(null)
  const [newCustName, setNewCustName] = useState('')
  const [newCustEmail, setNewCustEmail] = useState('')
  const [addingCustomer, setAddingCustomer] = useState(false)

  async function save() {
    if (!editing) return
    setSaving(true)
    try {
      const payload = { ...editing, balance: editing.status === 'paid' ? 0 : (editing.balance ?? editing.amount ?? 0) }
      const saved = payload.id ? await invoicesApi.update(payload.id, payload) : await invoicesApi.create(payload)
      await refresh('invoices')
      setEditing(null)
      // Best-effort: every save pushes this invoice's latest state to Zoho, so nothing here
      // ever has to be re-entered there by hand. A failure doesn't undo the local save — but
      // if this invoice was already linked to Zoho, the status/balance just written above
      // (e.g. balance auto-zeroed for "paid") is only a local guess until the push confirms
      // it, so on failure it's corrected back from Zoho's real state rather than left wrong.
      try {
        await zohoApi.pushInvoice(saved.id)
      } catch (e) {
        if (saved.zoho_invoice_id) {
          try { await zohoApi.pullInvoice(saved.id) } catch { /* best-effort correction only */ }
        }
        alert(`Saved locally, but syncing to Zoho failed: ${(e as Error).message}\nYou can retry with "Sync with Zoho".`)
      } finally {
        await refresh('invoices')
      }
    } finally { setSaving(false) }
  }
  async function remove(id: string) {
    if (!confirm('Delete this invoice?')) return
    await invoicesApi.remove(id)
    await refresh('invoices')
  }

  // Bulk reconcile: refreshes every already-linked invoice from Zoho (status, balance,
  // payments made there directly), and creates a real Zoho invoice for every local invoice
  // that has a Zoho-linked client but was never pushed. Since that second part can create
  // real records in the user's live Zoho account, it always confirms the exact counts first.
  async function syncAllWithZoho() {
    const unlinkedCount = invoices.filter((i) => i.client_id && !i.zoho_invoice_id && clients.find((c) => c.id === i.client_id)?.zoho_contact_id).length
    const linkedCount = invoices.filter((i) => i.zoho_invoice_id).length
    if (unlinkedCount === 0 && linkedCount === 0) {
      alert('Nothing to sync yet — link a client to Zoho (see "Sync customers from Zoho" below) and save an invoice first.')
      return
    }
    const parts: string[] = []
    if (unlinkedCount > 0) parts.push(`create ${unlinkedCount} new invoice${unlinkedCount === 1 ? '' : 's'} in your real Zoho account`)
    if (linkedCount > 0) parts.push(`refresh ${linkedCount} already-linked invoice${linkedCount === 1 ? '' : 's'} from Zoho (status, balance, payments)`)
    if (!confirm(`This will ${parts.join(' and ')}. Continue?`)) return

    setZohoSyncing(true)
    let totalPushed = 0
    let totalPulled = 0
    const errors: string[] = []
    try {
      for (let round = 0; round < 12; round++) {
        const r = await zohoApi.syncInvoices(25)
        totalPushed += r.pushed
        totalPulled += r.pulled
        errors.push(...r.pushErrors, ...r.pullErrors)
        await refresh('invoices')
        if (!r.morePushPending && !r.morePullPending) break
      }
      alert(`Synced with Zoho: ${totalPushed} invoice${totalPushed === 1 ? '' : 's'} created, ${totalPulled} refreshed.${errors.length ? `\n\n${errors.length} issue(s):\n${errors.slice(0, 8).join('\n')}` : ''}`)
    } catch (e) {
      alert(`Sync with Zoho failed: ${(e as Error).message}`)
    } finally {
      setZohoSyncing(false)
    }
  }

  // Creates a client locally, then creates the matching contact in Zoho and links the two.
  // If the Zoho half fails, the local client still exists — it can be synced later.
  async function createClientSynced(name: string, email?: string): Promise<Client> {
    const c = await clientsApi.create({ name })
    try {
      await zohoApi.createCustomer(name, email || undefined, c.id)
    } catch (e) {
      alert(`"${name}" was added, but syncing it to Zoho failed: ${(e as Error).message}\nYou can retry with "Sync customers from Zoho" once fixed.`)
    }
    await refresh('clients')
    return c
  }

  async function addClient() {
    if (!newClientName.trim()) return
    setAddingClient(true)
    try {
      const c = await createClientSynced(newClientName.trim())
      setEditing((e) => e ? { ...e, client_id: c.id } : e)
      setNewClientName('')
    } finally { setAddingClient(false) }
  }

  async function addCustomerFromWorkLog() {
    if (!newCustName.trim()) return
    setAddingCustomer(true)
    try {
      const c = await createClientSynced(newCustName.trim(), newCustEmail.trim())
      setWorkClientId(c.id)
      setNewCustName('')
      setNewCustEmail('')
    } finally { setAddingCustomer(false) }
  }

  async function syncFromZoho() {
    setSyncing(true)
    try {
      const contacts = await zohoApi.listCustomers()
      const linkedIds = new Set(clients.filter((c) => c.zoho_contact_id).map((c) => c.zoho_contact_id))
      const byName = new Map(clients.filter((c) => !c.zoho_contact_id).map((c) => [c.name.trim().toLowerCase(), c]))
      for (const contact of contacts) {
        if (linkedIds.has(contact.zoho_contact_id)) continue
        const match = byName.get(contact.name.trim().toLowerCase())
        if (match) await clientsApi.update(match.id, { zoho_contact_id: contact.zoho_contact_id })
        else await clientsApi.create({ name: contact.name, zoho_contact_id: contact.zoho_contact_id })
      }
      await refresh('clients')
    } catch (e) {
      alert(`Sync from Zoho failed: ${(e as Error).message}`)
    } finally {
      setSyncing(false)
    }
  }

  async function addWorkEntry() {
    if (!workClientId || !workDesc.trim() || workQty <= 0) return
    setAddingWork(true)
    try {
      await workEntriesApi.create({
        client_id: workClientId, work_date: todayISO(), month: workMonth,
        description: workDesc.trim(), quantity: workQty, rate: workRate, status: 'pending',
      })
      await refresh('workEntries')
      setWorkDesc('')
      setWorkQty(1)
      setWorkRate(0)
    } finally { setAddingWork(false) }
  }

  async function removeWorkEntry(id: string) {
    await workEntriesApi.remove(id)
    await refresh('workEntries')
  }

  async function pushGroup(clientId: string, month: string, entryIds: string[]) {
    const client = clients.find((c) => c.id === clientId)
    if (!client?.zoho_contact_id) { alert('This customer isn\'t linked to Zoho yet — use "Sync customers from Zoho" or add them as a new customer here first.'); return }
    const key = `${clientId}:${month}`
    setPushingKey(key)
    try {
      const res = await zohoApi.pushWork(client.zoho_contact_id, month, entryIds)
      await refresh('workEntries')
      alert(`Pushed to Zoho as draft invoice ${res.zoho_invoice_number}. Review and send it from Zoho when ready.`)
    } catch (e) {
      alert(`Push to Zoho failed: ${(e as Error).message}`)
    } finally {
      setPushingKey(null)
    }
  }

  const pendingGroups = useMemo(() => {
    const map = new Map<string, { clientId: string; month: string; entries: WorkEntry[] }>()
    workEntries.filter((w) => w.status === 'pending' && w.client_id).forEach((w) => {
      const key = `${w.client_id}:${w.month}`
      if (!map.has(key)) map.set(key, { clientId: w.client_id!, month: w.month, entries: [] })
      map.get(key)!.entries.push(w)
    })
    return Array.from(map.values())
      .map((g) => ({
        ...g,
        key: `${g.clientId}:${g.month}`,
        clientName: clients.find((c) => c.id === g.clientId)?.name ?? 'Unknown customer',
        zohoContactId: clients.find((c) => c.id === g.clientId)?.zoho_contact_id ?? null,
        total: g.entries.reduce((s, e) => s + e.amount, 0),
      }))
      .sort((a, b) => b.month.localeCompare(a.month))
  }, [workEntries, clients])

  const recentlyPushed = useMemo(
    () => workEntries.filter((w) => w.status === 'pushed').sort((a, b) => (b.pushed_at ?? '').localeCompare(a.pushed_at ?? '')).slice(0, 8),
    [workEntries],
  )

  const linkedCount = clients.filter((c) => c.zoho_contact_id).length

  const awaitingPayment = invoices.filter((i) => i.status === 'sent').reduce((s, i) => s + i.balance, 0)
  const awaitingPaymentCount = invoices.filter((i) => i.status === 'sent').length
  const overdue = invoices.filter((i) => i.status === 'overdue').reduce((s, i) => s + i.balance, 0)
  const outstanding = awaitingPayment + overdue
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

  const categoryCounts: Record<InvoiceCategory, number> = { draft: 0, unpaid: 0, paid: 0 }
  invoices.forEach((i) => { categoryCounts[CATEGORY_OF[i.status]]++ })
  const filteredInvoices = categoryFilter === 'all' ? invoices : invoices.filter((i) => CATEGORY_OF[i.status] === categoryFilter)

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Invoices</h2>
          <div className="sub">Client invoices — categorized as Draft, Unpaid and Paid, same as Zoho Invoice</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={syncAllWithZoho} disabled={zohoSyncing} title="Pushes every unlinked invoice to Zoho as a new invoice, and pulls the latest status/balance for invoices already linked — every save also does this automatically for that one invoice.">{zohoSyncing ? 'Syncing…' : 'Sync with Zoho'}</button>
          <button className="btn primary" onClick={() => setEditing(empty)}>+ Add invoice</button>
        </div>
      </div>

      <div className="grid cols-5" style={{ marginBottom: 16 }}>
        <div className="card card-pad kpi"><span className="label">Outstanding</span><span className="value num" style={{ color: 'var(--critical)' }}>{fmtLKR(outstanding)}</span></div>
        <div className="card card-pad kpi">
          <span className="label">Sent &middot; awaiting payment</span>
          <span className="value num">{fmtLKR(awaitingPayment)}</span>
          <span className="sub">{awaitingPaymentCount} invoice{awaitingPaymentCount === 1 ? '' : 's'}, not yet overdue</span>
        </div>
        <div className="card card-pad kpi"><span className="label">Overdue</span><span className="value num" style={{ color: 'var(--critical)' }}>{fmtLKR(overdue)}</span></div>
        <div className="card card-pad kpi"><span className="label">Drafts</span><span className="value num">{draftCount}</span></div>
        <div className="card card-pad kpi"><span className="label">Total invoices</span><span className="value num">{invoices.length}</span></div>
      </div>

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="card-pad">
          <div className="tabs" style={{ marginBottom: 14 }}>
            <button className={categoryFilter === 'all' ? 'active' : ''} onClick={() => setCategoryFilter('all')}>All &middot; {invoices.length}</button>
            {CATEGORY_ORDER.map((c) => (
              <button key={c} className={categoryFilter === c ? 'active' : ''} onClick={() => setCategoryFilter(c)}>{CATEGORY_LABEL[c]} &middot; {categoryCounts[c]}</button>
            ))}
          </div>
          {loading ? <div className="empty">Loading…</div> : filteredInvoices.length === 0 ? (
            <div className="empty">{invoices.length === 0 ? 'No invoices yet.' : `No ${CATEGORY_LABEL[categoryFilter as InvoiceCategory]?.toLowerCase() ?? ''} invoices.`}</div>
          ) : (
            <div className="table-scroll"><table>
              <thead><tr><th>Invoice</th><th>Client</th><th>Status</th><th className="num">Amount</th><th className="num">Balance</th><th>Due</th><th>Zoho</th><th></th></tr></thead>
              <tbody>
                {filteredInvoices.map((i) => (
                  <tr key={i.id}>
                    <td>{i.invoice_number || i.id.slice(0, 8)}</td>
                    <td>{clientName(i.client_id)}</td>
                    <td><span className={`pill ${categoryPillClass(i)}`}>{CATEGORY_LABEL[CATEGORY_OF[i.status]]}{i.status === 'overdue' ? ' · overdue' : ''}</span></td>
                    <td className="num">{fmtLKR(i.amount)}</td>
                    <td className="num" style={{ color: i.balance > 0 ? 'var(--critical)' : undefined }}>{fmtLKR(i.balance)}</td>
                    <td>{fmtDate(i.due_date)}</td>
                    <td>
                      {i.zoho_invoice_id ? (
                        <a className="pill good" style={{ textDecoration: 'none' }} href={`https://invoice.zoho.com/app/${ZOHO_ORG_ID}#/invoices/${i.zoho_invoice_id}`} target="_blank" rel="noreferrer">Linked</a>
                      ) : <span className="pill neutral">Not yet</span>}
                    </td>
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

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="card-pad">
          <div className="section-head">
            <h3>Work log &middot; push to Zoho</h3>
            <button className="btn sm" onClick={syncFromZoho} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync customers from Zoho'}</button>
          </div>
          <div className="sub" style={{ marginBottom: 14 }}>
            Log billable work for a customer and month, then push it as a draft invoice in Zoho — review and send it from there.
            {' '}{linkedCount} of {clients.length} customers are linked to Zoho.
          </div>

          <div className="field-row" style={{ alignItems: 'flex-end', marginBottom: 8 }}>
            <div className="field" style={{ minWidth: 170 }}>
              <label>Customer</label>
              <select value={workClientId} onChange={(e) => setWorkClientId(e.target.value)}>
                <option value="">Select…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.zoho_contact_id ? '' : ' (not synced)'}</option>)}
              </select>
            </div>
            <div className="field" style={{ maxWidth: 150 }}>
              <label>Month</label>
              <input type="month" value={workMonth} onChange={(e) => setWorkMonth(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 200 }}>
              <label>Description</label>
              <input value={workDesc} onChange={(e) => setWorkDesc(e.target.value)} placeholder="e.g. Social media content — week 3" />
            </div>
            <div className="field" style={{ maxWidth: 90 }}>
              <label>Qty</label>
              <input type="number" min={0} value={workQty} onChange={(e) => setWorkQty(Number(e.target.value))} />
            </div>
            <div className="field" style={{ maxWidth: 150 }}>
              <label>Rate (Rs)</label>
              <input type="number" min={0} value={workRate} onChange={(e) => setWorkRate(Number(e.target.value))} />
            </div>
            <button className="btn primary" onClick={addWorkEntry} disabled={addingWork || !workClientId || !workDesc.trim()}>+ Add</button>
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
            <input value={newCustName} onChange={(e) => setNewCustName(e.target.value)} placeholder="New customer name…" style={{ flex: 1, maxWidth: 220 }} />
            <input value={newCustEmail} onChange={(e) => setNewCustEmail(e.target.value)} placeholder="Email (optional)" style={{ flex: 1, maxWidth: 220 }} />
            <button className="btn sm" type="button" onClick={addCustomerFromWorkLog} disabled={addingCustomer || !newCustName.trim()}>Add customer (syncs to Zoho)</button>
          </div>

          {pendingGroups.length === 0 ? (
            <div className="empty">No pending work entries yet — add one above.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {pendingGroups.map((g) => (
                <div key={g.key} className="card" style={{ background: 'var(--surface-2)' }}>
                  <div className="card-pad">
                    <div className="section-head">
                      <h3 style={{ fontSize: 13 }}>{g.clientName} &middot; {fmtMonthShort(g.month)} {g.month.slice(0, 4)}</h3>
                      <button className="btn sm primary" onClick={() => pushGroup(g.clientId, g.month, g.entries.map((e) => e.id))} disabled={pushingKey === g.key}>
                        {pushingKey === g.key ? 'Pushing…' : `Push ${g.entries.length} to Zoho`}
                      </button>
                    </div>
                    {!g.zohoContactId && <div className="alert warning" style={{ marginBottom: 10 }}>Not linked to Zoho — sync or re-add this customer before pushing.</div>}
                    <div className="table-scroll"><table>
                      <thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Amount</th><th></th></tr></thead>
                      <tbody>
                        {g.entries.map((e) => (
                          <tr key={e.id}>
                            <td>{e.description}</td>
                            <td className="num">{e.quantity}</td>
                            <td className="num">{fmtLKR(e.rate)}</td>
                            <td className="num">{fmtLKR(e.amount)}</td>
                            <td style={{ textAlign: 'right' }}><button className="btn sm danger" onClick={() => removeWorkEntry(e.id)}>Remove</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table></div>
                    <div style={{ textAlign: 'right', fontWeight: 700, marginTop: 8 }}>Total {fmtLKR(g.total)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {recentlyPushed.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div className="section-head"><h3 style={{ fontSize: 13 }}>Recently pushed</h3></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {recentlyPushed.map((e) => (
                  <div key={e.id} className="sub" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{e.description} &middot; {clientName(e.client_id)}</span>
                    <a href={`https://invoice.zoho.com/app/${ZOHO_ORG_ID}#/invoices/${e.zoho_invoice_id}`} target="_blank" rel="noreferrer">
                      Draft {e.zoho_invoice_number} &rarr;
                    </a>
                  </div>
                ))}
              </div>
            </div>
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
