import { useEffect, useRef, useState } from 'react'
import { DEMO_FACULTIES, DEMO_UNIVERSITIES } from './catalog'
import { makeSavedGroup, type SavedGroup } from './groups'
import './group-picker.css'

type Step = 'university' | 'faculty' | 'course' | 'group'
interface Props {
  existingGroups: SavedGroup[]
  onSelect: (group: SavedGroup) => void
  onCancel: () => void
}

/** A separate flow: choosing a schedule never changes the onboarding profile. */
export function GroupPicker({ existingGroups, onSelect, onCancel }: Props) {
  const panelRef = useRef<HTMLElement>(null)
  const [step, setStep] = useState<Step>('university')
  const [university, setUniversity] = useState('')
  const [faculty, setFaculty] = useState('')
  const [course, setCourse] = useState('')
  const back = () => {
    if (step === 'university') onCancel()
    else if (step === 'faculty') setStep('university')
    else if (step === 'course') setStep('faculty')
    else setStep('course')
  }
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCancel(); return }
      if (event.key !== 'Tab' || !panelRef.current) return
      const items = [...panelRef.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
      if (!items.length) return
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus() }
      else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown); previous?.focus() }
  }, [onCancel])
  const groups = DEMO_FACULTIES.find(item => item.name === faculty)?.groups.filter(item => item.split('-')[1]?.startsWith(course)) || []
  const titles = { university: 'Обери університет', faculty: 'Обери факультет', course: 'Обери курс', group: 'Обери групу' }
  const options: { label: string; sub?: string; onClick: () => void; disabled?: boolean }[] =
    step === 'university' ? DEMO_UNIVERSITIES.map(item => ({ label: item, sub: 'Тестовий варіант', onClick: () => { setUniversity(item); setStep('faculty') } })) :
    step === 'faculty' ? DEMO_FACULTIES.map(item => ({ label: item.name, onClick: () => { setFaculty(item.name); setStep('course') } })) :
    step === 'course' ? ['1', '2', '3', '4'].map(item => ({ label: `${item} курс`, onClick: () => { setCourse(item); setStep('group') } })) :
    groups.map(item => {
      const group = makeSavedGroup({ university, faculty, course, group: item })
      const exists = existingGroups.some(existing => existing.id === group.id)
      return { label: item, sub: exists ? 'Вже додано' : `${faculty} · ${course} курс`, disabled: exists, onClick: () => onSelect(group) }
    })
  return <div className="group-picker-overlay" onClick={onCancel}>
    <section ref={panelRef} className="group-picker" role="dialog" aria-modal="true" aria-labelledby="group-picker-title" onClick={event => event.stopPropagation()}>
      <div className="group-picker-header"><button type="button" onClick={back} aria-label="Назад">←</button><span>ДОДАТИ РОЗКЛАД</span><button type="button" onClick={onCancel} aria-label="Закрити">×</button></div>
      <div className="group-picker-progress" aria-hidden="true"><span style={{ width: `${(['university', 'faculty', 'course', 'group'].indexOf(step) + 1) * 25}%` }}/></div>
      <h2 id="group-picker-title">{titles[step]}</h2>
      <p className="group-picker-subtitle">Додай розклад, щоб швидко перемикатися між групами.</p>
      <p className="group-picker-notice"><b>Демонстраційний каталог.</b> Назви та групи вигадані й не є базою ВНАУ.</p>
      <div className="group-picker-options">{options.map(option => <button key={option.label} type="button" onClick={option.onClick} disabled={option.disabled}><span><b>{option.label}</b>{option.sub && <small>{option.sub}</small>}</span><span aria-hidden="true">›</span></button>)}</div>
      <p className="group-picker-footnote">Твоя основна група та роль залишаться без змін.</p>
    </section>
  </div>
}
