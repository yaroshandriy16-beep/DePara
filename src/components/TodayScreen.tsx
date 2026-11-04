import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Lesson } from '../data/schedule'
import './TodayScreen.css'

export interface TodayGroup { id: string; label: string; detail?: string }
export interface TodayScreenProps {
  lessons: Lesson[]
  activeGroup: string
  groups: TodayGroup[]
  onSelectGroup: (id: string) => void
  onAddGroup: () => void
  weatherControl: ReactNode
  scheduleAvailable: boolean
}
const weekday = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const fullDate = new Intl.DateTimeFormat('uk-UA', { weekday: 'short', day: 'numeric', month: 'long' })
const monthDate = new Intl.DateTimeFormat('uk-UA', { month: 'long', year: 'numeric' })
const addDays = (date: Date, offset: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset)
const sameDate = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const toMinutes = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m }

export function getTodayStatus(lessons: Lesson[], now: Date, selected: Date) {
  if (!lessons.length) return { phrase: sameDate(now, selected) ? 'Сьогодні можна видихнути' : 'У цей день можна видихнути', minutes: null, hint: '' }
  if (!sameDate(now, selected)) return { phrase: 'Розклад на обраний день', minutes: null, hint: '' }
  const minute = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
  const first = lessons[0]
  if (minute < toMinutes(first.startsAt)) return { phrase: 'Час збиратися на пари', minutes: Math.ceil(toMinutes(first.startsAt) - minute), hint: 'до початку' }
  for (let i = 0; i < lessons.length; i++) {
    const item = lessons[i]
    if (minute >= toMinutes(item.startsAt) && minute < toMinutes(item.endsAt)) return { phrase: i === lessons.length - 1 ? 'Фініш уже близько' : 'Тримаємось, ще трохи', minutes: Math.ceil(toMinutes(item.endsAt) - minute), hint: 'до завершення' }
    const next = lessons[i + 1]
    if (next && minute >= toMinutes(item.endsAt) && minute < toMinutes(next.startsAt)) {
      const remaining = Math.ceil(toMinutes(next.startsAt) - minute)
      return { phrase: remaining <= 5 ? 'Перерва майже все' : 'Є час на каву', minutes: remaining, hint: 'до початку' }
    }
  }
  return { phrase: 'Свобода до завтра!', minutes: null, hint: '' }
}

function Glyph({name}: {name:'group'|'person'|'room'|'share'}) {
  const paths = {group:<><path d="m2 9 10-5 10 5-10 5L2 9Z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/></>,person:<><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></>,room:<><path d="m3 11 9-8 9 8M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></>,share:<><path d="M12 16V3m0 0L7 8m5-5 5 5"/><path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/></>}
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function GroupMenu({activeGroup, groups, onSelectGroup, onAddGroup}: Omit<TodayScreenProps,'lessons'|'weatherControl'|'scheduleAvailable'>) {
  const [open,setOpen] = useState(false)
  const anchor = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!anchor.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  if (!groups.length) return <span className="td-teacher-label"><span className="td-group-mark"><Glyph name="group"/></span>{activeGroup}</span>
  return <div className={`td-group-anchor${open ? ' is-open' : ''}`} ref={anchor}>
    <button ref={trigger} className="td-group-trigger" aria-label={`Обрати розклад, поточний: ${activeGroup}`} aria-haspopup="menu" aria-expanded={open} aria-controls="td-group-popover" onClick={() => setOpen(v => !v)}><span className="td-group-mark"><Glyph name="group"/></span><span className="td-group-name">{activeGroup}</span><svg className="td-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
    {open && <div id="td-group-popover" className="td-group-popover" role="menu" aria-label="Мої розклади"><div className="td-groups-title">Мої розклади</div>{groups.map(group => <button key={group.id} type="button" role="menuitem" className={`td-group-option${group.label === activeGroup ? ' is-active' : ''}`} onClick={() => {onSelectGroup(group.id);setOpen(false);trigger.current?.focus()}}><span className="td-option-icon">▦</span><span className="td-option-text"><strong>{group.label}</strong><small>{group.detail || 'Демонстраційний розклад'}</small></span>{group.label === activeGroup && <span className="td-check" aria-label="Обрано">✓</span>}</button>)}<button type="button" role="menuitem" className="td-group-add" onClick={() => {setOpen(false);onAddGroup()}}><span>+</span>Додати групу</button><div className="td-group-tip">Демонстраційні розклади</div></div>}
  </div>
}

function Timeline({lessons, selected, now}: {lessons: Lesson[]; selected: Date; now: Date}) {
  const timeline = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<number | null>(null)
  const min = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
  useLayoutEffect(() => {
    const update = () => {
      const root = timeline.current
      if (!root || !sameDate(selected, now) || !lessons.length || min < toMinutes(lessons[0].startsAt) || min > toMinutes(lessons[lessons.length-1].endsAt)) { setPosition(null); return }
      const rows = Array.from(root.querySelectorAll<HTMLElement>('.td-timeline-item'))
      const points = lessons.flatMap((lesson,i) => [{time:toMinutes(lesson.startsAt), y:rows[i].offsetTop+9}, {time:toMinutes(lesson.endsAt), y:rows[i].offsetTop+rows[i].offsetHeight-12}]).sort((a,b)=>a.time-b.time)
      let y = points[0].y
      for (let i=1;i<points.length;i++) { if (min <= points[i].time) { const a=points[i-1], b=points[i]; y=a.y+(b.y-a.y)*(min-a.time)/(b.time-a.time || 1); break } y=points[i].y }
      setPosition(y)
    }
    update()
    window.addEventListener('resize',update)
    return () => window.removeEventListener('resize',update)
  },[lessons, selected, now, min])
  if (!lessons.length) return <div className="td-empty">У демонстраційному розкладі на цей день занять немає.</div>
  return <div ref={timeline} className="td-timeline"><div className="td-rail"><div className="td-rail-progress" style={{height:position === null ? 0 : Math.max(position - 9,0)}}/></div>{position !== null && <div className="td-now-bead" style={{top: position - 8}} aria-label="Поточний час"/>}{lessons.map(item => {
    const past = selected < new Date(now.getFullYear(),now.getMonth(),now.getDate()) || (sameDate(selected,now) && min >= toMinutes(item.endsAt))
    const active = sameDate(selected,now) && min >= toMinutes(item.startsAt) && min < toMinutes(item.endsAt)
    return <article key={item.id} className={`td-timeline-item ${active ? 'is-active' : past ? 'is-done' : 'is-future'}`}><div className="td-lesson"><div className="td-lesson-time">{item.startsAt} — {item.endsAt}{active && <span className="td-current">ЗАРАЗ</span>}</div><div className="td-lesson-name">{item.title}</div><div className="td-lesson-more"><span><Glyph name="person"/>{item.teacher}</span><span><Glyph name="room"/>{item.location}</span></div></div></article>
  })}</div>
}

function SharePreview({date,lessons,onClose,scheduleAvailable}: {date:Date; lessons:Lesson[]; onClose:()=>void; scheduleAvailable:boolean}) {
  useEffect(() => { const key=(event:KeyboardEvent)=>{if(event.key==='Escape') onClose()}; window.addEventListener('keydown',key); return ()=>window.removeEventListener('keydown',key) },[onClose])
  return <div className="td-modalback" onClick={onClose}><section className="td-sheet" role="dialog" aria-modal="true" aria-label="Попередній перегляд розкладу" onClick={event=>event.stopPropagation()}><div className="td-handle"/><h3>Поділитися розкладом</h3><p>Попередній перегляд · демонстраційний розклад</p><div className="td-share-preview"><strong>{fullDate.format(date)}</strong>{lessons.length ? lessons.map(item=><div className="td-share-row" key={item.id}><b>{item.startsAt}</b><span>{item.title}<small>{item.location} · {item.teacher}</small></span></div>) : <p>{scheduleAvailable ? 'Занять немає' : 'Дані розкладу недоступні'}</p>}</div><p>Нічого не надіслано.</p><button className="td-close" onClick={onClose}>Зрозуміло</button></section></div>
}

export function TodayScreen({lessons, activeGroup, groups, onSelectGroup, onAddGroup, weatherControl, scheduleAvailable}: TodayScreenProps) {
  const [now,setNow] = useState(() => new Date())
  const [selected,setSelected] = useState(() => new Date())
  const [share,setShare] = useState(false)
  useEffect(()=>{const id=window.setInterval(()=>setNow(new Date()), 10000);return ()=>window.clearInterval(id)},[])
  const dayLessons = lessons.filter(item=>item.day===selected.getDay()).sort((a,b)=>a.startsAt.localeCompare(b.startsAt))
  const status = scheduleAvailable ? getTodayStatus(dayLessons,now,selected) : { phrase: 'Дані розкладу недоступні', minutes: null, hint: '' }
  const monday = addDays(now,-(now.getDay()+6)%7)
  const week = Array.from({length:7},(_,i)=>addDays(monday,i))
  return <div className="td-screen">
    <header className="td-topbar"><GroupMenu activeGroup={activeGroup} groups={groups} onSelectGroup={onSelectGroup} onAddGroup={onAddGroup}/>{weatherControl}</header>
    <section className="td-scene" aria-label="Поточне або наступне заняття"><div className="td-countdown" aria-label={status.minutes === null ? 'Немає зворотного відліку' : `${status.minutes} хвилин ${status.hint}`}><div className="td-countdown-num">{status.minutes ?? '—'}</div>{status.minutes !== null && <><div className="td-countdown-unit">хв</div><div className="td-countdown-hint">{status.hint}</div></>}</div><div className="td-scene-foot" aria-live="polite" aria-atomic="true"><span key={status.phrase} className="td-live-phrase">{status.phrase}</span></div></section>
    <section aria-label="Дні тижня"><div className="td-section-top"><div>Цього тижня</div><span>{monthDate.format(now)}</span></div><div className="td-week">{week.map(date=>{const count=lessons.filter(item=>item.day===date.getDay()).length;return <button key={date.toISOString()} className={`td-day${sameDate(date,selected)?' is-selected':''}`} aria-label={fullDate.format(date)} aria-pressed={sameDate(date,selected)} onClick={()=>setSelected(date)}><span className="td-dow">{weekday[date.getDay()]}</span><span className="td-daynum">{date.getDate()}</span><span className="td-dots">{Array.from({length:Math.min(count,3)},(_,i)=><i key={i}/>)}</span></button>})}</div></section>
    <section aria-label="Розклад на обраний день"><div className="td-schedule-head"><h2>Розклад</h2><span>{fullDate.format(selected)}</span></div><p className="td-demo-label">Демонстраційний розклад · заняття вигадані</p>{scheduleAvailable ? <Timeline lessons={dayLessons} selected={selected} now={now}/> : <div className="td-empty">Дані демонстраційного розкладу для цієї групи недоступні.</div>}<button className="td-share" onClick={()=>setShare(true)}><Glyph name="share"/>Поділитися розкладом</button></section>
    {share && <SharePreview date={selected} lessons={dayLessons} scheduleAvailable={scheduleAvailable} onClose={()=>setShare(false)}/>}
  </div>
}
