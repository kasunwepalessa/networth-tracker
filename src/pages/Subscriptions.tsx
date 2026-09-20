import { useMemo, useState } from 'react'
import { useData } from '../lib/useData'
import { subscriptionsApi, logSubscriptionPayment, zohoApi } from '../lib/api'
import { totalMonthlySubscriptionCost, totalYearlySubscriptionCost, upcomingSubscriptions, subscriptionMonthlyCost } from '../lib/calc'
import { fmtLKR, fmtDate, todayISO, daysUntil, OWNER_LABEL } from '../lib/format'
import { useCountUp } from '../lib/useCountUp'
import Modal from '../components/Modal'
import type { Subscription, Owner, BillingCycle, Category } from '../lib/types'

const CYCLE_LABEL: Record<BillingCycle, string> = { weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' }
const AVATAR_COLORS = ['var(--brand)', 'var(--accent)', 'var(--cat-1)', 'var(--cat-5)', 'var(--cat-7)', 'var(--cat-2)']

const empty: Partial<Subscription> = {
  name: '', amount: 0, billing_cycle: 'monthly', next_renewal_date: todayISO(), owner: 'personal',
  category_id: null, account_id: null, status: 'active', notes: '',
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'
}

// Groups the upcoming-renewals list by urgency so the most time-sensitive items are
// scannable at a glance, instead of one long undifferentiated list.
const UPCOMING_SECTIONS: { key: string; label: string; test: (days: number) => boolean }[] = [
  { key: 'week', label: 'Due this week', test: (d) => d <= 7 },
  { key: 'fortnight', label: 'Next 2 weeks', test: (d) => d > 7 && d <= 14 },
  { key: 'later', label: 'Later this month', test: (d) => d > 14 },
]

function urgencyLabel(days: number): string {
  if (days <= 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `Due in ${days} days`
}
function urgencyPillClass(days: number): string {
  if (days <= 2) return 'critical'
  if (days <= 7) return 'warning'
  return 'neutral'
}

export default function Subscriptions() {
  const { subscriptions, categories, accounts, loading, refresh } = useData()
  const [editing, setEditing] = useState<Partial<Subscription> | null>(null)
  const [saving, setSaving] = useState(false)
  const [loggingId, setLoggingId] = useState<string | null>(null)
  const [showCancelled, setShowCancelled] = useState(false)
  const [connectingCatId, setConnectingCatId] = useState<string | null>(null)

  const monthlyCost = totalMonthlySubscriptionCost(subscriptions)
  const yearlyCost = totalYearlySubscriptionCost(subscriptions)
  const monthlyAnimated = useCountUp(monthlyCost)
  const active = subscriptions.filter((s) => s.status === 'active')
  const upcoming = useMemo(() => upcomingSubscriptions(subscriptions, 30), [subscriptions])
  const cancelled = subscriptions.filter((s) => s.status === 'cancelled')

  const expenseCategories = categories.filter((c) => c.kind === 'expense')

  function openNew() {
    setEditing({ ...empty })
  }
  function openEdit(s: Subscription) {
    setEditing(s)
  }

  async function save() {
    if (!editing || !editing.name || !editing.next_renewal_date) return
    setSaving(true)
    try {
      const payload = { ...editing, amount: Math.abs(Number(editing.amount) || 0) }
      if (payload.id) await subscriptionsApi.update(payload.id, payload)
      else await subscriptionsApi.create(payload)
      await refresh('subscriptions')
      setEditing(null)
    } finally {
      setSaving(false)
    }
  }

  async function toggleStatus(s: Subscription) {
    await subscriptionsApi.update(s.id, { status: s.status === 'active' ? 'cancelled' : 'active' })
    await refresh('subscriptions')
  }

  async function remove(id: string) {
    if (!confirm('Delete this subscription? This does not delete any transactions already logged from it.')) return
    await subscriptionsApi.remove(id)
    await refresh('subscriptions')
  }

  async function logPayment(s: Subscription) {
    setLoggingId(s.id)
    try {
      const result = await logSubscriptionPayment(s)
      await refresh('subscriptions')
      await refresh('transactions')
      if (result.zohoError) alert(`Logged locally, but syncing to Zoho failed: ${result.zohoError}`)
    } finally {
      setLoggingId(null)
    }
  }

  // Subscription categories not yet linked to a Zoho expense category — surfaced so the
  // person can connect them once, after which every future "Log payment" for a subscription
  // in that category is mirrored into Zoho Invoice's Expenses automatically.
  const unlinkedSubCategories = useMemo(() => {
    const usedIds = new Set(subscriptions.map((s) => s.category_id).filter((id): id is string => !!id))
    return categories.filter((c) => usedIds.has(c.id) && !c.zoho_account_id)
  }, [subscriptions, categories])

  async function connectCategoryToZoho(cat: Category) {
    setConnectingCatId(cat.id)
    try {
      await zohoApi.ensureExpenseCategory(cat.id, cat.name)
      await refresh('categories')
    } catch (e) {
      alert(`Couldn't link "${cat.name}" to Zoho: ${(e as Error).message}`)
    } finally {
      setConnectingCatId(null)
    }
  }

  const accName = (id: string | null) => accounts.find((a) => a.id === id)?.name

  return (
    <div>
      <div className="page-head rise">
        <div>
          <h2>Subscriptions</h2>
          <div className="sub">Recurring expenses &amp; subscription tracker</div>
        </div>
        <button className="btn primary pill" onClick={openNew}>+ Add subscription</button>
      </div>

      {unlinkedSubCategories.length > 0 && (
        <div className="alert warning rise" style={{ marginBottom: 14, alignItems: 'center', justifyContent: 'space-between' }}>
          <span>
            {unlinkedSubCategories.map((c) => `"${c.name}"`).join(', ')} {unlinkedSubCategories.length === 1 ? 'isn\'t' : 'aren\'t'} linked to Zoho Invoice yet —
            connect it once and every "Log payment" from a subscription in that category will sync to Zoho Invoice as an expense automatically.
          </span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 'none' }}>
            {unlinkedSubCategories.map((c) => (
              <button key={c.id} className="btn sm pill" disabled={connectingCatId === c.id} onClick={() => connectCategoryToZoho(c)}>
                {connectingCatId === c.id ? 'Connecting…' : `Connect "${c.name}"`}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid cols-3 rise rise-1" style={{ marginBottom: 14 }}>
        <div className="card card-pad kpi">
          <span className="label">Monthly cost</span>
          <span className="value lg num">{fmtLKR(monthlyAnimated)}</span>
          <span className="sub">{fmtLKR(yearlyCost)} / year equivalent</span>
        </div>
        <div className="card card-pad kpi">
          <span className="label">Active subscriptions</span>
          <span className="value lg num">{active.length}</span>
          <span className="sub">{cancelled.length} cancelled</span>
        </div>
        <div className="card card-pad kpi">
          <span className="label">Renewing in 30 days</span>
          <span className="value lg num">{upcoming.length}</span>
          <span className="sub">{upcoming[0] ? `Next: ${upcoming[0].name} · ${fmtDate(upcoming[0].next_renewal_date)}` : 'Nothing due soon'}</span>
        </div>
      </div>

      {upcoming.length > 0 && (
        <section className="card hoverable rise rise-2" style={{ marginBottom: 14 }}>
          <div className="card-pad">
            <div className="section-head"><h3>Upcoming renewals</h3><span className="hint">Next 30 days &middot; {fmtLKR(upcoming.reduce((sum, s) => sum + s.amount, 0))} total</span></div>
            <div className="avatar-stack" style={{ marginBottom: 14 }}>
              {upcoming.slice(0, 8).map((s, i) => (
                <span key={s.id} className="stack-item" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }} title={s.name}>{initials(s.name)}</span>
              ))}
              {upcoming.length > 8 && <span className="stack-item stack-more">+{upcoming.length - 8}</span>}
            </div>
            {UPCOMING_SECTIONS.map((section) => {
              const items = upcoming.filter((s) => section.test(daysUntil(s.next_renewal_date) ?? 0))
              if (items.length === 0) return null
              return (
                <div key={section.key}>
                  <div className="list-section-label">{section.label} <span className="count">&middot; {items.length}</span></div>
                  {items.map((s) => {
                    const colorIdx = upcoming.indexOf(s)
                    const days = daysUntil(s.next_renewal_date) ?? 0
                    return (
                      <div className="sub-row" key={s.id}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                          <span className="sub-icon" style={{ background: AVATAR_COLORS[colorIdx % AVATAR_COLORS.length] }}>{initials(s.name)}</span>
                          <div style={{ minWidth: 0 }}>
                            <div className="sub-row-name">
                              <span style={{ fontWeight: 700, fontSize: 13.5 }}>{s.name}</span>
                              <span className={`pill ${s.owner === 'business' ? 'brand' : 'accent'}`}>{OWNER_LABEL[s.owner]}</span>
                            </div>
                            <div className="sub-row-meta">
                              <span className="pill neutral">{CYCLE_LABEL[s.billing_cycle]}</span>
                              <span className={`pill ${urgencyPillClass(days)}`}>{urgencyLabel(days)}</span>
                              <span className="sub" style={{ fontSize: 11.5 }}>{fmtDate(s.next_renewal_date)}</span>
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
                          <span className="num" style={{ fontWeight: 800 }}>{fmtLKR(s.amount)}</span>
                          <button className="btn sm pill" disabled={loggingId === s.id} onClick={() => logPayment(s)}>{loggingId === s.id ? 'Logging…' : 'Log payment'}</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section className="card hoverable rise rise-3">
        <div className="card-pad">
          <div className="section-head">
            <h3>All subscriptions</h3>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-muted)', fontWeight: 600, cursor: 'pointer' }}>
              <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} style={{ width: 'auto' }} />
              Show cancelled
            </label>
          </div>
          {loading ? <div className="empty">Loading…</div> : (
            <div className="table-scroll">
              <table>
                <thead><tr><th>Name</th><th>Cycle</th><th className="num">Amount</th><th className="num">Monthly equiv.</th><th>Next renewal</th><th>Owner</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {subscriptions.filter((s) => showCancelled || s.status === 'active').map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}{accName(s.account_id) ? <div className="sub" style={{ fontSize: 11 }}>{accName(s.account_id)}</div> : null}</td>
                      <td>{CYCLE_LABEL[s.billing_cycle]}</td>
                      <td className="num">{fmtLKR(s.amount)}</td>
                      <td className="num">{fmtLKR(subscriptionMonthlyCost(s))}</td>
                      <td>{fmtDate(s.next_renewal_date)}</td>
                      <td><span className={`pill ${s.owner === 'business' ? 'brand' : 'accent'}`}>{OWNER_LABEL[s.owner]}</span></td>
                      <td><span className={`pill ${s.status === 'active' ? 'good' : 'neutral'}`}>{s.status}</span></td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn sm" onClick={() => openEdit(s)}>Edit</button>{' '}
                        <button className="btn sm" onClick={() => toggleStatus(s)}>{s.status === 'active' ? 'Cancel' : 'Reactivate'}</button>{' '}
                        <button className="btn sm danger" onClick={() => remove(s.id)}>Delete</button>
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
        <Modal title={editing.id ? 'Edit subscription' : 'Add subscription'} onClose={() => setEditing(null)} footer={
          <>
            <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </>
        }>
          <div className="field">
            <label>Name</label>
            <input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Netflix, Adobe Creative Cloud, Domain renewal…" autoFocus />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Amount (Rs)</label>
              <input type="number" value={Math.abs(editing.amount ?? 0)} onChange={(e) => setEditing({ ...editing, amount: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>Billing cycle</label>
              <select value={editing.billing_cycle ?? 'monthly'} onChange={(e) => setEditing({ ...editing, billing_cycle: e.target.value as BillingCycle })}>
                {(Object.keys(CYCLE_LABEL) as BillingCycle[]).map((c) => <option key={c} value={c}>{CYCLE_LABEL[c]}</option>)}
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Next renewal date</label>
              <input type="date" value={editing.next_renewal_date ?? todayISO()} onChange={(e) => setEditing({ ...editing, next_renewal_date: e.target.value })} />
            </div>
            <div className="field">
              <label>Owner</label>
              <select value={editing.owner ?? 'personal'} onChange={(e) => setEditing({ ...editing, owner: e.target.value as Owner })}>
                <option value="personal">Personal</option>
                <option value="business">Business</option>
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Category (optional)</label>
              <select value={editing.category_id ?? ''} onChange={(e) => setEditing({ ...editing, category_id: e.target.value || null })}>
                <option value="">Uncategorised</option>
                {expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Pay from account (optional)</label>
              <select value={editing.account_id ?? ''} onChange={(e) => setEditing({ ...editing, account_id: e.target.value || null })}>
                <option value="">No account</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Notes</label>
            <input value={editing.notes ?? ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} placeholder="Optional notes" />
          </div>
        </Modal>
      )}
    </div>
  )
}
