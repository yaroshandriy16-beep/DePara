/** A schedule entry independent of any particular university's data format. */
export interface Lesson {
  id: string
  /** JavaScript weekday: Sunday is 0, Monday is 1. */
  day: number
  startsAt: string
  endsAt: string
  title: string
  type: string
  location: string
  teacher: string
  group: string
  color: 'violet' | 'orange' | 'blue' | 'green'
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
