import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import './SyncStatus.css'

/** Status belongs to a single academic group, not to the app as a whole. */
export interface ScheduleSyncStatus {
  groupId: string
  status: 'success' | 'loading' | 'error' | 'unknown'
  lastSuccessAt?: string
  lastCheckedAt?: string
  error?: string
}

interface Props {
  sourceKind: 'demo' | 'external'
  groupId: string
  sync?: ScheduleSyncStatus
}

function relativeTime(iso: string | undefined, now: number): string | null {
  if (!iso) return null
  const time = new Date(iso).getTime()
  if (!Number.isFinite(time) || time > now) return null
  const minutes = Math.floor((now - time) / 60_000)
  if (minutes < 1) return 'щойно'
  if (minutes < 60) return `${minutes} хв тому`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} год тому`
  return new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(time)
}

export function SyncStatus({ sourceKind, groupId, sync }: Props) {
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(Date.now)
  const [shift, setShift] = useState(0)
  const anchor = useRef<HTMLSpanElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const tip = useRef<HTMLSpanElement>(null)
  const tooltipId = useId()
  // A previous group's successful update is never attributed to another group.
  const current = sourceKind === 'external' && sync?.groupId === groupId ? sync : undefined
  const lastSuccess = relativeTime(current?.lastSuccessAt, now)
  const status = sourceKind === 'demo' ? 'unknown' : current?.status === 'success' && !lastSuccess ? 'unknown' : current?.status || 'unknown'

  useEffect(() => {
    setOpen(false)
  }, [groupId, sourceKind])

  useEffect(() => {
    if (!open) return
    setNow(Date.now())
    const clock = window.setInterval(() => setNow(Date.now()), 60_000)
    const outside = (event: PointerEvent) => { if (!anchor.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { window.clearInterval(clock); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])

  useLayoutEffect(() => {
    if (!open || !tip.current || !anchor.current) return
    const move = () => {
      if (!tip.current || !anchor.current) return
      const baseLeft = anchor.current.getBoundingClientRect().left - 100
      const width = tip.current.offsetWidth
      const minShift = 12 - baseLeft
      const maxShift = window.innerWidth - 12 - baseLeft - width
      setShift(Math.max(minShift, Math.min(0, maxShift)))
    }
    move()
    window.addEventListener('resize', move)
    return () => window.removeEventListener('resize', move)
  }, [open])

  const title = sourceKind === 'demo' ? 'Дані розкладу' : status === 'success' ? 'Розклад оновлено' : status === 'loading' ? 'Оновлюється…' : status === 'error' ? 'Не вдалося оновити' : 'Дані ще не завантажені'
  return <span className="dp-sync-anchor" ref={anchor}>
    <button ref={trigger} type="button" className="dp-sync-button" data-state={status} aria-label="Показати стан оновлення розкладу" aria-expanded={open} aria-describedby={open ? tooltipId : undefined} onClick={() => setOpen(value => !value)}>
      <span className="dp-sync-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {status === 'success' ? <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.6 2.6L16 9"/></> : status === 'loading' ? <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 12-2L20 12M4 12l2.4 5a7 7 0 0 0 12-2"/></> : status === 'error' ? <><circle cx="12" cy="12" r="9"/><path d="M12 8v4m0 4h.01"/></> : <><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></>}
      </svg></span>
    </button>
    {open && <span ref={tip} id={tooltipId} role="tooltip" className="dp-sync-tooltip" style={{ transform: `translateX(${shift}px)` }}><strong>{title}</strong>{sourceKind === 'demo' ? <span>Демонстраційний розклад · синхронізації немає</span> : lastSuccess ? <span>Остання успішна перевірка: {lastSuccess}</span> : status === 'error' ? <span>Остання успішна перевірка відсутня</span> : null}</span>}
  </span>
}
