import { useEffect, useState } from 'react'
import { calendarDateKey, freeIntervals, kyivNow, lessonsOnDate, weekRange, type CalendarRange, type Lesson } from '../data/schedule'
import type { TelegramDisplayProfile } from '../lib/telegram'
import type { UserSelection } from '../onboarding/catalog'
import './other-screens.css'

export type Appearance = {
  theme: 'light' | 'dark' | 'system'
  style: 'original' | 'strict'
  weather: boolean
  seasonal: boolean
  animations: boolean
}

type ProfileProps = {
  selection: UserSelection
  profile: TelegramDisplayProfile | null
  appearance: Appearance
  onAppearanceChange: (next: Appearance) => void
  onChangeSelection: () => void
}

function ScreenHeading({ label, title, description }: { label: string; title: string; description: string }) {
  return <header className="other-heading"><span className="other-eyebrow">{label}</span><h1>{title}</h1><p>{description}</p></header>
}

function PersonIcon() {
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M4.7 20a7.3 7.3 0 0 1 14.6 0"/></svg>
}

export function ProfileScreen({ selection, profile, appearance, onAppearanceChange, onChangeSelection }: ProfileProps) {
  const update = (change: Partial<Appearance>) => onAppearanceChange({ ...appearance, ...change })
  const [photoFailed, setPhotoFailed] = useState(false)
  return <section className="other-screen">
    <ScreenHeading label="ВАШ ПРОСТІР" title="Профіль" description="Налаштуйте застосунок під себе."/>
    <div className="other-profile-card">
      <div className="other-avatar">{profile?.photoUrl && !photoFailed ? <img src={profile.photoUrl} alt="" onError={() => setPhotoFailed(true)}/> : <PersonIcon/>}</div>
      <div className="other-profile-name"><h2>{profile?.name || 'Користувач'}</h2><p>{selection.role === 'student' ? 'Студент' : 'Викладач'}</p></div>
    </div>
    <div className="other-subheading"><h2>Навчання</h2><span className="other-demo-tag">{selection.universityId === 'vsau' ? 'ВНАУ' : 'ДЕМО'}</span></div>
    <div className="other-info-card">
      <div><span>Університет</span><strong>{selection.university}</strong></div>
      {selection.role === 'student' ? <>
        <div><span>Факультет</span><strong>{selection.faculty}</strong></div>
        <div><span>Курс і група</span><strong>{selection.course} · {selection.group}</strong></div>
      </> : <div><span>Викладач</span><strong>{selection.teacher}</strong></div>}
      <button className="other-text-button" onClick={onChangeSelection}>Змінити вибір <span aria-hidden="true">→</span></button>
    </div>
    <div className="other-subheading"><h2>Оформлення</h2></div>
    <div className="other-settings">
      <label className="other-setting"><span><b>Тема</b><small>Світла, темна або як у системі</small></span><select aria-label="Тема" value={appearance.theme} onChange={event => update({ theme: event.target.value as Appearance['theme'] })}><option value="light">Світла</option><option value="dark">Темна</option><option value="system">Системна</option></select></label>
      <label className="other-setting"><span><b>Стиль</b><small>Вигляд інтерфейсу</small></span><select aria-label="Стиль" value={appearance.style} onChange={event => update({ style: event.target.value as Appearance['style'] })}><option value="original">ДеПара Original</option><option value="strict">Строгий</option></select></label>
      <label className="other-setting"><span><b>Погодні ефекти</b><small>Для майбутніх ефектів</small></span><input type="checkbox" checked={appearance.weather} onChange={event => update({ weather: event.target.checked })}/></label>
      <label className="other-setting"><span><b>Сезонні ефекти</b><small>Для майбутніх ефектів</small></span><input type="checkbox" checked={appearance.seasonal} onChange={event => update({ seasonal: event.target.checked })}/></label>
      <label className="other-setting"><span><b>Анімації</b><small>Плавні переходи</small></span><input type="checkbox" checked={appearance.animations} onChange={event => update({ animations: event.target.checked })}/></label>
    </div>
    <p className="other-footnote">Ім’я та фото Telegram використовуються лише для відображення. Налаштування зберігаються на цьому пристрої.</p>
  </section>
}

export function NotebookScreen() {
  return <section className="other-screen"><ScreenHeading label="ДЛЯ НАВЧАННЯ" title="Зошит" description="Місце для ваших навчальних нотаток."/><div className="other-empty"><div className="other-empty-icon" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h11a3 3 0 0 1 3 3v14H7a3 3 0 0 1-3-3V6a3 3 0 0 1 2-3Zm1 0v17m3-12h6m-6 4h6"/></svg></div><h2>Зошит ще готується</h2><p>Тут з’явиться простір для нотаток. Поки що записи не зберігаються.</p></div></section>
}

export function CommunitiesScreen() {
  const [section, setSection] = useState<'chats' | 'friends'>('chats')
  return <section className="other-screen"><ScreenHeading label="НА ЗВ’ЯЗКУ" title="Спільноти" description="Ваше коло в ДеПара."/>
    <div className="other-segment" role="tablist" aria-label="Розділи спільнот"><button type="button" role="tab" aria-selected={section === 'chats'} onClick={() => setSection('chats')}>Чати</button><button type="button" role="tab" aria-selected={section === 'friends'} onClick={() => setSection('friends')}>Друзі</button></div>
    <div className="other-empty" role="tabpanel"><div className="other-empty-icon" aria-hidden="true">{section === 'chats' ? <svg width="29" height="29" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17.5 3.5 21v-5A8 8 0 1 1 7 19.5"/><path d="M8 11h8m-8 3h5"/></svg> : <svg width="29" height="29" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v1"/></svg>}</div><h2>{section === 'chats' ? 'Чати ще готуються' : 'Друзі ще готуються'}</h2><p>{section === 'chats' ? 'Обмін повідомленнями тут поки недоступний.' : 'Пошук і додавання друзів тут поки недоступні.'}</p></div>
  </section>
}

function minutes(time: string) { const [hours, mins] = time.split(':').map(Number); return hours * 60 + mins }
function duration(from: string, to: string) { const total = minutes(to) - minutes(from); const hours = Math.floor(total / 60); const mins = total % 60; return [hours ? `${hours} год` : '', mins ? `${mins} хв` : ''].filter(Boolean).join(' ') }

export function WindowScreen({ lessons, teacher, teacherId, sourceKind = 'demo', scheduleAvailable = true, loading = false, stale = false, lastSuccessAt, coverage, onRangeChange }: { lessons: Lesson[]; teacher: string; teacherId?: string; sourceKind?: 'demo' | 'external'; scheduleAvailable?: boolean; loading?: boolean; stale?: boolean; lastSuccessAt?: string; coverage?: CalendarRange; onRangeChange?: (range: CalendarRange) => void }) {
  const [selected, setSelected] = useState(() => kyivNow())
  useEffect(() => { onRangeChange?.(weekRange(selected)) }, [selected, onRangeChange])
  // Never infer a real teacher identity from a display name.
  const ownLessons = lessons.filter(lesson => teacherId ? lesson.teacherId === teacherId : !lesson.teacherId && lesson.teacher === teacher)
  const sorted = lessonsOnDate(ownLessons, selected)
  const gaps = freeIntervals(sorted)
  const requested = weekRange(selected)
  const confirmed = scheduleAvailable && (sourceKind === 'demo' || Boolean(coverage && coverage.start <= requested.start && coverage.end >= requested.end))
  const date = new Intl.DateTimeFormat('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' }).format(selected)
  const savedAt = lastSuccessAt ? new Intl.DateTimeFormat('uk-UA', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', timeZone:'Europe/Kyiv' }).format(new Date(lastSuccessAt)) : ''
  return <section className="other-screen"><ScreenHeading label="ВАШ ЧАС" title="Вікно" description="Вільні проміжки між вашими заняттями."/>
    <div className="other-notice"><span aria-hidden="true">✦</span> {sourceKind === 'demo' ? 'Демонстраційний розклад · дані вигадані' : stale ? `Збережений розклад ВНАУ · джерело недоступне${savedAt ? ` · ${savedAt}` : ''}` : 'Розклад ВНАУ · МКР'}</div>
    <div className="other-subheading"><h2>Обраний день</h2><span className="other-date">{date}</span></div>
    <label className="other-window-date">Дата <input type="date" aria-label="Дата для вікон" value={calendarDateKey(selected)} onChange={event => { const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(event.target.value); if (match) setSelected(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) }}/></label>
    {!confirmed ? <div className="other-empty other-empty-compact"><div className="other-empty-icon" aria-hidden="true">◷</div><h2>{loading ? 'Завантажуємо розклад…' : 'Дані розкладу недоступні'}</h2><p>Вільні проміжки можна визначити лише за підтвердженим розкладом.</p></div> : gaps.length ? <div className="other-gaps">{gaps.map(gap => <article key={`${gap.start}-${gap.end}`} className="other-gap"><span className="other-gap-icon" aria-hidden="true">◷</span><div><strong>{gap.start}–{gap.end}</strong><p>Між заняттями</p></div><span className="other-duration">{duration(gap.start, gap.end)}</span></article>)}</div> : <div className="other-empty other-empty-compact"><div className="other-empty-icon" aria-hidden="true">◷</div><h2>Вікон між парами немає</h2><p>{sorted.length < 2 ? sourceKind === 'demo' ? 'У демонстраційному розкладі на цей день менше двох занять.' : 'У розкладі на цей день менше двох занять.' : 'У цей день заняття йдуть без вікон між парами.'}</p></div>}
    <p className="other-footnote">Показано тільки проміжки між заняттями за обраний день{sourceKind === 'demo' ? ' у демонстраційному розкладі' : ''}.</p>
  </section>
}
