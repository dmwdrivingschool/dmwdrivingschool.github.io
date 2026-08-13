import { supabase } from './supabase'

export interface QuietHoursSettings {
  enabled: boolean
  start: string // HH:mm
  end: string // HH:mm, may wrap past midnight
  emergencyNote: string
}

export const DEFAULT_QUIET_HOURS: QuietHoursSettings = {
  enabled: false,
  start: '22:00',
  end: '08:00',
  emergencyNote: 'If this is an emergency, please call or text your instructor directly rather than messaging in the app.',
}

function toMinutes(hm: string) {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + m
}

export function isQuietNow(qh: QuietHoursSettings, now = new Date()) {
  if (!qh.enabled) return false
  const s = toMinutes(qh.start)
  const e = toMinutes(qh.end)
  const n = now.getHours() * 60 + now.getMinutes()
  if (s === e) return false
  return s < e ? n >= s && n < e : n >= s || n < e
}

/** Next time-of-day the window's "end" occurs, as an absolute Date. */
export function nextWindowOpen(qh: QuietHoursSettings, now = new Date()) {
  const [eh, em] = qh.end.split(':').map(Number)
  const candidate = new Date(now)
  candidate.setHours(eh, em, 0, 0)
  if (candidate <= now) candidate.setDate(candidate.getDate() + 1)
  return candidate
}

/**
 * Every pupil-facing place a message can be sent from (the Home quick-message
 * box, the full Messages page, and any future one) must call this rather than
 * keep its own copy — a stale/missing fetch here was exactly why quiet hours
 * silently didn't apply to the Home screen's message box.
 */
export async function fetchQuietHours(): Promise<QuietHoursSettings> {
  try {
    const { data, error } = await supabase.from('app_settings').select('value').eq('id', 'message_quiet_hours').maybeSingle()
    if (!error && data?.value) {
      return { ...DEFAULT_QUIET_HOURS, ...(data.value as any) }
    }
  } catch {
    /* fall through to default below */
  }
  return DEFAULT_QUIET_HOURS
}
