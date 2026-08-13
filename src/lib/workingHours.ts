import { supabase } from './supabase'

export const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

export interface WorkingHours {
  start: string // HH:mm
  end: string // HH:mm
  days: Record<string, boolean>
}

function defaultWorkingDays(): Record<string, boolean> {
  return {
    Monday: true,
    Tuesday: true,
    Wednesday: true,
    Thursday: true,
    Friday: true,
    Saturday: false,
    Sunday: false,
  }
}

export function defaultWorkingHours(): WorkingHours {
  return { start: '09:00', end: '20:00', days: defaultWorkingDays() }
}

/**
 * Instructor working hours are the single source of truth for how long an
 * appointment/lesson slot can be, and which days are bookable at all — the
 * instructor sets these once in Settings > Working hours, and every other
 * surface (pupil "My availability", the instructor's per-pupil Availability
 * view, and the public enquiry.html form) must read the SAME values so a
 * pupil is never offered a slot outside the instructor's actual hours.
 *
 * This reads from the `app_settings` table (id = 'working_hours'), which is
 * the same row Settings.tsx writes to and the same row enquiry.html already
 * reads. localStorage is only used as an instant-paint fallback for whoever
 * set the hours on that same device — it is never trusted as the source of
 * truth, since it doesn't exist on a pupil's device at all.
 */
export async function fetchWorkingHours(): Promise<WorkingHours> {
  try {
    const { data, error } = await supabase.from('app_settings').select('value').eq('id', 'working_hours').maybeSingle()
    if (!error && data?.value) {
      const v = data.value as any
      return {
        start: v.start || '09:00',
        end: v.end || '20:00',
        days: { ...defaultWorkingDays(), ...(v.days || {}) },
      }
    }
  } catch {
    /* fall through to local/default below */
  }
  // Fallback only (offline, or table not reachable yet): last-known value on
  // this device, else the built-in default. Never authoritative.
  try {
    const raw = localStorage.getItem('dmw_working_hours')
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        start: parsed.start || '09:00',
        end: parsed.end || '20:00',
        days: { ...defaultWorkingDays(), ...(parsed.days || {}) },
      }
    }
  } catch {
    /* ignore */
  }
  return defaultWorkingHours()
}

export function workingDaysList(hours: WorkingHours): string[] {
  return ALL_DAYS.filter((d) => hours.days[d] !== false)
}

export function slotsForHours(hours: WorkingHours): string[] {
  const [sh, sm] = hours.start.split(':').map(Number)
  const [eh, em] = hours.end.split(':').map(Number)
  const startM = sh * 60 + sm
  const endM = eh * 60 + em
  const out: string[] = []
  for (let m = startM; m < endM; m += 30) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
  }
  return out
}
