/** These are fictional examples for testing, not a university directory. */
export type Role = 'student' | 'teacher'
export interface UserSelection {
  role: Role
  university: string
  faculty?: string
  course?: string
  group?: string
  teacher?: string
}

export const DEMO_UNIVERSITIES = ['Демонстраційний університет'] as const
export const DEMO_FACULTIES = [
  { name: 'Факультет економіки', groups: ['ЕК-11', 'ЕК-21', 'ЕК-31', 'ЕК-41'] },
  { name: 'Факультет технологій', groups: ['ТХ-11', 'ТХ-21', 'ТХ-31', 'ТХ-41'] },
  { name: 'Факультет менеджменту', groups: ['МН-11', 'МН-21', 'МН-31', 'МН-41'] },
] as const
export const DEMO_TEACHERS = ['Олена Коваль', 'Ірина Мельник', 'Андрій Бондар', 'Наталія Лісова', 'Максим Романюк'] as const

const STORAGE_KEY = 'depara-selection-v2'

export function loadSelection(): UserSelection | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return null
    const selection = value as Partial<UserSelection>
    if (selection.role === 'student' && selection.university && selection.faculty && selection.course && selection.group) return selection as UserSelection
    if (selection.role === 'teacher' && selection.university && selection.teacher) return selection as UserSelection
    return null
  } catch { return null }
}
export function saveSelection(selection: UserSelection): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(selection)) } catch { /* Storage can be unavailable. */ }
}
export function clearSelection(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* Storage can be unavailable. */ }
}
