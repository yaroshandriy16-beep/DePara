import { useEffect, useState } from 'react'
import type { VnauIdentity } from '../data/vnauApi'
import { notificationRequest, type NotificationStatus } from '../data/notifications'
import { getTelegramInitData } from '../lib/telegram'

export function NotificationSettings({ identity }: { identity: VnauIdentity | null }) {
  const initData = getTelegramInitData()
  const [status, setStatus] = useState<NotificationStatus>({enabled: false})
  const [busy, setBusy] = useState(Boolean(initData))
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let current = true
    if (!initData) return () => { current = false }
    setBusy(true); setError('')
    void notificationRequest('status', initData).then(value => {
      if (current && 'enabled' in value) setStatus(value)
    }).catch(cause => {
      if (current) setError(cause instanceof Error ? cause.message : 'Сповіщення тимчасово недоступні.')
    }).finally(() => { if (current) setBusy(false) })
    return () => { current = false }
  }, [initData])

  const run = async (action: 'status' | 'enable' | 'disable' | 'test') => {
    setBusy(true); setError(''); setNotice('')
    try {
      const value = await notificationRequest(action, initData, action === 'enable' ? identity || undefined : undefined)
      if ('enabled' in value) setStatus(value)
      else setNotice('Тестове повідомлення надіслано в бот.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Сповіщення тимчасово недоступні.') }
    finally { setBusy(false) }
  }
  const different = Boolean(status.enabled && identity && status.identity && (status.identity.kind !== identity.kind || status.identity.id !== identity.id))
  const detail = !initData ? 'Відкрийте застосунок через тестового Telegram-бота.'
    : status.enabled ? status.pending ? `Очікуємо першу перевірку: ${status.identity?.name || 'обраний розклад'}.` : `Увімкнено для: ${status.identity?.name || 'обраного розкладу'}.`
      : identity ? 'Перевірка приблизно раз на дві години, навіть коли застосунок закритий.' : 'Доступно для обраного розкладу ВНАУ.'

  return <>
    <div className="other-subheading"><h2>Сповіщення</h2></div>
    <div className="other-settings">
      <label className="other-setting"><span><b>Зміни розкладу в Telegram</b><small>{detail}</small></span><input type="checkbox" aria-label="Зміни розкладу в Telegram" checked={status.enabled} disabled={!initData || busy || (!identity && !status.enabled)} onChange={event => void run(event.target.checked ? 'enable' : 'disable')}/></label>
      {different && <button className="other-text-button" type="button" disabled={busy} onClick={() => void run('enable')}>Слідкувати за поточним розкладом <span aria-hidden="true">→</span></button>}
      {status.pending && <button className="other-text-button" type="button" disabled={busy} onClick={() => void run('status')}>Оновити стан підписки <span aria-hidden="true">→</span></button>}
      {status.enabled && <button className="other-text-button" type="button" disabled={busy} onClick={() => void run('test')}>Надіслати тестове повідомлення <span aria-hidden="true">→</span></button>}
    </div>
    {busy && <p className="other-footnote" role="status">Перевіряємо налаштування…</p>}
    {notice && <p className="other-footnote" role="status">{notice}</p>}
    {error && <p className="other-footnote" role="alert">{error}</p>}
  </>
}
