import { useState } from 'react'
import { DEMO_FACULTIES, DEMO_TEACHERS, DEMO_UNIVERSITIES, type Role, type UserSelection } from './catalog'
import './onboarding.css'

type Step = 'welcome' | 'role' | 'university' | 'faculty' | 'course' | 'group' | 'teacher'

export function Onboarding({ onComplete }: { onComplete: (selection: UserSelection) => void }) {
  const [step, setStep] = useState<Step>('welcome')
  const [role, setRole] = useState<Role>('student')
  const [university, setUniversity] = useState('')
  const [faculty, setFaculty] = useState('')
  const [course, setCourse] = useState('')
  const [query, setQuery] = useState('')

  const titles: Record<Exclude<Step, 'welcome' | 'role'>, string> = {
    university: 'Де ти навчаєшся?', faculty: 'Обери факультет', course: 'Який у тебе курс?', group: 'Обери свою групу', teacher: 'Знайди себе в каталозі',
  }
  const goBack = () => {
    if (step === 'role') setStep('welcome')
    if (step === 'university') setStep('role')
    if (step === 'faculty' || step === 'teacher') setStep('university')
    if (step === 'course') setStep('faculty')
    if (step === 'group') setStep('course')
  }
  const chooseRole = (next: Role) => {
    setRole(next); setUniversity(''); setFaculty(''); setCourse(''); setQuery(''); setStep('university')
  }
  const groups = DEMO_FACULTIES.find(item => item.name === faculty)?.groups.filter(group => group.split('-')[1]?.startsWith(course)) ?? []
  const normalizedQuery = query.trim().toLocaleLowerCase('uk')
  const teachers = normalizedQuery ? DEMO_TEACHERS.filter(name => name.toLocaleLowerCase('uk').includes(normalizedQuery)) : []
  const progress = step === 'role' ? 1 : step === 'university' ? 2 : step === 'faculty' || step === 'teacher' ? 3 : step === 'course' ? 4 : 5
  const total = role === 'teacher' && step !== 'role' ? 3 : 5
  const complete = (extra: Partial<UserSelection>) => onComplete({ role, university, ...extra })

  return <main className="onb">
    <div className="onb-top"><div className="onb-brand"><span className="onb-brandmark">д<span>.</span></span><span>де<span>пара</span><small>ORIGINAL</small></span></div><span className="onb-topnote">ТВІЙ НАВЧАЛЬНИЙ ПРОСТІР</span></div>
    {step === 'welcome' ? <div className="onb-welcome">
      <div className="onb-welcome-icon" aria-hidden="true"><span>д<span>.</span></span><i>✳</i></div>
      <p className="onb-kicker">ДЕПАРА ORIGINAL</p>
      <h1>Твій день.<br/><em>У своєму ритмі.</em></h1>
      <p className="onb-lead">Заняття та важливе для навчання — в одному зручному місці.</p>
      <button className="onb-primary" onClick={() => setStep('role')}>Розпочати <span aria-hidden="true">↗</span></button>
      <p className="onb-foot">Створено для твого навчального ритму</p>
    </div> : <div className="onb-flow">
      <div className="onb-progress"><button className="onb-back" onClick={goBack} aria-label="Назад">←</button><div className="onb-progress-track"><span style={{ width: `${progress / total * 100}%` }}/></div><span className="onb-progress-label">{String(progress).padStart(2, '0')} / {String(total).padStart(2, '0')}</span></div>
      {step === 'role' ? <><p className="onb-kicker">ПОЧНЕМО ЗІ ЗНАЙОМСТВА</p><h1>Твоя роль<br/><em>у ДеПара</em></h1><p className="onb-description">Обери, як ти користуватимешся застосунком.</p><div className="onb-role-list"><button className="onb-choice onb-role" onClick={() => chooseRole('student')}><span className="onb-role-icon">✳</span><span><b>Студент</b><small>Мій навчальний день</small></span><span className="onb-arrow">↗</span></button><button className="onb-choice onb-role" onClick={() => chooseRole('teacher')}><span className="onb-role-icon teacher">✦</span><span><b>Викладач</b><small>Мої заняття та вільний час</small></span><span className="onb-arrow">↗</span></button></div></> : <>
        <p className="onb-kicker">{role === 'student' ? 'НАЛАШТУЄМО ТВІЙ ПРОСТІР' : 'НАЛАШТУВАННЯ ВИКЛАДАЧА'}</p><h1>{step === 'university' && role === 'teacher' ? 'Де ти викладаєш?' : titles[step]}</h1>
        <p className="onb-description">{step === 'teacher' ? 'Введи прізвище або ім’я та обери результат.' : step === 'university' ? 'Почнемо з вибору університету.' : step === 'faculty' ? 'Обери факультет із доступного списку.' : step === 'course' ? 'Обери курс, на якому навчаєшся.' : 'Залишився останній крок.'}</p>
        <div className="onb-demo"><span aria-hidden="true">✳</span><span><b>Демонстраційний каталог</b><br/>Назви й імена вигадані та не є базою ВНАУ.</span></div>
        <div className="onb-options">
          {step === 'university' && DEMO_UNIVERSITIES.map(item => <button key={item} className="onb-choice" onClick={() => { setUniversity(item); setStep(role === 'student' ? 'faculty' : 'teacher') }}><span className="onb-option-symbol">У</span><span><b>{item}</b><small>Тестовий варіант</small></span><span className="onb-chevron">›</span></button>)}
          {step === 'faculty' && DEMO_FACULTIES.map(item => <button key={item.name} className="onb-choice" onClick={() => { setFaculty(item.name); setStep('course') }}><span><b>{item.name}</b></span><span className="onb-chevron">›</span></button>)}
          {step === 'course' && ['1', '2', '3', '4'].map(item => <button key={item} className="onb-choice" onClick={() => { setCourse(item); setStep('group') }}><span><b>{item} курс</b></span><span className="onb-chevron">›</span></button>)}
          {step === 'group' && groups.map(item => <button key={item} className="onb-choice" onClick={() => complete({ faculty, course, group: item })}><span><b>{item}</b><small>{faculty} · {course} курс</small></span><span className="onb-chevron">›</span></button>)}
          {step === 'teacher' && <><label className="onb-search"><span aria-hidden="true">⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Прізвище або ім’я" autoComplete="off" aria-label="Пошук викладача"/></label>{normalizedQuery ? teachers.length ? teachers.map(item => <button key={item} className="onb-choice" onClick={() => complete({ teacher: item })}><span className="onb-option-symbol">{item.charAt(0)}</span><span><b>{item}</b><small>Демонстраційний профіль</small></span><span className="onb-chevron">›</span></button>) : <p className="onb-search-empty">Нічого не знайдено. Спробуй інше ім’я або прізвище.</p> : <p className="onb-search-empty">Наприклад, Коваль</p>}</>}
        </div>
      </>}
      <p className="onb-privacy">Обрані налаштування зберігаються на цьому пристрої.</p>
    </div>}
  </main>
}
