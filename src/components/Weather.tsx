import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import './Weather.css'

export type WeatherKind = 'sun' | 'cloud' | 'rain' | 'snow' | 'night'
type WeatherReading = { temperature: number; code: number; isDay: boolean; observedAt: string; fetchedAt: number }
export type WeatherState = { reading: WeatherReading | null; kind: WeatherKind; status: 'loading' | 'live' | 'cached' | 'unavailable' }
const CACHE_KEY = 'depara-weather-vinnytsia-v1'
const URL = 'https://api.open-meteo.com/v1/forecast?latitude=49.2331&longitude=28.4682&current=temperature_2m,weather_code,is_day&timezone=Europe%2FKyiv'

/** Open-Meteo WMO codes; nighttime precipitation is retained as rain or snow. */
export function weatherKind(code: number, isDay: boolean): WeatherKind {
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow'
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code)) return 'rain'
  if (!isDay && [0, 1, 2, 3].includes(code)) return 'night'
  if ([0, 1].includes(code)) return 'sun'
  return 'cloud'
}
function readCache(): WeatherReading | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
    if (!value || typeof value !== 'object') return null
    const v = value as Partial<WeatherReading>
    if (typeof v.temperature !== 'number' || !Number.isFinite(v.temperature) || typeof v.code !== 'number' || !Number.isFinite(v.code) || typeof v.isDay !== 'boolean' || typeof v.observedAt !== 'string' || typeof v.fetchedAt !== 'number' || !Number.isFinite(v.fetchedAt)) return null
    return v as WeatherReading
  } catch { return null }
}
function asState(reading: WeatherReading | null, status: WeatherState['status']): WeatherState {
  return { reading, kind: reading ? weatherKind(reading.code, reading.isDay) : 'cloud', status }
}
export function useWeather(): WeatherState {
  const [state, setState] = useState<WeatherState>(() => { const cache = readCache(); return asState(cache, cache ? 'cached' : 'loading') })
  useEffect(() => {
    let disposed = false
    let controller: AbortController | undefined
    const refresh = async () => {
      controller?.abort()
      const active = new AbortController()
      controller = active
      const timeout = window.setTimeout(() => active.abort(), 8000)
      try {
        const response = await fetch(URL, { signal: active.signal })
        if (!response.ok) throw new Error('weather request failed')
        const data: unknown = await response.json()
        if (!data || typeof data !== 'object' || !('current' in data)) throw new Error('weather unavailable')
        const c = (data as { current?: { temperature_2m?: unknown; weather_code?: unknown; is_day?: unknown; time?: unknown } }).current
        if (!c || typeof c.temperature_2m !== 'number' || !Number.isFinite(c.temperature_2m) || typeof c.weather_code !== 'number' || !Number.isFinite(c.weather_code) || (c.is_day !== 0 && c.is_day !== 1) || typeof c.time !== 'string') throw new Error('invalid weather data')
        const reading: WeatherReading = { temperature: c.temperature_2m, code: c.weather_code, isDay: c.is_day === 1, observedAt: c.time, fetchedAt: Date.now() }
        if (!disposed) {
          setState(asState(reading, 'live'))
          try { localStorage.setItem(CACHE_KEY, JSON.stringify(reading)) } catch { /* cache is optional */ }
        }
      } catch {
        if (!disposed) { const cache = readCache(); setState(asState(cache, cache ? 'cached' : 'unavailable')) }
      } finally { window.clearTimeout(timeout) }
    }
    void refresh()
    const interval = window.setInterval(() => { void refresh() }, 15 * 60 * 1000)
    return () => { disposed = true; controller?.abort(); window.clearInterval(interval) }
  }, [])
  return state
}

const ICONS: Record<WeatherKind, string> = { sun: '☀️', cloud: '☁️', rain: '🌧️', snow: '❄️', night: '🌙' }
const LABELS: Record<WeatherKind, string> = { sun: 'сонячно', cloud: 'хмарно', rain: 'дощ', snow: 'сніг', night: 'ніч' }
export function WeatherBackdrop({ weather, effects, animations }: { weather: WeatherState; effects: boolean; animations: boolean }) {
  const showParticles = effects && animations && (weather.kind === 'rain' || weather.kind === 'snow' || weather.kind === 'night')
  return <div className={`weather-backdrop weather-${weather.kind} ${weather.reading && !weather.reading.isDay ? 'weather-after-dark' : ''} ${animations && effects ? '' : 'weather-still'}`} aria-hidden="true">
    <div className="weather-glow"/>
    {showParticles && <div className={`weather-particles weather-particles-${weather.kind}`}>{Array.from({ length: weather.kind === 'night' ? 18 : 22 }, (_, i) => <i key={i} style={{ left: `${(i * 47 + 9) % 101}%`, top: `${weather.kind === 'night' ? (i * 19) % 95 : -((i * 19) % 110)}vh`, animationDelay: `${-(i * .37)}s`, animationDuration: `${weather.kind === 'rain' ? 1.2 + (i % 6) * .16 : 7 + (i % 5)}s` }}/>)}</div>}
  </div>
}
export function WeatherControl({ weather, effects, animations, onEffectsChange, onAnimationsChange }: { weather: WeatherState; effects: boolean; animations: boolean; onEffectsChange: (enabled: boolean) => void; onAnimationsChange: (enabled: boolean) => void }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [open])
  const temperature = weather.reading ? `${weather.reading.temperature > 0 ? '+' : ''}${Math.round(weather.reading.temperature)}°` : '—'
  const status = weather.status === 'live' ? 'Зараз у Вінниці · Open-Meteo' : weather.status === 'cached' ? `Останні отримані дані · ${new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(weather.reading!.fetchedAt))}` : weather.status === 'loading' ? 'Завантажуємо погоду…' : 'Погода тимчасово недоступна'
  return <>
    <button type="button" className="weather-control" onClick={() => setOpen(true)} aria-label={`Погода у Вінниці: ${weather.reading ? `${LABELS[weather.kind]}, ${temperature}` : 'дані недоступні'}. Відкрити подробиці`}><span aria-hidden="true">{weather.reading ? ICONS[weather.kind] : '☁️'}</span><strong>{temperature}</strong></button>
    {open && createPortal(<div className="weather-modal-backdrop" onClick={() => setOpen(false)}><section className="weather-modal" role="dialog" aria-modal="true" aria-labelledby="weather-title" onClick={event => event.stopPropagation()}><div className="weather-modal-heading"><div><span className="weather-modal-kicker">ДЕПАРА · ВІННИЦЯ</span><h2 id="weather-title">Погода</h2></div><button className="weather-modal-close" onClick={() => setOpen(false)} aria-label="Закрити">×</button></div><div className="weather-modal-current"><span aria-hidden="true">{weather.reading ? ICONS[weather.kind] : '☁️'}</span><div><strong>{temperature}</strong><p>{weather.reading ? LABELS[weather.kind] : 'Немає даних'}</p></div></div><p className="weather-modal-note">{status}</p><p className="weather-modal-copy">Фон змінюється автоматично за погодою у Вінниці. Дані про місцеположення не запитуються.</p><label className="weather-modal-setting"><span>Погодні ефекти</span><input type="checkbox" checked={effects} onChange={event => onEffectsChange(event.target.checked)}/></label><label className="weather-modal-setting"><span>Анімації</span><input type="checkbox" checked={animations} onChange={event => onAnimationsChange(event.target.checked)}/></label><button className="weather-modal-done" onClick={() => setOpen(false)}>Готово</button></section></div>, document.body)}
  </>
}
