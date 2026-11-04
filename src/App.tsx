import { useEffect, useState } from 'react'
import { demoSchedule, type Lesson } from './data/schedule'
import { getTelegramProfile, initTelegram } from './lib/telegram'
import { Onboarding } from './onboarding/Onboarding'
import { clearSelection, loadSelection, saveSelection, type UserSelection } from './onboarding/catalog'
import { ScheduleScreen } from './components/ScheduleScreens'
import { TodayScreen } from './components/TodayScreen'
import { useWeather, WeatherBackdrop, WeatherControl } from './components/Weather'
import { useSavedGroups } from './onboarding/groups'
import { GroupPicker } from './onboarding/GroupPicker'
import { ProfileScreen, NotebookScreen, CommunitiesScreen, WindowScreen, type Appearance } from './components/OtherScreens'
import './styles.css'

type Tab = 'today' | 'schedule' | 'notebook' | 'communities' | 'window' | 'profile'
const studentTabs: { id: Tab; label: string }[] = [{id:'today',label:'Сьогодні'}, {id:'schedule',label:'Розклад'}, {id:'notebook',label:'Зошит'}, {id:'communities',label:'Спільноти'}, {id:'profile',label:'Профіль'}]
const teacherTabs: { id: Tab; label: string }[] = [{id:'today',label:'Сьогодні'}, {id:'schedule',label:'Розклад'}, {id:'window',label:'Вікно'}, {id:'profile',label:'Профіль'}]
const icons: Record<Tab, React.ReactNode> = {
  today: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></>,
  schedule: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></>,
  notebook: <><path d="M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1ZM12 6v14"/></>,
  communities: <><path d="M20 11a7 7 0 0 1-7 7H7l-4 3v-6a7 7 0 1 1 17-4Z"/><path d="M9 10h7M9 13h5"/></>,
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
  const [showGroupPicker, setShowGroupPicker] = useState(false)
  const { groups, activeGroup, selectGroup, addGroup } = useSavedGroups(selection)
  const weather = useWeather()
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [profile] = useState(getTelegramProfile)
  useEffect(() => { initTelegram(); void demoSchedule.getLessons().then(setLessons) }, [])
  const complete = (next: UserSelection) => { saveSelection(next); setSelection(next); setTab('today'); const defaults = defaultAppearance(next.role); setAppearance(defaults); try { localStorage.setItem('depara-appearance-v2', JSON.stringify(defaults)) } catch { /* optional storage */ } }
  const updateAppearance = (next: Appearance) => { setAppearance(next); try { localStorage.setItem('depara-appearance-v2', JSON.stringify(next)) } catch { /* optional storage */ } }
  const reset = () => { clearSelection(); setSelection(null); setTab('today') }
  const tabs = selection?.role === 'teacher' ? teacherTabs : studentTabs
  const visibleLessons = selection?.role === 'teacher' ? lessons.filter(lesson => lesson.teacher === selection.teacher) : lessons.filter(lesson => lesson.group === activeGroup?.group)
  const scheduleAvailable = selection?.role === 'teacher' || lessons.some(lesson => lesson.group === activeGroup?.group)
  const isToday = Boolean(selection && tab === 'today')
  return <div className={`app theme-${appearance.theme} style-${appearance.style} ${appearance.animations ? '' : 'reduce-motion'} ${isToday ? 'is-today' : ''}`}>
    {isToday && <WeatherBackdrop weather={weather} effects={appearance.weather} animations={appearance.animations}/>}
    {!selection ? <Onboarding onComplete={complete}/> : <>
      <main className="content">
        {tab !== 'today' && <header className="app-header"><div className="brand"><span className="brand-mark">д<span>.</span></span><span>де<span className="brand-accent">пара</span><small>{appearance.style === 'strict' ? 'ТВІЙ НАВЧАЛЬНИЙ ПРОСТІР' : 'ORIGINAL'}</small></span></div><button className="avatar" onClick={() => setTab('profile')} aria-label="Відкрити профіль">{profile?.photoUrl ? <img src={profile.photoUrl} alt=""/> : <Icon name="profile"/>}</button></header>}
        {tab === 'today' && <TodayScreen lessons={visibleLessons} scheduleAvailable={scheduleAvailable} activeGroup={selection.role === 'student' ? activeGroup?.group || '' : selection.teacher || 'Викладач'} groups={groups.map(group => ({id:group.id,label:group.group,detail:group.university}))} onSelectGroup={selectGroup} onAddGroup={() => setShowGroupPicker(true)} weatherControl={<WeatherControl weather={weather} effects={appearance.weather} animations={appearance.animations} onEffectsChange={weatherEffects => updateAppearance({...appearance, weather:weatherEffects})} onAnimationsChange={animations => updateAppearance({...appearance, animations})}/>}/>}
        {tab === 'schedule' && <ScheduleScreen lessons={visibleLessons} scheduleAvailable={scheduleAvailable}/>}
        {tab === 'notebook' && <NotebookScreen/>}
        {tab === 'communities' && <CommunitiesScreen/>}
        {tab === 'window' && <WindowScreen lessons={lessons} teacher={selection.teacher ?? ""}/>}
        {tab === 'profile' && <ProfileScreen selection={selection} profile={profile} appearance={appearance} onAppearanceChange={updateAppearance} onChangeSelection={reset}/>}
      </main>
      {showGroupPicker && <GroupPicker existingGroups={groups} onSelect={group => { addGroup(group); setShowGroupPicker(false) }} onCancel={() => setShowGroupPicker(false)}/>}
      <nav className="bottom-nav" aria-label="Основна навігація">{tabs.map(item => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)} aria-current={tab === item.id ? 'page' : undefined}><span className="nav-icon"><Icon name={item.id}/></span><span>{item.label}</span></button>)}</nav>
    </>}
  </div>
}
export default App
