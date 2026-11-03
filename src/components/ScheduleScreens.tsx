import { useEffect, useState } from 'react'
import type { Lesson } from '../data/schedule'
import './ScheduleScreens.css'

// University-specific academic week rules will belong to a future schedule source.
export type AcademicWeek = 'numerator' | 'denominator' | 'unknown'

const dayNames = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'нд']
const fullDate = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', weekday: 'long' })
const monthName = new Intl.DateTimeFormat('uk-UA', { month: 'long', year: 'numeric' })
const shortDate = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long' })
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const addDays = (date: Date, amount: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount)
const startOfWeek = (date: Date) => addDays(date, -(date.getDay() + 6) % 7)
const lessonsForDate = (lessons: Lesson[], date: Date) => lessons.filter(lesson => lesson.day === date.getDay()).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
const minutes = (time: string) => { const [hours, mins] = time.split(':').map(Number); return hours * 60 + mins }

function Icon({ name, size = 17 }: { name: 'pin' | 'person' | 'share' | 'calendar' | 'sun' | 'left' | 'right' | 'close'; size?: number }) {
  const paths = {
    pin: <><path d="M19 10c0 5-7 10-7 10s-7-5-7-10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/></>,
    person: <><circle cx="12" cy="8" r="3.3"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></>,
    share: <><path d="M12 15V3m-4 4 4-4 4 4"/><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M19 5l-1.4 1.4M6.4 17.6 5 19"/></>,
    left: <path d="m15 6-6 6 6 6"/>, right: <path d="m9 6 6 6-6 6"/>, close: <path d="M6 6l12 12M18 6 6 18"/>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function LessonList({ lessons, currentDate, now }: { lessons: Lesson[]; currentDate: Date; now: Date }) {
  const currentMinute = now.getHours() * 60 + now.getMinutes()
  return <div className="sc-lessons">{lessons.map(lesson => {
    const active = sameDay(currentDate, now) && minutes(lesson.startsAt) <= currentMinute && currentMinute < minutes(lesson.endsAt)
    return <article key={lesson.id} className={`sc-lesson${active ? ' sc-lesson-active' : ''}`}>
      <div className="sc-time"><strong>{lesson.startsAt}</strong><span>{lesson.endsAt}</span></div>
      <div className={`sc-line sc-line-${lesson.color}`}/>
      <div className="sc-lesson-main"><div className="sc-lesson-top"><span className="sc-type">{lesson.type}</span>{active && <span className="sc-now"><i/> ЗАРАЗ</span>}</div><h3>{lesson.title}</h3><div className="sc-details"><span><Icon name="person" size={14}/>{lesson.teacher}</span><span><Icon name="pin" size={14}/>{lesson.location}</span></div></div>
    </article>
  })}</div>
}

function EmptyDay({ onOpenSchedule }: { onOpenSchedule?: () => void }) {
  return <div className="sc-empty"><span className="sc-empty-icon"><Icon name="calendar" size={23}/></span><h3>На цей день занять немає</h3><p>У демонстраційному розкладі тут вільно.</p>{onOpenSchedule && <button onClick={onOpenSchedule}>Переглянути інші дні <span aria-hidden="true">→</span></button>}</div>
}

function SharePreview({ date, lessons, onClose }: { date: Date; lessons: Lesson[]; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  return <div className="sc-overlay" onClick={onClose}><section className="sc-sheet" role="dialog" aria-modal="true" aria-labelledby="sc-share-title" onClick={event => event.stopPropagation()}><div className="sc-sheet-head"><div><span className="sc-kicker">ДЕПАРА · ПЕРЕГЛЯД</span><h2 id="sc-share-title">Поділитися розкладом</h2></div><button className="sc-icon-button" aria-label="Закрити" onClick={onClose}><Icon name="close"/></button></div><p className="sc-sheet-copy">Так може виглядати твій розклад для поширення. Це лише попередній перегляд.</p><div className="sc-share-card"><span className="sc-kicker">ДЕПАРА · ДЕМО</span><h3>{fullDate.format(date)}</h3>{lessons.length ? lessons.map(lesson => <div className="sc-share-row" key={lesson.id}><b>{lesson.startsAt}</b><span>{lesson.title}<small>{lesson.location} · {lesson.teacher}</small></span></div>) : <p>У демонстраційному розкладі занять немає.</p>}</div><button className="sc-sheet-done" onClick={onClose}>Зрозуміло</button><p className="sc-sheet-foot">Нічого не надіслано</p></section></div>
}

export function TodayScreen({ lessons, name, onOpenSchedule }: { lessons: Lesson[]; name?: string; onOpenSchedule: () => void }) {
  const [now, setNow] = useState(() => new Date())
  const [preview, setPreview] = useState(false)
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30000); return () => window.clearInterval(timer) }, [])
  const todayLessons = lessonsForDate(lessons, now)
  return <div className="sc-page"><div className="sc-heading"><div><span className="sc-kicker">{fullDate.format(now)}</span><h1>Сьогодні{ name ? `, ${name.split(' ')[0]}` : '' }</h1><p>Твій навчальний день</p></div><div className="sc-weather" aria-label="Демонстраційна погода: сонячно, 18 градусів"><Icon name="sun" size={20}/><span><strong>+18°</strong><small>демо</small></span></div></div><div className="sc-section-title"><div><h2>Розклад на день</h2><p>Демонстраційні заняття</p></div><span className="sc-count">{todayLessons.length}</span></div>{todayLessons.length ? <LessonList lessons={todayLessons} currentDate={now} now={now}/> : <EmptyDay onOpenSchedule={onOpenSchedule}/>}<button className="sc-share-button" onClick={() => setPreview(true)}><Icon name="share"/> Поділитися розкладом</button>{preview && <SharePreview date={now} lessons={todayLessons} onClose={() => setPreview(false)}/>}</div>
}

export function ScheduleScreen({ lessons }: { lessons: Lesson[] }) {
  const [selected, setSelected] = useState(() => new Date())
  const [mode, setMode] = useState<'week' | 'month'>('week')
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30000); return () => window.clearInterval(timer) }, [])
  const weekStart = startOfWeek(selected)
  const monthStart = new Date(selected.getFullYear(), selected.getMonth(), 1)
  const monthEnd = new Date(selected.getFullYear(), selected.getMonth() + 1, 0)
  const gridStart = startOfWeek(monthStart)
  const gridLength = Math.ceil(((monthStart.getDay() + 6) % 7 + monthEnd.getDate()) / 7) * 7
  const shownDays = mode === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : Array.from({ length: gridLength }, (_, i) => addDays(gridStart, i))
  const shift = (amount: number) => setSelected(current => mode === 'week' ? addDays(current, amount * 7) : new Date(current.getFullYear(), current.getMonth() + amount, 1))
  const dayLessons = lessonsForDate(lessons, selected)
  return <div className="sc-page"><div className="sc-heading"><div><span className="sc-kicker">ТВІЙ НАВЧАЛЬНИЙ ЧАС</span><h1>Розклад</h1><p>Обери день, щоб побачити заняття</p></div></div><div className="sc-calendar"><div className="sc-calendar-top"><div className="sc-segment" aria-label="Вигляд календаря"><button className={mode === 'week' ? 'sc-segment-active' : ''} aria-pressed={mode === 'week'} onClick={() => setMode('week')}>Тиждень</button><button className={mode === 'month' ? 'sc-segment-active' : ''} aria-pressed={mode === 'month'} onClick={() => setMode('month')}>Місяць</button></div><button className="sc-today-button" onClick={() => setSelected(new Date())}>Сьогодні</button></div><div className="sc-month-bar"><button className="sc-icon-button" aria-label={mode === 'week' ? 'Попередній тиждень' : 'Попередній місяць'} onClick={() => shift(-1)}><Icon name="left"/></button><strong>{mode === 'week' && weekStart.getMonth() !== addDays(weekStart, 6).getMonth() ? `${shortDate.format(weekStart)} – ${shortDate.format(addDays(weekStart, 6))}` : monthName.format(selected)}</strong><button className="sc-icon-button" aria-label={mode === 'week' ? 'Наступний тиждень' : 'Наступний місяць'} onClick={() => shift(1)}><Icon name="right"/></button></div><div className="sc-weekdays" aria-hidden="true">{dayNames.map(day => <span key={day}>{day}</span>)}</div><div className={`sc-dates sc-dates-${mode}`}>{shownDays.map(day => <button key={day.toISOString()} className={`${sameDay(day, selected) ? 'sc-date-selected' : ''} ${day.getMonth() !== selected.getMonth() && mode === 'month' ? 'sc-date-outside' : ''} ${sameDay(day, now) ? 'sc-date-today' : ''}`} onClick={() => setSelected(day)} aria-label={fullDate.format(day)} aria-pressed={sameDay(day, selected)}><span>{day.getDate()}</span>{lessons.some(lesson => lesson.day === day.getDay()) && <i/>}</button>)}</div><div className="sc-week-info">Чисельник / знаменник <span>не налаштовано</span></div></div><div className="sc-section-title"><div><h2>{fullDate.format(selected)}</h2><p>Демонстраційні заняття</p></div><span className="sc-count">{dayLessons.length}</span></div>{dayLessons.length ? <LessonList lessons={dayLessons} currentDate={selected} now={now}/> : <EmptyDay/>}<p className="sc-demo-foot">Заняття вигадані та повторюються за днями тижня. Це не розклад ВНАУ.</p></div>
}
