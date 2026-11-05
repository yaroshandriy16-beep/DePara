import { useEffect, useState, type ReactNode } from 'react'
import { kyivNow, lessonOccursOnDate, lessonsOnDate, monthRange, weekRange, type CalendarRange, type Lesson } from '../data/schedule'
import './ScheduleScreens.css'

/** A real academic calendar will determine this value when a source provides it. */
export type AcademicWeek = 'numerator' | 'denominator' | 'unknown'
export type ScheduleViewMode = 'week' | 'month'
interface ScheduleScreenProps {
  lessons: Lesson[]
  scheduleAvailable?: boolean
  topbar: ReactNode
  statusControl: ReactNode
  shareControl: (selected: Date, mode: ScheduleViewMode) => ReactNode
  sourceKind?: 'demo' | 'external'
  loading?: boolean
  stale?: boolean
  coverage?: CalendarRange
  onRangeChange?: (range: CalendarRange) => void
}

const weekdayNames = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'НД']
const fullDate = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', weekday: 'long' })
const monthDate = new Intl.DateTimeFormat('uk-UA', { month: 'long', year: 'numeric' })
const shortDate = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long' })
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const addDays = (date: Date, amount: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount)
const startOfWeek = (date: Date) => addDays(date, -((date.getDay() + 6) % 7))
const minutes = (time: string) => { const [hours, mins] = time.split(':').map(Number); return hours * 60 + mins }
const lessonCount = (count: number) => `${count} ${count === 1 ? 'пара' : count >= 2 && count <= 4 ? 'пари' : 'пар'}`

function InfoIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8v1"/></svg> }

export function ScheduleScreen({ lessons, scheduleAvailable = true, topbar, statusControl, shareControl, sourceKind = 'demo', loading = false, stale = false, coverage, onRangeChange }: ScheduleScreenProps) {
  const [selected, setSelected] = useState(() => kyivNow())
  const [mode, setMode] = useState<ScheduleViewMode>('week')
  const [now, setNow] = useState(() => kyivNow())
  useEffect(() => { const timer = window.setInterval(() => setNow(kyivNow()), 30000); return () => window.clearInterval(timer) }, [])
  useEffect(() => { onRangeChange?.(mode === 'week' ? weekRange(selected) : monthRange(selected)) }, [selected, mode, onRangeChange])

  const weekStart = startOfWeek(selected)
  const monthStart = new Date(selected.getFullYear(), selected.getMonth(), 1)
  const monthEnd = new Date(selected.getFullYear(), selected.getMonth() + 1, 0)
  const gridStart = startOfWeek(monthStart)
  const gridLength = Math.max(35, Math.ceil(((monthStart.getDay() + 6) % 7 + monthEnd.getDate()) / 7) * 7)
  const shownDays = mode === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : Array.from({ length: gridLength }, (_, i) => addDays(gridStart, i))
  const shift = (amount: number) => setSelected(current => mode === 'week' ? addDays(current, amount * 7) : new Date(current.getFullYear(), current.getMonth() + amount, 1))
  const dayLessons = lessonsOnDate(lessons, selected)
  const minute = now.getHours() * 60 + now.getMinutes()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const rangeTitle = mode === 'month' ? monthDate.format(selected) : `${shortDate.format(weekStart)} — ${shortDate.format(addDays(weekStart, 6))}`
  const requested = mode === 'week' ? weekRange(selected) : monthRange(selected)
  const confirmed = scheduleAvailable && (sourceKind === 'demo' || Boolean(coverage && coverage.start <= requested.start && coverage.end >= requested.end))

  return <div className="td-screen planner-screen">
    {topbar}
    <section className="planner-heading" aria-label="Розклад">
      <div className="planner-title-row"><h1>Розклад</h1>{statusControl}</div>
    </section>
    <div className="planner-switch" role="group" aria-label="Режим календаря">
      <button type="button" className={mode === 'week' ? 'active' : ''} aria-pressed={mode === 'week'} onClick={() => setMode('week')}>Тиждень</button>
      <button type="button" className={mode === 'month' ? 'active' : ''} aria-pressed={mode === 'month'} onClick={() => setMode('month')}>Місяць</button>
    </div>
    <section aria-label="Календар розкладу">
      <div className="planner-range">
        <div><strong>{rangeTitle}</strong><small>{mode === 'month' ? 'Перегляд усього місяця' : 'Перегляд тижня'}</small></div>
        <div className="planner-arrows"><button type="button" aria-label={mode === 'week' ? 'Попередній тиждень' : 'Попередній місяць'} onClick={() => shift(-1)}>‹</button><button type="button" aria-label={mode === 'week' ? 'Наступний тиждень' : 'Наступний місяць'} onClick={() => shift(1)}>›</button></div>
      </div>
      <div className="planner-days-label" aria-hidden="true">{weekdayNames.map(day => <span key={day}>{day}</span>)}</div>
      <div className="planner-days">{shownDays.map(day => <button key={`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`} type="button" className={`planner-date${sameDay(day, selected) ? ' selected' : ''}${sameDay(day, now) ? ' today' : ''}${mode === 'month' && day.getMonth() !== selected.getMonth() ? ' outside' : ''}`} aria-label={fullDate.format(day)} aria-pressed={sameDay(day, selected)} onClick={() => setSelected(day)}><em>{day.getDate()}</em>{confirmed && lessons.some(lesson => lessonOccursOnDate(lesson, day)) && <span className="planner-dot"/>}</button>)}</div>
    </section>
    <div className="planner-hint"><InfoIcon/><span>{sourceKind === 'demo' ? 'Заняття демонстраційні. Чисельник, знаменник і зміни розкладу — недоступно до підключення розкладу.' : stale ? 'Показано збережений розклад ВНАУ. Джерело тимчасово недоступне; час останньої перевірки — біля заголовка.' : 'Розклад ВНАУ · МКР. Чисельник і знаменник поки недоступні.'}</span></div>
    <section aria-label="Заняття на вибраний день">
      <div className="planner-lesson-head"><div><h2>Заняття</h2><p>{fullDate.format(selected)}</p></div><span className="pill">{confirmed ? lessonCount(dayLessons.length) : '—'}</span></div>
      {!confirmed ? <div className="planner-empty"><strong>{loading ? 'Завантажуємо розклад…' : 'Дані недоступні'}</strong>{!loading && (sourceKind === 'demo' ? 'Демонстраційного розкладу для цієї групи поки немає.' : 'Не вдалося отримати підтверджені дані ВНАУ за цей період.')}</div> : !dayLessons.length ? <div className="planner-empty"><strong>На цей день занять немає</strong>{sourceKind === 'demo' ? 'У демонстраційному розкладі тут вільно.' : 'У підтвердженому розкладі ВНАУ занять немає.'}</div> : <div className="planner-list">{dayLessons.map(lesson => {
        const active = sameDay(selected, now) && minutes(lesson.startsAt) <= minute && minute < minutes(lesson.endsAt)
        const past = selected < startOfToday || (sameDay(selected, now) && minutes(lesson.endsAt) <= minute)
        return <article key={lesson.id} className={`planner-item${active ? ' active' : past ? ' past' : ''}`}><div className="planner-lesson"><div className="planner-time"><span>{lesson.startsAt} — {lesson.endsAt}</span>{active && <span className="now-tag">ЗАРАЗ</span>}</div><h3>{lesson.title}</h3><div className="planner-details"><span>{lesson.type}</span><span>{lesson.teacher}</span><span>{lesson.location}</span></div></div></article>
      })}</div>}
      {shareControl(selected, mode)}
      <div className="planner-legend">Можна поділитися цілим тижнем або місяцем</div>
    </section>
  </div>
}
