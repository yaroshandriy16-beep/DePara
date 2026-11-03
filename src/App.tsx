import { useEffect, useState } from 'react'
import { demoSchedule, type Lesson } from './data/schedule'
import { getTelegramProfile, initTelegram } from './lib/telegram'
import './styles.css'

type Role = 'student' | 'teacher'
type Tab = 'today' | 'schedule' | 'notebook' | 'communities' | 'window' | 'profile'
type Theme = 'light' | 'dark' | 'system'
type Weather = 'off' | 'soft'

const icons: Record<string, React.ReactNode> = {
  today: <><rect x="3" y="4" width="18" height="17" rx="4"/><path d="M7 2v4m10-4v4M3 9h18M8 13h3v3H8z"/></>,
  schedule: <><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M8 7v10m4-10v10m4-10v10M6 10h12m-12 4h12"/></>,
  notebook: <><path d="M6 3h11a3 3 0 0 1 3 3v14H7a3 3 0 0 1-3-3V6a3 3 0 0 1 2-3Zm1 0v17M10 8h6m-6 4h6"/></>,
  communities: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v1"/></>,
  window: <><rect x="3" y="4" width="18" height="16" rx="4"/><path d="M12 4v16M3 12h18"/></>,
  profile: <><circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></>,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
  pin: <><path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/></>,
  spark: <path d="m12 2 2 7 7 3-7 2-2 8-2-8-7-2 7-3 2-7Z"/>,
}
function Icon({name, size = 20}: {name: string; size?: number}) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg> }

const studentTabs: {id: Tab; label: string}[] = [{id:'today',label:'Сьогодні'}, {id:'schedule',label:'Розклад'}, {id:'notebook',label:'Зошит'}, {id:'communities',label:'Спільноти'}, {id:'profile',label:'Профіль'}]
const teacherTabs: {id: Tab; label: string}[] = [{id:'today',label:'Сьогодні'}, {id:'schedule',label:'Розклад'}, {id:'window',label:'Вікно'}, {id:'profile',label:'Профіль'}]
const days = ['Нд','Пн','Вт','Ср','Чт','Пт','Сб']
const fullDays = ['Неділя','Понеділок','Вівторок','Середа','Четвер','П’ятниця','Субота']
const date = new Date()
const dateText = new Intl.DateTimeFormat('uk-UA', {day:'numeric', month:'long'}).format(date)
const initialDay = date.getDay()

function Brand() { return <div className="brand"><span className="brand-mark">д<span>.</span></span><span>де<span className="brand-purple">пара</span><small>ТВОЄ СТУДЕНТСЬКЕ МІСЦЕ</small></span></div> }
function App() {
  const [role, setRole] = useState<Role | null>(() => { try { return localStorage.getItem('depara-role') as Role | null } catch { return null } })
  const [tab, setTab] = useState<Tab>('today')
  const [day, setDay] = useState(initialDay)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [theme, setTheme] = useState<Theme>('light')
  const [weather, setWeather] = useState<Weather>('off')
  const [motion, setMotion] = useState(true)
  const [profile] = useState(() => getTelegramProfile())
  useEffect(() => { initTelegram(); void demoSchedule.getLessons().then(setLessons) }, [])
  const chooseRole = (next: Role) => { setRole(next); setTab('today'); try { localStorage.setItem('depara-role', next) } catch { /* storage may be unavailable */ } }
  const resetRole = () => { setRole(null); setTab('today'); try { localStorage.removeItem('depara-role') } catch { /* storage may be unavailable */ } }
  const selectedLessons = lessons.filter(item => item.day === (tab === 'today' ? initialDay : day))
  const tabs = role === 'teacher' ? teacherTabs : studentTabs
  return <div className={`app theme-${theme} ${motion ? '' : 'reduce-motion'}`} data-weather={weather}>
    {!role ? <main className="welcome">
      <div className="welcome-top"><Brand/><span className="edition">ORIGINAL <span>✳</span></span></div>
      <div className="welcome-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="art-spark spark-one">✳</div><div className="art-spark spark-two">✦</div><div className="art-card"><div className="art-card-top"><span>твій день</span><b>✦</b></div><div className="art-line long"/><div className="art-line short"/><div className="art-row"><span>09:00</span><i/><i/></div><div className="art-row second"><span>10:30</span><i/><i/></div></div><div className="art-bubble">привіт!</div><div className="art-dot"/></div>
      <div className="welcome-copy"><div className="eyebrow"><span/> ВСЕ ПОЧИНАЄТЬСЯ ТУТ</div><h1>Твій день.<br/><em>Твій ритм.</em></h1><p>Навчання стає простішим, коли все важливе поруч.</p></div>
      <div className="role-heading"><div><span className="step">01 / ПОЧНЕМО</span><h2>Як до тебе звертатись?</h2></div><span className="role-hint">Обери свою роль</span></div>
      <div className="role-list"><button className="role-card" onClick={() => chooseRole('student')}><span className="role-icon student-icon">✳</span><span className="role-copy"><b>Я студент</b><small>Мої пари та навчання</small></span><span className="circle-arrow"><Icon name="arrow"/></span></button><button className="role-card" onClick={() => chooseRole('teacher')}><span className="role-icon teacher-icon">✦</span><span className="role-copy"><b>Я викладач</b><small>Заняття та мій час</small></span><span className="circle-arrow"><Icon name="arrow"/></span></button></div>
      <p className="welcome-foot">ЗРОБЛЕНО ДЛЯ ТВОГО РИТМУ <span>♥</span></p>
    </main> : <><main className="content">
      <header className="app-header"><Brand/><button className="avatar" onClick={() => setTab('profile')} aria-label="Відкрити профіль">{profile?.photoUrl ? <img src={profile.photoUrl} alt=""/> : <Icon name="profile" size={19}/>}</button></header>
      {(tab === 'today' || tab === 'schedule') && <><div className="page-heading"><div><div className="eyebrow"><span/> {tab === 'today' ? `${dateText.toUpperCase()} · ${fullDays[initialDay].toUpperCase()}` : 'ВСЕ ПІД КОНТРОЛЕМ'}</div><h1>{tab === 'today' ? <>Привіт{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}<span className="wave"> ✳</span></> : 'Твій розклад'}</h1><p>{tab === 'today' ? 'Зазирни у свій навчальний день.' : 'Твій тиждень, як на долоні.'}</p></div></div>
      {tab === 'today' ? <div className="hero-card"><div className="hero-copy"><span>ТВІЙ ПРОСТІР ДЛЯ НАВЧАННЯ</span><h2>Все важливе<br/><em>на своєму місці.</em></h2><p>Маленькі кроки — великі плани.</p></div><div className="hero-flower" aria-hidden="true">✳</div><div className="hero-star" aria-hidden="true">✦</div></div> : <div className="day-picker" aria-label="День тижня">{[1,2,3,4,5,6,0].map(d => <button key={d} onClick={() => setDay(d)} className={day === d ? 'selected' : ''} aria-pressed={day === d}><span>{days[d]}</span><b>{d === initialDay ? '•' : '○'}</b></button>)}</div>}
      <div className="section-title"><div><span className="section-kicker">{tab === 'today' ? 'ТВІЙ ПЛАН' : 'НАВЧАЛЬНИЙ ДЕНЬ'}</span><h2>{tab === 'today' ? 'Пари на сьогодні' : fullDays[day]}</h2></div><span className="count">{selectedLessons.length} {selectedLessons.length === 1 ? 'пара' : selectedLessons.length > 1 && selectedLessons.length < 5 ? 'пари' : 'пар'}</span></div>
      <div className="demo-note"><span>✦</span> Демонстраційний розклад · заняття вигадані</div>
      <div className="lesson-list">{selectedLessons.length ? selectedLessons.map((lesson, i) => <article className="lesson" key={lesson.id}><div className="lesson-time"><b>{lesson.startsAt}</b><span>{lesson.endsAt}</span></div><div className={`lesson-stripe ${lesson.color}`}/><div className="lesson-info"><div className="lesson-top"><span className={`lesson-type ${lesson.color}`}>{lesson.type}</span><span className="lesson-number">0{i + 1}</span></div><h3>{lesson.title}</h3><p><Icon name="pin" size={14}/> {lesson.location} <span>·</span> {role === 'teacher' ? lesson.group : lesson.teacher}</p></div></article>) : <div className="empty-day"><span>✺</span><h3>На цей день пар немає</h3><p>У демонстраційному розкладі тут поки вільно.</p>{tab === 'today' && <button onClick={() => {setTab('schedule'); setDay(1)}}>Переглянути розклад <Icon name="arrow" size={16}/></button>}</div>}</div></>}
      {tab === 'profile' && <><div className="page-heading"><div className="eyebrow"><span/> ВСЕ ПРО ТЕБЕ</div><h1>Профіль</h1><p>Твій простір, твої налаштування.</p></div><div className="profile-card"><div className="profile-avatar">{profile?.photoUrl ? <img src={profile.photoUrl} alt=""/> : <Icon name="profile" size={27}/>}</div><div><h2>{profile?.name || 'Привіт!'}</h2><p>{role === 'student' ? 'Студент' : 'Викладач'} · ДеПара Original</p></div><button onClick={resetRole}>Змінити</button></div><div className="section-title settings-title"><div><span className="section-kicker">ПІД СЕБЕ</span><h2>Вигляд застосунку</h2></div></div><div className="settings"><label><span><b>Тема</b><small>Обери настрій інтерфейсу</small></span><select value={theme} onChange={e => setTheme(e.target.value as Theme)}><option value="light">Світла</option><option value="dark">Темна</option><option value="system">Системна</option></select></label><label><span><b>Погодні ефекти</b><small>Підготовлено для майбутніх ефектів</small></span><select value={weather} onChange={e => setWeather(e.target.value as Weather)}><option value="off">Вимкнено</option><option value="soft">Легкі</option></select></label><label><span><b>Анімації</b><small>Плавні переходи в застосунку</small></span><input type="checkbox" checked={motion} onChange={e => setMotion(e.target.checked)}/></label></div><p className="profile-note">Ім’я та фото з Telegram використовуються лише для відображення.</p></>}
      {(tab === 'notebook' || tab === 'communities' || tab === 'window') && <><div className="page-heading"><div className="eyebrow"><span/> ДЕПАРА ORIGINAL</div><h1>{tab === 'notebook' ? 'Зошит' : tab === 'communities' ? 'Спільноти' : 'Вікно'}</h1><p>Тут буде дещо корисне для тебе.</p></div><div className="placeholder"><div className="placeholder-icon"><Icon name={tab} size={36}/></div><span className="section-kicker">СКОРО ТУТ</span><h2>Ще трішки часу ✦</h2><p>Цей розділ готується. А поки можеш переглянути свій демонстраційний розклад.</p><button onClick={() => setTab('schedule')}>До розкладу <Icon name="arrow" size={17}/></button></div></>}
      <div className="content-end">З ЛЮБОВ’Ю ДО ТВОГО ДНЯ <span>✳</span></div>
    </main><nav className="bottom-nav" aria-label="Основна навігація">{tabs.map(item => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)} aria-current={tab === item.id ? 'page' : undefined}><span className="nav-icon"><Icon name={item.id} size={21}/></span><span>{item.label}</span></button>)}</nav></>}
  </div>
}
export default App
