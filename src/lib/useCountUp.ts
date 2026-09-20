import { useEffect, useRef, useState } from 'react'

/** Animates a number from its previous value to `target` over `duration` ms.
 *  Respects prefers-reduced-motion by snapping instantly. */
export function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(target)
  const prevRef = useRef(target)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    // requestAnimationFrame is throttled or fully paused in a background/hidden tab, which would
    // otherwise leave the value stuck mid-animation (or at its initial 0) until the tab regains focus.
    const hidden = typeof document !== 'undefined' && document.hidden
    const from = prevRef.current
    const to = target
    if (reduced || hidden || !Number.isFinite(from) || !Number.isFinite(to) || from === to) {
      setValue(to)
      prevRef.current = to
      return
    }
    const start = performance.now()
    // Safety net: guarantee the true value lands even if rAF stalls partway (e.g. the tab is
    // backgrounded mid-animation) or fires far fewer times than expected.
    const settle = setTimeout(() => { setValue(to); prevRef.current = to }, duration + 150)
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(from + (to - from) * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
      else { prevRef.current = to; clearTimeout(settle) }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); clearTimeout(settle) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  return value
}
