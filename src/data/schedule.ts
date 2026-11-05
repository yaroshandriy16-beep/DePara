/** A schedule entry independent of any particular university's data format. */
export interface Lesson {
  id: string
  /** JavaScript weekday: Sunday is 0, Monday is 1 (used for recurring demo lessons). */
  day: number
  /** Calendar date in Europe/Kyiv, YYYY-MM-DD. Dated lessons never repeat weekly. */
  date?: string
  /** Stable IDs supplied by a verified source; labels are for display only. */
  academicGroupId?: string
  teacherId?: string
  sourceId?: string
  subgroup?: string
  /** Source metadata when supplied by the verified timetable. */
  lessonNumber?: number
  shortSubject?: string
  addedDate?: string
  updatedIndicator?: boolean
  startsAt: string
  endsAt: string
  title: string
  type: string
  location: string
  teacher: string
  group: string
  color: 'violet' | 'orange' | 'blue' | 'green'
}

/** Convert a displayed calendar day to a date key without a UTC conversion. */
export function calendarDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export type CalendarRange = { start: string; end: string }
export function weekRange(date: Date): CalendarRange {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7))
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)
  return { start: calendarDateKey(monday), end: calendarDateKey(sunday) }
}
export function monthRange(date: Date): CalendarRange {
  return { start: calendarDateKey(new Date(date.getFullYear(), date.getMonth(), 1)), end: calendarDateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0)) }
}

/** Dates from the real source take precedence; only undated demo entries recur. */
export function lessonOccursOnDate(lesson: Lesson, date: Date): boolean {
  return lesson.date !== undefined ? lesson.date === calendarDateKey(date) : lesson.day === date.getDay()
}

export function lessonsOnDate(lessons: readonly Lesson[], date: Date): Lesson[] {
  return lessons.filter(lesson => lessonOccursOnDate(lesson, date)).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

/** Current Kyiv wall-clock components represented as a local calendar value for the UI. */
export function kyivNow(): Date {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
  const number = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value)
  return new Date(number('year'), number('month') - 1, number('day'), number('hour'), number('minute'), number('second'))
}

/** Free periods between occupied intervals, merging overlaps and duplicate events. */
export function freeIntervals(lessons: readonly Lesson[]): { start: string; end: string }[] {
  const toMinutes = (time: string) => {
    const match = /^(\d{2}):(\d{2})$/.exec(time)
    if (!match) return NaN
    const hours = Number(match[1]), minutes = Number(match[2])
    return hours < 24 && minutes < 60 ? hours * 60 + minutes : NaN
  }
  const ordered = lessons.map(lesson => ({ start: lesson.startsAt, end: lesson.endsAt, startMinutes: toMinutes(lesson.startsAt), endMinutes: toMinutes(lesson.endsAt) }))
    .filter(item => Number.isFinite(item.startMinutes) && Number.isFinite(item.endMinutes) && item.endMinutes > item.startMinutes)
    .sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes)
  const gaps: { start: string; end: string }[] = []
  if (!ordered.length) return gaps
  let occupiedEnd = ordered[0].endMinutes
  let occupiedEndLabel = ordered[0].end
  for (const item of ordered.slice(1)) {
    if (item.startMinutes > occupiedEnd) gaps.push({ start: occupiedEndLabel, end: item.start })
    if (item.endMinutes > occupiedEnd) { occupiedEnd = item.endMinutes; occupiedEndLabel = item.end }
  }
  return gaps
}

/** Future sources can fetch and normalize university data behind this boundary. */
export interface ScheduleSource {
  readonly kind: 'demo' | 'external'
  getLessons(): Promise<Lesson[]>
}

// Illustrative content only; this is not a real university timetable.
export const DEMO_LESSONS: Lesson[] = [
  { id: 'demo-1', day: 1, startsAt: '08:30', endsAt: '09:50', title: 'Основи маркетингу', type: 'Лекція', location: 'Ауд. 301', teacher: 'Олена Коваль', group: 'МН-21', color: 'violet' },
  { id: 'demo-2', day: 1, startsAt: '10:00', endsAt: '11:20', title: 'Англійська мова', type: 'Практична', location: 'Ауд. 204', teacher: 'Ірина Мельник', group: 'МН-21', color: 'orange' },
  { id: 'demo-3', day: 1, startsAt: '11:40', endsAt: '13:00', title: 'Економіка підприємства', type: 'Лекція', location: 'Ауд. 105', teacher: 'Андрій Бондар', group: 'МН-21', color: 'blue' },
  { id: 'demo-4', day: 2, startsAt: '10:00', endsAt: '11:20', title: 'Менеджмент', type: 'Лекція', location: 'Ауд. 302', teacher: 'Наталія Лісова', group: 'МН-21', color: 'green' },
  { id: 'demo-5', day: 2, startsAt: '11:40', endsAt: '13:00', title: 'Основи маркетингу', type: 'Практична', location: 'Ауд. 301', teacher: 'Олена Коваль', group: 'МН-21', color: 'violet' },
  { id: 'demo-6', day: 3, startsAt: '08:30', endsAt: '09:50', title: 'Інформаційні технології', type: 'Практична', location: 'Ауд. 212', teacher: 'Максим Романюк', group: 'МН-21', color: 'blue' },
  { id: 'demo-7', day: 3, startsAt: '10:00', endsAt: '11:20', title: 'Англійська мова', type: 'Практична', location: 'Ауд. 204', teacher: 'Ірина Мельник', group: 'МН-21', color: 'orange' },
  { id: 'demo-8', day: 4, startsAt: '10:00', endsAt: '11:20', title: 'Економіка підприємства', type: 'Практична', location: 'Ауд. 105', teacher: 'Андрій Бондар', group: 'МН-21', color: 'blue' },
  { id: 'demo-9', day: 4, startsAt: '11:40', endsAt: '13:00', title: 'Менеджмент', type: 'Практична', location: 'Ауд. 302', teacher: 'Наталія Лісова', group: 'МН-21', color: 'green' },
  { id: 'demo-10', day: 5, startsAt: '08:30', endsAt: '09:50', title: 'Основи маркетингу', type: 'Лекція', location: 'Ауд. 301', teacher: 'Олена Коваль', group: 'МН-21', color: 'violet' },
]

export const demoSchedule: ScheduleSource = {
  kind: 'demo',
  async getLessons() {
    return DEMO_LESSONS.map((lesson) => ({ ...lesson }))
  },
}
