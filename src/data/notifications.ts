import { vnauApiOrigin, type VnauIdentity } from './vnauApi'

export type NotificationStatus = {
  enabled: boolean
  pending?: boolean
  identity?: { kind: 'group' | 'teacher'; id: string; name: string }
}
type Action = 'status' | 'enable' | 'disable' | 'test'

/** initData is sent in a POST body, never in a URL or browser storage. */
export async function notificationRequest(action: Action, initData: string, identity?: VnauIdentity): Promise<NotificationStatus | {sent: true}> {
  if (!vnauApiOrigin) throw new Error('Сервіс сповіщень ще не налаштовано.')
  if (!initData) throw new Error('Відкрийте застосунок через тестового Telegram-бота.')
  const controller = new AbortController(), timer = window.setTimeout(() => controller.abort(), 90000)
  try {
    const response = await fetch(new URL(`/api/notifications/${action}`, vnauApiOrigin), {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({initData, ...(identity ? {identity} : {})}),
      credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal,
    })
    const data: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : 'Сповіщення тимчасово недоступні.'
      throw new Error(message.slice(0, 250))
    }
    if (!data || typeof data !== 'object') throw new Error('Не вдалося перевірити налаштування.')
    if (action === 'test') {
      if (!('sent' in data) || data.sent !== true) throw new Error('Не вдалося підтвердити надсилання.')
      return {sent: true}
    }
    if (!('enabled' in data) || typeof data.enabled !== 'boolean') throw new Error('Не вдалося перевірити налаштування.')
    const status = data as NotificationStatus
    if (status.enabled && (!status.identity || !['group', 'teacher'].includes(status.identity.kind) || !/^\d{1,12}$/.test(status.identity.id) || typeof status.identity.name !== 'string' || !status.identity.name.trim())) throw new Error('Не вдалося перевірити налаштування.')
    return status
  } finally {window.clearTimeout(timer)}
}
