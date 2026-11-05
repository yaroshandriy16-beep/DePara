import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { lessonsOnDate, monthRange, weekRange, type CalendarRange, type Lesson } from '../data/schedule'
import type { VnauResult } from '../data/vnau'
import './ScheduleShare.css'

type Period = 'week' | 'month'
type Props = { lessons: Lesson[]; group: string; selectedDate: Date; scheduleAvailable: boolean; sourceKind?: 'demo' | 'external'; coverage?: CalendarRange; lastSuccessAt?: string; stale?: boolean; loading?: boolean; loadRange?: (range: CalendarRange) => Promise<VnauResult> }
const dateLabel = new Intl.DateTimeFormat('uk-UA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const shortDate = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })
const addDays = (date: Date, offset: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset)

export function buildScheduleShareText(lessons: Lesson[], group: string, selectedDate: Date, period: Period, scheduleAvailable: boolean, sourceKind: 'demo' | 'external' = 'demo', lastSuccessAt?: string, stale = false): string {
  const start = period === 'week' ? addDays(selectedDate, -((selectedDate.getDay() + 6) % 7)) : new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  const end = period === 'week' ? addDays(start, 6) : new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0)
  const lines = [`ДеПара · ${group || 'Розклад'} · ${sourceKind === 'demo' ? 'ДЕМО' : 'ВНАУ'}`, `Розклад на ${period === 'week' ? 'тиждень' : 'місяць'}: ${shortDate.format(start)} — ${shortDate.format(end)}`, sourceKind === 'demo' ? 'Демонстраційні дані, не офіційний розклад.' : `Джерело: ВНАУ · МКР.${lastSuccessAt ? ` Перевірено: ${new Intl.DateTimeFormat('uk-UA', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Kyiv' }).format(new Date(lastSuccessAt))}.` : ''}${stale ? ' Показано збережені дані; джерело тимчасово недоступне.' : ''}`]
  if (!scheduleAvailable) return [...lines, '', sourceKind === 'demo' ? 'Дані демонстраційного розкладу для цієї групи недоступні.' : 'Дані розкладу ВНАУ за цей період недоступні.'].join('\n')
  let daysWithLessons = 0
  for (let day = start; day <= end; day = addDays(day, 1)) {
    const dayLessons = lessonsOnDate(lessons, day)
    if (!dayLessons.length) continue
    daysWithLessons++
    lines.push('', dateLabel.format(day))
    for (const lesson of dayLessons) lines.push(`• ${lesson.startsAt}–${lesson.endsAt} · ${lesson.title} (${lesson.type}) · ${lesson.location} · ${lesson.teacher}`)
  }
  if (!daysWithLessons) lines.push('', sourceKind === 'demo' ? 'У демонстраційному розкладі за цей період занять немає.' : 'За цей період занять немає.')
  return lines.join('\n')
}

export function ScheduleShare({ lessons, group, selectedDate, scheduleAvailable, sourceKind = 'demo', coverage, lastSuccessAt, stale = false, loading = false, loadRange }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [manualText, setManualText] = useState('')
  const [readyText, setReadyText] = useState('')
  const generation = useRef(0)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!open) return
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); return }
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),textarea:not(:disabled)') || [])
      if (!focusable.length) return
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable[focusable.length - 1].focus() }
      else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) { event.preventDefault(); focusable[0].focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  const close = () => { generation.current++; setOpen(false); setMessage(''); setManualText(''); setReadyText(''); setBusy(false); trigger.current?.focus() }
  const send = async (text: string) => {
    if (busy) return
    setBusy(true); setMessage(''); setManualText(''); setReadyText('')
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare({ text }))) {
        try {
          await navigator.share({ title: 'ДеПара · Розклад', text })
          setMessage('Системне меню поширення завершило роботу.')
          return
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') { setMessage('Поширення скасовано.'); return }
          // Share failed before completion: show the text for an explicit manual action.
          setManualText(text); setMessage('Не вдалося відкрити поширення. Скопіюйте текст вручну.')
          return
        }
      }
      if (navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(text); setMessage(sourceKind === 'demo' ? 'Демонстраційний розклад скопійовано.' : 'Розклад скопійовано.'); return } catch { /* Offer selectable text below. */ }
      }
      setManualText(text); setMessage('Автоматичне копіювання недоступне. Скопіюйте текст вручну.')
    } finally { setBusy(false) }
  }
  const share = async (period: Period) => {
    if (busy) return
    const requested = period === 'week' ? weekRange(selectedDate) : monthRange(selectedDate)
    if (sourceKind === 'external' && (!scheduleAvailable || !coverage || coverage.start > requested.start || coverage.end < requested.end)) {
      if (!loadRange) { setMessage('Дані ВНАУ за обраний період недоступні.'); return }
      const request = ++generation.current
      setBusy(true); setMessage('Готуємо розклад за обраний період…'); setManualText(''); setReadyText('')
      try {
        const result = await loadRange(requested)
        if (request !== generation.current) return
        if (!result.hasConfirmedData || result.coverageStart !== requested.start || result.coverageEnd !== requested.end) { setMessage('Дані ВНАУ за обраний період недоступні.'); return }
        setReadyText(buildScheduleShareText(result.lessons, group, selectedDate, period, true, 'external', result.lastSuccessAt, result.status !== 'success'))
        setMessage(result.status === 'success' ? 'Розклад готовий. Натисни кнопку нижче.' : 'Підготовлено збережений розклад: джерело тимчасово недоступне.')
      } catch {
        if (request === generation.current) setMessage('Не вдалося отримати розклад за обраний період.')
      } finally { if (request === generation.current) setBusy(false) }
      return
    }
    await send(buildScheduleShareText(lessons, group, selectedDate, period, scheduleAvailable, sourceKind, lastSuccessAt, stale))
  }
  return <>
    <button ref={trigger} type="button" className="schedule-share-trigger" disabled={sourceKind === 'external' && loading} onClick={() => { setMessage(''); setManualText(''); setReadyText(''); setOpen(true) }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V3m0 0L7 8m5-5 5 5"/><path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/></svg>Поділитися розкладом</button>
    {open && createPortal(<div className="schedule-share-backdrop" onClick={close}><section ref={dialog} className="schedule-share-sheet" role="dialog" aria-modal="true" aria-labelledby="schedule-share-title" onClick={event => event.stopPropagation()}><div className="schedule-share-handle" aria-hidden="true"/><h2 id="schedule-share-title">Поділитися розкладом</h2><p>{sourceKind === 'demo' ? 'Обери період. Заняття демонстраційні; реальний розклад ще не підключено.' : 'Обери період. Для поширення використовуються підтверджені дані ВНАУ.'}</p><div className="schedule-share-options"><button type="button" disabled={busy} onClick={() => void share('week')}>Тиждень</button><button type="button" disabled={busy} onClick={() => void share('month')}>Місяць</button></div>{message && <p className="schedule-share-message" role="status">{message}</p>}{readyText && <button type="button" className="schedule-share-close" disabled={busy} onClick={() => void send(readyText)}>Поділитися підготовленим розкладом</button>}{manualText && <label className="schedule-share-manual">Текст розкладу<textarea readOnly value={manualText} onFocus={event => event.currentTarget.select()}/></label>}<button type="button" className="schedule-share-close" onClick={close}>{message ? 'Закрити' : 'Скасувати'}</button></section></div>, document.body)}
  </>
}
