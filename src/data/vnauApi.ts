import { VnauScheduleSource, type VnauDateRange, type VnauResult } from './vnau'

/** Client for the separately deployed HTTPS server; it never contacts MKR directly. */
export interface VnauOption { id: string; name: string; detail?: string }
export type VnauIdentity =
  | { kind: 'group'; id: string; facultyId: string; course: string; name: string }
  | { kind: 'teacher'; id: string }

const configured = import.meta.env?.VITE_VNAU_API_ORIGIN as string | undefined
function serverOrigin(): string | null {
  if (!configured) return null
  try {
    const url = new URL(configured)
    return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash ? url.origin : null
  } catch { return null }
}

/** The URL is public configuration, never a credential. */
export const vnauApiOrigin = serverOrigin()
export function vnauEndpoint(path: string, query: Record<string, string> = {}): string {
  if (!vnauApiOrigin) throw new Error('Сервіс ВНАУ ще не підключено. Спробуйте пізніше.')
  if (!path.startsWith('/api/vnau/')) throw new Error('Некоректна адреса сервісу ВНАУ.')
  const url = new URL(path, vnauApiOrigin)
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  return url.href
}

type OptionResponse = { options: VnauOption[] }
const inflight = new Map<string, Promise<OptionResponse>>()
const schedules = new Map<string, Promise<VnauResult>>()

export function loadVnauSchedule(identity: VnauIdentity, range: VnauDateRange): Promise<VnauResult> {
  if (!/^[0-9]{1,12}$/.test(identity.id)) return Promise.reject(new Error('Некоректний ID розкладу ВНАУ.'))
  const path = `/api/vnau/${identity.kind === 'group' ? 'groups' : 'teachers'}/${identity.id}/schedule`
  const query: Record<string, string> = { start: range.start, end: range.end }
  if (identity.kind === 'group') {
    if (!/^[0-9]{1,12}$/.test(identity.facultyId) || !/^[1-7]$/.test(identity.course) || !identity.name.trim()) return Promise.reject(new Error('Некоректні дані групи ВНАУ.'))
    Object.assign(query, { facultyId: identity.facultyId, course: identity.course, name: identity.name })
  }
  const url = vnauEndpoint(path, query)
  let pending = schedules.get(url)
  if (!pending) {
    pending = new VnauScheduleSource({kind: identity.kind, id: identity.id}, url, range).load()
    schedules.set(url, pending)
    void pending.finally(() => schedules.delete(url)).catch(() => {})
  }
  return pending
}
function readOptions(value: unknown, key: 'faculties' | 'courses' | 'groups' | 'teachers'): VnauOption[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as Record<string, unknown>)[key])) throw new Error('Не вдалося перевірити каталог ВНАУ.')
  const entries = (value as Record<string, unknown>)[key] as unknown[]
  if (entries.length > 1000) throw new Error('Список ВНАУ завеликий для перевірки.')
  const seen = new Set<string>()
  return entries.map(item => {
    if (!item || typeof item !== 'object') throw new Error('Не вдалося перевірити каталог ВНАУ.')
    const record = item as Record<string, unknown>
    if (typeof record.id !== 'string' || !/^[0-9]{1,12}$/.test(record.id) || seen.has(record.id) || typeof record.name !== 'string' || !record.name.trim() || record.name.length > 200 || (record.chair != null && (typeof record.chair !== 'string' || record.chair.length > 200))) throw new Error('Не вдалося перевірити каталог ВНАУ.')
    seen.add(record.id)
    return { id: record.id, name: record.name, detail: typeof record.chair === 'string' ? record.chair : undefined }
  })
}

/** Deduplicate concurrent StrictMode renders without persisting search terms. */
export async function vnauOptions(path: string, key: 'faculties' | 'courses' | 'groups' | 'teachers', query: Record<string, string> = {}): Promise<VnauOption[]> {
  const url = vnauEndpoint(path, query)
  let request = inflight.get(url)
  if (!request) {
    request = (async () => {
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), 45000)
      try {
        // A single bounded retry handles the server's short upstream cooldown.
        for (let attempt = 0; attempt < 2; attempt++) {
          const response = await fetch(url, { credentials: 'omit', cache: 'no-cache', redirect: 'error', signal: controller.signal })
          if ((response.status === 429 || response.status === 503) && response.headers.has('Retry-After') && attempt === 0) {
            const seconds = Math.min(10, Math.max(1, Number(response.headers.get('Retry-After')) || 2))
            await new Promise(resolve => window.setTimeout(resolve, seconds * 1000))
            continue
          }
          if (!response.ok) {
            const data: unknown = await response.json().catch(() => null)
            const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : 'Сервіс ВНАУ тимчасово недоступний.'
            throw new Error(message.slice(0, 250))
          }
          return { options: readOptions(await response.json(), key) }
        }
        throw new Error('Сервіс ВНАУ тимчасово недоступний.')
      } finally { window.clearTimeout(timeout) }
    })()
    inflight.set(url, request)
    void request.finally(() => inflight.delete(url)).catch(() => {})
  }
  return (await request).options
}
