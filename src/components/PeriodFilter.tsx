import { useMemo, useState } from 'react'
import { periodRange, shiftPeriod, type PeriodType, type PeriodRange } from '../lib/calc'
import { fmtDate } from '../lib/format'

export const PERIOD_LABEL: Record<PeriodType, string> = {
  all: 'All time', daily: 'Daily', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly', custom: 'Custom',
}

export function periodTitle(type: PeriodType, anchor: Date, customStart: string, customEnd: string): string {
  if (type === 'all') return 'All time'
  if (type === 'daily') return anchor.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  if (type === 'monthly') return anchor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  if (type === 'quarterly') return `Q${Math.floor(anchor.getMonth() / 3) + 1} ${anchor.getFullYear()}`
  if (type === 'yearly') return String(anchor.getFullYear())
  if (customStart && customEnd) return `${fmtDate(customStart)} – ${fmtDate(customEnd)}`
  return 'Pick a date range'
}

export interface UsePeriodFilterResult {
  periodType: PeriodType
  setPeriodType: (t: PeriodType) => void
  anchor: Date
  setAnchor: (d: Date) => void
  customStart: string
  setCustomStart: (s: string) => void
  customEnd: string
  setCustomEnd: (s: string) => void
  range: PeriodRange | null
  title: string
}

export function usePeriodFilter(initial: PeriodType = 'all'): UsePeriodFilterResult {
  const [periodType, setPeriodType] = useState<PeriodType>(initial)
  const [anchor, setAnchor] = useState(() => new Date())
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  const range = useMemo(
    () => periodRange(periodType, anchor, customStart, customEnd),
    [periodType, anchor, customStart, customEnd],
  )
  const title = periodTitle(periodType, anchor, customStart, customEnd)

  return { periodType, setPeriodType, anchor, setAnchor, customStart, setCustomStart, customEnd, setCustomEnd, range, title }
}

/** A compact, reusable period-type tab strip with prev/next navigation and optional custom date inputs.
 *  Drop into a `.card card-pad` wrapper, or use `bare` for an unwrapped inline version. */
export default function PeriodFilterBar({ pf, bare }: { pf: UsePeriodFilterResult; bare?: boolean }) {
  const inner = (
    <>
      <div className="tabs pill-tabs" style={{ marginBottom: pf.periodType === 'all' ? 0 : 12 }}>
        {(['all', 'daily', 'monthly', 'quarterly', 'yearly', 'custom'] as PeriodType[]).map((p) => (
          <button key={p} className={pf.periodType === p ? 'active' : ''} onClick={() => pf.setPeriodType(p)}>{PERIOD_LABEL[p]}</button>
        ))}
      </div>
      {pf.periodType === 'custom' ? (
        <div className="field-row" style={{ marginBottom: 0 }}>
          <div className="field" style={{ maxWidth: 180 }}>
            <label>From</label>
            <input type="date" value={pf.customStart} onChange={(e) => pf.setCustomStart(e.target.value)} />
          </div>
          <div className="field" style={{ maxWidth: 180 }}>
            <label>To</label>
            <input type="date" value={pf.customEnd} onChange={(e) => pf.setCustomEnd(e.target.value)} />
          </div>
        </div>
      ) : pf.periodType !== 'all' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
          <button className="btn sm round" onClick={() => pf.setAnchor(shiftPeriod(pf.periodType, pf.anchor, -1))} aria-label="Previous period">&larr;</button>
          <span style={{ fontWeight: 700, fontSize: 13.5, minWidth: 140, textAlign: 'center' }}>{pf.title}</span>
          <button className="btn sm round" onClick={() => pf.setAnchor(shiftPeriod(pf.periodType, pf.anchor, 1))} aria-label="Next period">&rarr;</button>
          <button className="btn sm" onClick={() => pf.setAnchor(new Date())}>Today</button>
        </div>
      ) : null}
    </>
  )
  if (bare) return inner
  return <div className="card card-pad" style={{ marginBottom: 14 }}>{inner}</div>
}
