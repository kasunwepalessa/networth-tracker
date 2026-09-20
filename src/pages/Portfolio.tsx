import { useState } from 'react'
import { useData } from '../lib/useData'
import { assetsApi, liabilitiesApi, fixedDepositsApi, investmentsApi } from '../lib/api'
import Modal from '../components/Modal'
import {
  fmtLKR, fmtPct, fmtDate, todayISO, daysUntil,
  ASSET_TYPE_LABEL, LIABILITY_TYPE_LABEL, INVESTMENT_TYPE_LABEL, OWNER_LABEL,
} from '../lib/format'
import { investmentValue, investmentGain, investmentReturnPct, monthsToPayoff } from '../lib/calc'
import type { Asset, Liability, FixedDeposit, Investment, Owner } from '../lib/types'

type Tab = 'assets' | 'liabilities' | 'fds' | 'investments'

export default function Portfolio() {
  const [tab, setTab] = useState<Tab>('assets')
  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Assets &amp; Liabilities</h2>
          <div className="sub">Everything you own and everything you owe</div>
        </div>
      </div>
      <div className="tabs">
        <button className={tab === 'assets' ? 'active' : ''} onClick={() => setTab('assets')}>Assets</button>
        <button className={tab === 'liabilities' ? 'active' : ''} onClick={() => setTab('liabilities')}>Liabilities</button>
        <button className={tab === 'fds' ? 'active' : ''} onClick={() => setTab('fds')}>Fixed Deposits</button>
        <button className={tab === 'investments' ? 'active' : ''} onClick={() => setTab('investments')}>Investments</button>
      </div>
      {tab === 'assets' && <AssetsTab />}
      {tab === 'liabilities' && <LiabilitiesTab />}
      {tab === 'fds' && <FdsTab />}
      {tab === 'investments' && <InvestmentsTab />}
    </div>
  )
}

const assetEmpty: Partial<Asset> = { name: '', type: 'other', owner: 'personal', quantity: 1, purchase_price: null, current_value: 0, purchase_date: todayISO(), notes: '' }

function AssetsTab() {
  const { assets, refresh, loading } = useData()
  const [editing, setEditing] = useState<Partial<Asset> | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!editing || !editing.name) return
    setSaving(true)
    try {
      if (editing.id) await assetsApi.update(editing.id, editing)
      else await assetsApi.create(editing)
      await refresh('assets')
      setEditing(null)
    } finally { setSaving(false) }
  }
  async function remove(id: string) {
    if (!confirm('Delete this asset?')) return
    await assetsApi.remove(id)
    await refresh('assets')
  }

  const total = assets.reduce((s, a) => s + a.current_value * (a.quantity || 1), 0)

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 12 }}>
        <div className="sub">Total: <strong className="num">{fmtLKR(total)}</strong></div>
        <button className="btn primary" onClick={() => setEditing(assetEmpty)}>+ Add asset</button>
      </div>
      <section className="card"><div className="card-pad">
        {loading ? <div className="empty">Loading…</div> : assets.length === 0 ? (
          <div className="empty">No assets yet — property, vehicles, gold, equipment, receivables and more.</div>
        ) : (
          <div className="table-scroll"><table>
            <thead><tr><th>Name</th><th>Type</th><th>Owner</th><th className="num">Qty</th><th className="num">Purchase price</th><th className="num">Current value</th><th></th></tr></thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{ASSET_TYPE_LABEL[a.type]}</td>
                  <td><span className={`pill ${a.owner === 'business' ? 'brand' : 'accent'}`}>{OWNER_LABEL[a.owner]}</span></td>
                  <td className="num">{a.quantity}</td>
                  <td className="num">{a.purchase_price != null ? fmtLKR(a.purchase_price) : '—'}</td>
                  <td className="num">{fmtLKR(a.current_value * (a.quantity || 1))}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn sm" onClick={() => setEditing(a)}>Edit</button>{' '}
                    <button className="btn sm danger" onClick={() => remove(a.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div></section>

      {editing && (
        <Modal title={editing.id ? 'Edit asset' : 'Add asset'} onClose={() => setEditing(null)} footer={<>
          <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={saving || !editing.name}>{saving ? 'Saving…' : 'Save'}</button>
        </>}>
          <div className="field"><label>Name</label><input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. 22K gold necklace, Honda Vezel, MacBook Pro" autoFocus /></div>
          <div className="field-row">
            <div className="field"><label>Type</label>
              <select value={editing.type ?? 'other'} onChange={(e) => setEditing({ ...editing, type: e.target.value as Asset['type'] })}>
                {Object.entries(ASSET_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="field"><label>Owner</label>
              <select value={editing.owner ?? 'personal'} onChange={(e) => setEditing({ ...editing, owner: e.target.value as Owner })}>
                <option value="personal">Personal</option><option value="business">Business</option>
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field"><label>Quantity</label><input type="number" value={editing.quantity ?? 1} onChange={(e) => setEditing({ ...editing, quantity: Number(e.target.value) })} /></div>
            <div className="field"><label>Purchase price (each)</label><input type="number" value={editing.purchase_price ?? ''} onChange={(e) => setEditing({ ...editing, purchase_price: e.target.value ? Number(e.target.value) : null })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Current value (each, estimated)</label><input type="number" value={editing.current_value ?? 0} onChange={(e) => setEditing({ ...editing, current_value: Number(e.target.value) })} /></div>
            <div className="field"><label>Purchase date</label><input type="date" value={editing.purchase_date ?? ''} onChange={(e) => setEditing({ ...editing, purchase_date: e.target.value })} /></div>
          </div>
          <div className="field"><label>Notes</label><input value={editing.notes ?? ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></div>
        </Modal>
      )}
    </div>
  )
}

const liabilityEmpty: Partial<Liability> = { name: '', type: 'personal_loan', owner: 'personal', principal: null, remaining_balance: 0, interest_rate: null, monthly_payment: null, start_date: null, payoff_date: null, next_due_date: null, notes: '' }

function LiabilitiesTab() {
  const { liabilities, refresh, loading } = useData()
  const [editing, setEditing] = useState<Partial<Liability> | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!editing || !editing.name) return
    setSaving(true)
    try {
      if (editing.id) await liabilitiesApi.update(editing.id, editing)
      else await liabilitiesApi.create(editing)
      await refresh('liabilities')
      setEditing(null)
    } finally { setSaving(false) }
  }
  async function remove(id: string) {
    if (!confirm('Delete this liability?')) return
    await liabilitiesApi.remove(id)
    await refresh('liabilities')
  }

  const total = liabilities.reduce((s, l) => s + l.remaining_balance, 0)

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 12 }}>
        <div className="sub">Total remaining: <strong className="num" style={{ color: 'var(--critical)' }}>{fmtLKR(total)}</strong></div>
        <button className="btn primary" onClick={() => setEditing(liabilityEmpty)}>+ Add liability</button>
      </div>
      <section className="card"><div className="card-pad">
        {loading ? <div className="empty">Loading…</div> : liabilities.length === 0 ? (
          <div className="empty">No liabilities recorded — loans, leases, mortgages, and money you owe.</div>
        ) : (
          <div className="table-scroll"><table>
            <thead><tr><th>Name</th><th>Type</th><th>Owner</th><th className="num">Remaining</th><th className="num">Rate</th><th className="num">Payment</th><th>Payoff forecast</th><th></th></tr></thead>
            <tbody>
              {liabilities.map((l) => {
                const months = monthsToPayoff(l.remaining_balance, l.interest_rate ?? 0, l.monthly_payment ?? 0)
                const d = daysUntil(l.next_due_date)
                return (
                  <tr key={l.id}>
                    <td>{l.name}</td>
                    <td>{LIABILITY_TYPE_LABEL[l.type]}</td>
                    <td><span className={`pill ${l.owner === 'business' ? 'brand' : 'accent'}`}>{OWNER_LABEL[l.owner]}</span></td>
                    <td className="num">{fmtLKR(l.remaining_balance)}</td>
                    <td className="num">{l.interest_rate != null ? `${l.interest_rate}%` : '—'}</td>
                    <td className="num">
                      {l.monthly_payment != null ? fmtLKR(l.monthly_payment) : '—'}
                      {d !== null && <div className="sub" style={{ fontSize: 11, color: d < 0 ? 'var(--critical)' : undefined }}>{d < 0 ? 'overdue' : `due in ${d}d`}</div>}
                    </td>
                    <td>{months === null ? '—' : months === 0 ? 'Paid off' : `~${months} mo (${fmtDate(addMonthsISO(months))})`}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn sm" onClick={() => setEditing(l)}>Edit</button>{' '}
                      <button className="btn sm danger" onClick={() => remove(l.id)}>Delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
      </div></section>

      {editing && (
        <Modal title={editing.id ? 'Edit liability' : 'Add liability'} onClose={() => setEditing(null)} footer={<>
          <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={saving || !editing.name}>{saving ? 'Saving…' : 'Save'}</button>
        </>}>
          <div className="field"><label>Name</label><input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Vehicle lease — HNB" autoFocus /></div>
          <div className="field-row">
            <div className="field"><label>Type</label>
              <select value={editing.type ?? 'personal_loan'} onChange={(e) => setEditing({ ...editing, type: e.target.value as Liability['type'] })}>
                {Object.entries(LIABILITY_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="field"><label>Owner</label>
              <select value={editing.owner ?? 'personal'} onChange={(e) => setEditing({ ...editing, owner: e.target.value as Owner })}>
                <option value="personal">Personal</option><option value="business">Business</option>
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field"><label>Original principal</label><input type="number" value={editing.principal ?? ''} onChange={(e) => setEditing({ ...editing, principal: e.target.value ? Number(e.target.value) : null })} /></div>
            <div className="field"><label>Remaining balance</label><input type="number" value={editing.remaining_balance ?? 0} onChange={(e) => setEditing({ ...editing, remaining_balance: Number(e.target.value) })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Interest rate (annual %)</label><input type="number" step="0.1" value={editing.interest_rate ?? ''} onChange={(e) => setEditing({ ...editing, interest_rate: e.target.value ? Number(e.target.value) : null })} /></div>
            <div className="field"><label>Monthly payment</label><input type="number" value={editing.monthly_payment ?? ''} onChange={(e) => setEditing({ ...editing, monthly_payment: e.target.value ? Number(e.target.value) : null })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Next payment due</label><input type="date" value={editing.next_due_date ?? ''} onChange={(e) => setEditing({ ...editing, next_due_date: e.target.value })} /></div>
            <div className="field"><label>Start date</label><input type="date" value={editing.start_date ?? ''} onChange={(e) => setEditing({ ...editing, start_date: e.target.value })} /></div>
          </div>
          <div className="field"><label>Notes</label><input value={editing.notes ?? ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></div>
        </Modal>
      )}
    </div>
  )
}

function addMonthsISO(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

const fdEmpty: Partial<FixedDeposit> = { bank: '', owner: 'personal', amount: 0, rate: 0, start_date: todayISO(), maturity_date: todayISO(), expected_interest: null, status: 'active', notes: '' }

function FdsTab() {
  const { fixedDeposits, refresh, loading } = useData()
  const [editing, setEditing] = useState<Partial<FixedDeposit> | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!editing || !editing.bank) return
    setSaving(true)
    try {
      if (editing.id) await fixedDepositsApi.update(editing.id, editing)
      else await fixedDepositsApi.create(editing)
      await refresh('fixedDeposits')
      setEditing(null)
    } finally { setSaving(false) }
  }
  async function remove(id: string) {
    if (!confirm('Delete this fixed deposit?')) return
    await fixedDepositsApi.remove(id)
    await refresh('fixedDeposits')
  }

  const activeTotal = fixedDeposits.filter((f) => f.status === 'active').reduce((s, f) => s + f.amount, 0)

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 12 }}>
        <div className="sub">Active FDs: <strong className="num">{fmtLKR(activeTotal)}</strong></div>
        <button className="btn primary" onClick={() => setEditing(fdEmpty)}>+ Add fixed deposit</button>
      </div>
      <section className="card"><div className="card-pad">
        {loading ? <div className="empty">Loading…</div> : fixedDeposits.length === 0 ? (
          <div className="empty">No fixed deposits yet.</div>
        ) : (
          <div className="table-scroll"><table>
            <thead><tr><th>Bank</th><th>Owner</th><th className="num">Amount</th><th className="num">Rate</th><th>Maturity</th><th className="num">Expected interest</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {fixedDeposits.map((f) => {
                const d = daysUntil(f.maturity_date)
                return (
                  <tr key={f.id}>
                    <td>{f.bank}</td>
                    <td><span className={`pill ${f.owner === 'business' ? 'brand' : 'accent'}`}>{OWNER_LABEL[f.owner]}</span></td>
                    <td className="num">{fmtLKR(f.amount)}</td>
                    <td className="num">{f.rate}%</td>
                    <td>{fmtDate(f.maturity_date)}{f.status === 'active' && d !== null && <div className="sub" style={{ fontSize: 11, color: d <= 14 ? 'var(--warning)' : undefined }}>{d < 0 ? 'matured' : `in ${d}d`}</div>}</td>
                    <td className="num">{f.expected_interest != null ? fmtLKR(f.expected_interest) : '—'}</td>
                    <td><span className={`pill ${f.status === 'active' ? 'good' : 'neutral'}`}>{f.status}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn sm" onClick={() => setEditing(f)}>Edit</button>{' '}
                      <button className="btn sm danger" onClick={() => remove(f.id)}>Delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
      </div></section>

      {editing && (
        <Modal title={editing.id ? 'Edit fixed deposit' : 'Add fixed deposit'} onClose={() => setEditing(null)} footer={<>
          <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={saving || !editing.bank}>{saving ? 'Saving…' : 'Save'}</button>
        </>}>
          <div className="field"><label>Bank</label><input value={editing.bank ?? ''} onChange={(e) => setEditing({ ...editing, bank: e.target.value })} placeholder="e.g. Commercial Bank" autoFocus /></div>
          <div className="field-row">
            <div className="field"><label>Owner</label>
              <select value={editing.owner ?? 'personal'} onChange={(e) => setEditing({ ...editing, owner: e.target.value as Owner })}>
                <option value="personal">Personal</option><option value="business">Business</option>
              </select>
            </div>
            <div className="field"><label>Status</label>
              <select value={editing.status ?? 'active'} onChange={(e) => setEditing({ ...editing, status: e.target.value as FixedDeposit['status'] })}>
                <option value="active">Active</option><option value="matured">Matured</option><option value="reinvested">Reinvested</option><option value="withdrawn">Withdrawn</option>
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field"><label>Amount</label><input type="number" value={editing.amount ?? 0} onChange={(e) => setEditing({ ...editing, amount: Number(e.target.value) })} /></div>
            <div className="field"><label>Annual rate (%)</label><input type="number" step="0.1" value={editing.rate ?? 0} onChange={(e) => setEditing({ ...editing, rate: Number(e.target.value) })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Start date</label><input type="date" value={editing.start_date ?? ''} onChange={(e) => setEditing({ ...editing, start_date: e.target.value })} /></div>
            <div className="field"><label>Maturity date</label><input type="date" value={editing.maturity_date ?? ''} onChange={(e) => setEditing({ ...editing, maturity_date: e.target.value })} /></div>
          </div>
          <div className="field"><label>Expected interest at maturity</label><input type="number" value={editing.expected_interest ?? ''} onChange={(e) => setEditing({ ...editing, expected_interest: e.target.value ? Number(e.target.value) : null })} /></div>
        </Modal>
      )}
    </div>
  )
}

const investmentEmpty: Partial<Investment> = { name: '', type: 'shares', owner: 'personal', quantity: 0, purchase_price: 0, current_price: 0, purchase_date: todayISO(), notes: '' }

function InvestmentsTab() {
  const { investments, refresh, loading } = useData()
  const [editing, setEditing] = useState<Partial<Investment> | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!editing || !editing.name) return
    setSaving(true)
    try {
      if (editing.id) await investmentsApi.update(editing.id, editing)
      else await investmentsApi.create(editing)
      await refresh('investments')
      setEditing(null)
    } finally { setSaving(false) }
  }
  async function remove(id: string) {
    if (!confirm('Delete this investment?')) return
    await investmentsApi.remove(id)
    await refresh('investments')
  }

  const totalValue = investments.reduce((s, i) => s + investmentValue(i), 0)
  const totalGain = investments.reduce((s, i) => s + investmentGain(i), 0)

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 12 }}>
        <div className="sub">Portfolio value: <strong className="num">{fmtLKR(totalValue)}</strong> &middot; Gain/loss: <strong className="num" style={{ color: totalGain >= 0 ? 'var(--good)' : 'var(--critical)' }}>{fmtLKR(totalGain, { sign: true })}</strong></div>
        <button className="btn primary" onClick={() => setEditing(investmentEmpty)}>+ Add investment</button>
      </div>
      <section className="card"><div className="card-pad">
        {loading ? <div className="empty">Loading…</div> : investments.length === 0 ? (
          <div className="empty">No investments yet — shares, unit trusts, ETFs, crypto.</div>
        ) : (
          <div className="table-scroll"><table>
            <thead><tr><th>Name</th><th>Type</th><th>Owner</th><th className="num">Qty</th><th className="num">Cost basis</th><th className="num">Value</th><th className="num">Return</th><th></th></tr></thead>
            <tbody>
              {investments.map((i) => {
                const gain = investmentGain(i)
                return (
                  <tr key={i.id}>
                    <td>{i.name}</td>
                    <td>{INVESTMENT_TYPE_LABEL[i.type]}</td>
                    <td><span className={`pill ${i.owner === 'business' ? 'brand' : 'accent'}`}>{OWNER_LABEL[i.owner]}</span></td>
                    <td className="num">{i.quantity}</td>
                    <td className="num">{fmtLKR(i.quantity * i.purchase_price)}</td>
                    <td className="num">{fmtLKR(investmentValue(i))}</td>
                    <td className="num" style={{ color: gain >= 0 ? 'var(--good)' : 'var(--critical)' }}>{fmtPct(investmentReturnPct(i))}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn sm" onClick={() => setEditing(i)}>Edit</button>{' '}
                      <button className="btn sm danger" onClick={() => remove(i.id)}>Delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
      </div></section>

      {editing && (
        <Modal title={editing.id ? 'Edit investment' : 'Add investment'} onClose={() => setEditing(null)} footer={<>
          <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={saving || !editing.name}>{saving ? 'Saving…' : 'Save'}</button>
        </>}>
          <div className="field"><label>Name</label><input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. JKH.N0000, Bitcoin, NDB Wealth Fund" autoFocus /></div>
          <div className="field-row">
            <div className="field"><label>Type</label>
              <select value={editing.type ?? 'shares'} onChange={(e) => setEditing({ ...editing, type: e.target.value as Investment['type'] })}>
                {Object.entries(INVESTMENT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="field"><label>Owner</label>
              <select value={editing.owner ?? 'personal'} onChange={(e) => setEditing({ ...editing, owner: e.target.value as Owner })}>
                <option value="personal">Personal</option><option value="business">Business</option>
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field"><label>Quantity / units</label><input type="number" value={editing.quantity ?? 0} onChange={(e) => setEditing({ ...editing, quantity: Number(e.target.value) })} /></div>
            <div className="field"><label>Purchase price (per unit)</label><input type="number" value={editing.purchase_price ?? 0} onChange={(e) => setEditing({ ...editing, purchase_price: Number(e.target.value) })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Current price (per unit)</label><input type="number" value={editing.current_price ?? 0} onChange={(e) => setEditing({ ...editing, current_price: Number(e.target.value) })} /></div>
            <div className="field"><label>Purchase date</label><input type="date" value={editing.purchase_date ?? ''} onChange={(e) => setEditing({ ...editing, purchase_date: e.target.value })} /></div>
          </div>
          <div className="field"><label>Notes</label><input value={editing.notes ?? ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></div>
        </Modal>
      )}
    </div>
  )
}
