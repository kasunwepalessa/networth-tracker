import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useData } from '../../lib/useData'
import { accountsCashTotal, totalAssets, totalLiabilities, investmentValue } from '../../lib/calc'
import { fmtLKR, fmtCompact, fmtDate } from '../../lib/format'
import { useCountUp } from '../../lib/useCountUp'
import type { Owner } from '../../lib/types'

type Scope = Owner | 'all'
type Range = '6m' | '1y' | '5y' | 'all'

export default function NetWorthDetail() {
  const { accounts, assets, investments, fixedDeposits, liabilities, snapshots, loading } = useData()
  const [scope, setScope] = useState<Scope>('all')
  const [range, setRange] = useState<Range>('1y')
  const ownerFilter = scope === 'all' ? undefined : scope

  const nwAssets = totalAssets(accounts, assets, investments, fixedDeposits, ownerFilter)
  const nwLiabilities = totalLiabilities(accounts, liabilities, ownerFilter)
  const netWorth = nwAssets - nwLiabilities
  const cash = accountsCashTotal(accounts, ownerFilter)
  const netWorthAnimated = useCountUp(netWorth)

  const chartData = useMemo(() => {
    const cutoff = new Date()
    if (range === '6m') cutoff.setMonth(cutoff.getMonth() - 6)
    else if (range === '1y') cutoff.setFullYear(cutoff.getFullYear() - 1)
    else if (range === '5y') cutoff.setFullYear(cutoff.getFullYear() - 5)
    else cutoff.setFullYear(2000)
    return snapshots.filter((s) => new Date(s.snapshot_date) >= cutoff).map((s) => ({ date: s.snapshot_date, netWorth: s.net_worth }))
  }, [snapshots, range])

  const filteredInvestments = investments.filter((i) => !ownerFilter || i.owner === ownerFilter)
  const filteredFDs = fixedDeposits.filter((f) => f.status === 'active' && (!ownerFilter || f.owner === ownerFilter))
  const filteredAssets = assets.filter((a) => !ownerFilter || a.owner === ownerFilter)
  const filteredLiabilities = liabilities.filter((l) => !ownerFilter || l.owner === ownerFilter)
  const filteredAccounts = accounts.filter((a) => !a.archived && (!ownerFilter || a.owner === ownerFilter))

  const invTotal = filteredInvestments.reduce((s, i) => s + investmentValue(i), 0)
  const fdTotal = filteredFDs.reduce((s, f) => s + f.amount, 0)
  const otherTotal = filteredAssets.reduce((s, a) => s + a.current_value * (a.quantity || 1), 0)
  const liabTotal = filteredLiabilities.reduce((s, l) => s + l.remaining_balance, 0)

  return (
    <div>
      <Link to="/" className="back-link rise">&larr; Back to dashboard</Link>
      <div className="page-head rise rise-1">
        <div>
          <h2>Net worth</h2>
          <div className="sub">Full breakdown of what you own and owe</div>
        </div>
        <div className="tabs" style={{ borderBottom: 'none', marginBottom: 0 }}>
          {(['all', 'personal', 'business'] as Scope[]).map((s) => (
            <button key={s} className={scope === s ? 'active' : ''} onClick={() => setScope(s)}>{s === 'all' ? 'All' : s === 'personal' ? 'Personal' : 'Business'}</button>
          ))}
        </div>
      </div>

      <section className="card hoverable rise rise-2" style={{ marginBottom: 14 }}>
        <div className="card-pad">
          <div className="hero-stat" style={{ paddingBottom: 6 }}>
            <span className="hero-value num" style={{ color: netWorth >= 0 ? 'var(--ink-1)' : 'var(--critical)' }}>{fmtLKR(netWorthAnimated)}</span>
            <div className="hero-label">Net worth &middot; assets {fmtCompact(nwAssets)} &minus; liabilities {fmtCompact(nwLiabilities)}</div>
          </div>
          <div className="section-head" style={{ marginTop: 10 }}>
            <h3>History</h3>
            <div className="tabs pill-tabs" style={{ marginBottom: 0 }}>
              {(['6m', '1y', '5y', 'all'] as Range[]).map((r) => (
                <button key={r} className={range === r ? 'active' : ''} onClick={() => setRange(r)}>{r === '6m' ? '6M' : r === '1y' ? '1Y' : r === '5y' ? '5Y' : 'All'}</button>
              ))}
            </div>
          </div>
          {chartData.length < 2 ? (
            <div className="empty">Not enough history yet — check back after a few days.</div>
          ) : (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="nwGradient2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.32} />
                      <stop offset="95%" stopColor="var(--brand)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10.5, fill: 'var(--ink-muted)' }} tickFormatter={(d) => fmtDate(d)} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10.5, fill: 'var(--ink-muted)' }} tickFormatter={(v) => fmtCompact(v)} width={60} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => fmtLKR(Number(v))} labelFormatter={(d) => fmtDate(d as string)} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} />
                  <Area type="monotone" dataKey="netWorth" stroke="var(--brand)" strokeWidth={2.25} fill="url(#nwGradient2)" dot={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      <div className="grid cols-2 rise rise-3" style={{ marginBottom: 14 }}>
        <section className="card hoverable">
          <div className="card-pad">
            <div className="section-head"><h3>Assets</h3><span className="hint">{fmtLKR(nwAssets)}</span></div>
            {loading ? <div className="empty">Loading…</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                <div className="hbar-row"><span className="hbar-label" style={{ width: 130 }}>Cash & bank</span><div className="hbar-track"><div className="hbar-fill" style={{ width: `${nwAssets > 0 ? (cash / nwAssets) * 100 : 0}%`, background: 'var(--cat-1)' }} /></div><span className="hbar-val num" style={{ width: 92 }}>{fmtCompact(cash)}</span></div>
                <div className="hbar-row"><span className="hbar-label" style={{ width: 130 }}>Investments ({filteredInvestments.length})</span><div className="hbar-track"><div className="hbar-fill" style={{ width: `${nwAssets > 0 ? (invTotal / nwAssets) * 100 : 0}%`, background: 'var(--cat-3)' }} /></div><span className="hbar-val num" style={{ width: 92 }}>{fmtCompact(invTotal)}</span></div>
                <div className="hbar-row"><span className="hbar-label" style={{ width: 130 }}>Fixed deposits ({filteredFDs.length})</span><div className="hbar-track"><div className="hbar-fill" style={{ width: `${nwAssets > 0 ? (fdTotal / nwAssets) * 100 : 0}%`, background: 'var(--cat-4)' }} /></div><span className="hbar-val num" style={{ width: 92 }}>{fmtCompact(fdTotal)}</span></div>
                <div className="hbar-row"><span className="hbar-label" style={{ width: 130 }}>Other assets ({filteredAssets.length})</span><div className="hbar-track"><div className="hbar-fill" style={{ width: `${nwAssets > 0 ? (otherTotal / nwAssets) * 100 : 0}%`, background: 'var(--cat-7)' }} /></div><span className="hbar-val num" style={{ width: 92 }}>{fmtCompact(otherTotal)}</span></div>
              </div>
            )}
            <Link to="/portfolio" className="btn sm pill" style={{ marginTop: 14, display: 'inline-flex' }}>Manage assets &amp; investments</Link>
          </div>
        </section>
        <section className="card hoverable">
          <div className="card-pad">
            <div className="section-head"><h3>Liabilities</h3><span className="hint">{fmtLKR(liabTotal)}</span></div>
            {filteredLiabilities.length === 0 ? <div className="empty">No liabilities recorded — nicely done.</div> : (
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Name</th><th>Due</th><th className="num">Balance</th></tr></thead>
                  <tbody>
                    {filteredLiabilities.map((l) => (
                      <tr key={l.id}><td>{l.name}</td><td>{fmtDate(l.next_due_date)}</td><td className="num" style={{ color: 'var(--critical)' }}>{fmtLKR(l.remaining_balance)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Link to="/portfolio" className="btn sm pill" style={{ marginTop: 14, display: 'inline-flex' }}>Manage liabilities</Link>
          </div>
        </section>
      </div>

      <section className="card hoverable rise rise-4">
        <div className="card-pad">
          <div className="section-head"><h3>Cash accounts</h3></div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Account</th><th>Type</th><th>Owner</th><th className="num">Balance</th></tr></thead>
              <tbody>
                {filteredAccounts.map((a) => (
                  <tr key={a.id}><td>{a.name}</td><td style={{ textTransform: 'capitalize' }}>{a.type.replace('_', ' ')}</td><td><span className={`pill ${a.owner === 'business' ? 'brand' : 'accent'}`}>{a.owner}</span></td><td className="num">{fmtLKR(a.balance)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  )
}
