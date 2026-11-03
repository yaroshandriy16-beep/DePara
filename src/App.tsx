import { useEffect, useState } from 'react'
import { demoSchedule, type Lesson } from './data/schedule'
import { getTelegramProfile, initTelegram } from './lib/telegram'
import { Onboarding } from './onboarding/Onboarding'
import { clearSelection, loadSelection, saveSelection, type UserSelection } from './onboarding/catalog'
import { TodayScreen, ScheduleScreen } from './components/ScheduleScreens'
import { ProfileScreen, NotebookScreen, CommunitiesScreen, WindowScreen, type Appearance } from './components/OtherScreens'
import './styles.css'

type Tab = 'today' | 'schedule' | 'notebook' | 'communities' | 'window' | 'profile'
const studentTabs: { id: Tab; label: string }[] = [{id:'today',label:'Сьогодні'}, {id:'schedule',label:'Розклад'}, {id:'notebook',label:'Зошит'}, {id:'communities',label:'Спільноти'}, {id:'profile',label:'Профіль'}]
const teacherTabs: { id: Tab; label: string }[] = [{id:'today',label:'Сьогодні'}, {id:'schedule',label:'Розклад'}, {id:'window',label:'Вікно'}, {id:'profile',label:'Профіль'}]
const icons: Record<Tab, React.ReactNode> = {
  today: <><rect x="3" y="4" width="18" height="17" rx="4"/><path d="M7 2v4m10-4v4M3 9h18M8 13h3v3H8z"/></>,
  schedule: <><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M8 7v10m4-10v10m4-10v10M6 10h12m-12 4h12"/></>,
  notebook: <><path d="M6 3h11a3 3 0 0 1 3 3v14H7a3 3 0 0 1-3-3V6a3 3 0 0 1 2-3Zm1 0v17M10 8h6m-6 4h6"/></>,
  communities: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v1"/></>,
  window: <><rect x="3" y="4" width="18" height="16" rx="4"/><path d="M12 4v16M3 12h18"/></>,
  profile: <><circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></>,
}
function Icon({name}: {name: Tab}) { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg> }
const defaultAppearance = (role?: UserSelection['role']): Appearance => ({theme:'system', style:role === 'teacher' ? 'strict' : 'original', weather:false, seasonal:false, animations:true})
function loadAppearance(role?: UserSelection['role']): Appearance {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem('depara-appearance-v2') || 'null')
    if (saved && typeof saved === 'object') {
      const value = saved as Partial<Appearance>
      return { theme: value.theme === 'light' || value.theme === 'dark' || value.theme === 'system' ? value.theme : 'system', style: value.style === 'strict' || value.style === 'original' ? value.style : defaultAppearance(role).style, weather: value.weather === true, seasonal: value.seasonal === true, animations: value.animations !== false }
    }
  } catch { /* storage may be unavailable */ }
  return defaultAppearance(role)
}
function App() {
  const [selection, setSelection] = useState<UserSelection | null>(loadSelection)
  const [appearance, setAppearance] = useState<Appearance>(() => loadAppearance(loadSelection()?.role))
  const [tab, setTab] = useState<Tab>('today')
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [profile] = useState(getTelegramProfile)
  useEffect(() => { initTelegram(); void demoSchedule.getLessons().then(setLessons) }, [])
  const complete = (next: UserSelection) => { saveSelection(next); setSelection(next); setTab('today'); const defaults = defaultAppearance(next.role); setAppearance(defaults); try { localStorage.setItem('depara-appearance-v2', JSON.stringify(defaults)) } catch { /* optional storage */ } }
  const updateAppearance = (next: Appearance) => { setAppearance(next); try { localStorage.setItem('depara-appearance-v2', JSON.stringify(next)) } catch { /* optional storage */ } }
  const reset = () => { clearSelection(); setSelection(null); setTab('today') }
  const tabs = selection?.role === 'teacher' ? teacherTabs : studentTabs
  const visibleLessons = selection?.role === 'teacher' ? lessons.filter(lesson => lesson.teacher === selection.teacher) : lessons.filter(lesson => lesson.group === selection?.group)
  return <div className={`app theme-${appearance.theme} style-${appearance.style} ${appearance.animations ? '' : 'reduce-motion'}`}>
    {!selection ? <Onboarding onComplete={complete}/> : <>
      <main className="content">
        <header className="app-header"><div className="brand"><span className="brand-mark">д<span>.</span></span><span>де<span className="brand-accent">пара</span><small>{appearance.style === 'strict' ? 'ТВІЙ НАВЧАЛЬНИЙ ПРОСТІР' : 'ORIGINAL'}</small></span></div><button className="avatar" onClick={() => setTab('profile')} aria-label="Відкрити профіль">{profile?.photoUrl ? <img src={profile.photoUrl} alt=""/> : <Icon name="profile"/>}</button></header>
        {tab === 'today' && <TodayScreen lessons={visibleLessons} name={profile?.name} onOpenSchedule={() => setTab('schedule')}/>}
        {tab === 'schedule' && <ScheduleScreen lessons={visibleLessons}/>}
        {tab === 'notebook' && <NotebookScreen/>}
        {tab === 'communities' && <CommunitiesScreen/>}
        {tab === 'window' && <WindowScreen lessons={lessons} teacher={selection.teacher ?? ""}/>}
        {tab === 'profile' && <ProfileScreen selection={selection} profile={profile} appearance={appearance} onAppearanceChange={updateAppearance} onChangeSelection={reset}/>}
      </main>
      <nav className="bottom-nav" aria-label="Основна навігація">{tabs.map(item => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)} aria-current={tab === item.id ? 'page' : undefined}><span className="nav-icon"><Icon name={item.id}/></span><span>{item.label}</span></button>)}</nav>
    </>}
  </div>
}
export default App
