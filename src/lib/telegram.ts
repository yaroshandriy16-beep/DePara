interface TelegramUser {
  first_name?: string
  last_name?: string
  photo_url?: string
}

interface TelegramWebApp {
  ready(): void
  expand(): void
  initData?: string
  initDataUnsafe?: { user?: TelegramUser }
}

/** Sent to the server for signature verification; never use it as proof locally. */
export function getTelegramInitData(): string {
  return window.Telegram?.WebApp?.initData || ''
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

/** This profile is unverified and is suitable only for display, never authentication. */
export interface TelegramDisplayProfile {
  name: string
  photoUrl?: string
}

export function initTelegram(): void {
  const app = window.Telegram?.WebApp
  app?.ready()
  app?.expand()
}

export function getTelegramProfile(): TelegramDisplayProfile | null {
  const user = window.Telegram?.WebApp?.initDataUnsafe?.user
  if (!user) return null
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
  return { name: name || 'Користувач', photoUrl: user.photo_url }
}
