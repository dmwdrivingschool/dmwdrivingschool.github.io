import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Lesson } from '../types/database'
import { formatTime, cn } from '../lib/utils'
import { cacheGet, cacheSet, lessonsCacheKey, isOnline } from '../lib/offlineCache'
import { autoCompletePastLessons } from '../lib/autoCompleteLessons'
import { Plus, ChevronLeft, ChevronRight, Calendar, RefreshCw } from 'lucide-react'
import {
  addDays,
  addMonths,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  eachDayOfInterval,
  differenceInMinutes,
} from 'date-fns'
import AddLessonModal from '../components/AddLessonModal'
import EditLessonModal from '../components/EditLessonModal'
import GapModal from '../components/GapModal'
import AwayModal from '../components/AwayModal'
import AddPupilModal from '../components/AddPupilModal'
import AddNewMenu from '../components/AddNewMenu'

type ViewMode = 'day' | 'week' | 'month'

function getWorkingHours() {
  try {
    const raw = localStorage.getItem('dmw_working_hours')
    if (raw) return JSON.parse(raw)
  } catch {}
  return { start: '09:00', end: '15:00' }
}
function buildHours() {
  // Full day so user can scroll above/below working hours
  return Array.from({ length: 24 }, (_, i) => i)
}
const HOURS = buildHours()
// Slightly taller rows so name + times + Paid/Unpaid stay readable (Total Drive style)
const HOUR_HEIGHT = 72
function defaultScrollHour() {
  const { start } = getWorkingHours()
  return parseInt(start.split(':')[0], 10) || 9
}
const DEFAULT_SCROLL_HOUR = defaultScrollHour()

function shortName(pupil: { first_name?: string; last_name?: string } | null | undefined, fallback?: string, compact = false) {
  if (!pupil?.first_name) return fallback || 'Private'
  const last = (pupil.last_name || '').trim()
  // Week grid: full first + last so the name can wrap onto two lines
  if (compact) {
    if (!last) return pupil.first_name
    return `${pupil.first_name} ${last}`
  }
  const initial = last.charAt(0)
  return initial ? `${pupil.first_name} ${initial}.` : pupil.first_name
}

function getNowLineColour() {
  try {
    const raw = localStorage.getItem('dmw_diary_colours')
    if (raw) {
      const c = JSON.parse(raw)
      if (c?.nowLine) return c.nowLine as string
    }
  } catch {}
  return '#2563eb'
}


export default function Diary() {
  const navigate = useNavigate()
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60000)
    return () => clearInterval(id)
  }, [])
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      return (localStorage.getItem('dmw_diary_view') as ViewMode) || 'week'
    } catch { return 'week' }
  })
  const [showCal, setShowCal] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [editLesson, setEditLesson] = useState<Lesson | null>(null)
  const [editAway, setEditAway] = useState<Lesson | null>(null)
  const [showAddLesson, setShowAddLesson] = useState(false)
  const [showGap, setShowGap] = useState(false)
  const [showAway, setShowAway] = useState(false)
  const [showAddPupil, setShowAddPupil] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [selectedTime, setSelectedTime] = useState<string | undefined>(undefined)
  const [showSlotMenu, setShowSlotMenu] = useState(false)
  // Bounds (ms) of what's currently loaded into `lessons` for week view — lets
  // swiping to an already-cached neighbouring week skip the network entirely.
  const [weekRange, setWeekRange] = useState<{ from: number; to: number } | null>(null)

  useEffect(() => {
    if (viewMode === 'week') {
      fetchWeekWindow(currentDate, false)
    } else {
      setWeekRange(null)
      fetchDayOrMonth()
    }
  }, [currentDate, viewMode])

  // Explicit refresh — refresh button, and after adding/editing a lesson. Always
  // hits the network for the currently-relevant range regardless of what's cached.
  async function fetchLessons() {
    if (viewMode === 'week') await fetchWeekWindow(currentDate, true)
    else await fetchDayOrMonth()
  }

  function mergeWeekLessons(rows: Lesson[], fromMs: number, toMs: number) {
    setLessons((prev) => {
      const outside = prev.filter((l) => {
        const s = new Date(l.start_time).getTime()
        return s < fromMs || s >= toMs
      })
      return [...outside, ...rows]
    })
    setWeekRange((prev) => ({
      from: prev ? Math.min(prev.from, fromMs) : fromMs,
      to: prev ? Math.max(prev.to, toMs) : toMs,
    }))
  }

  // Keeps the previous, current, and next week loaded at all times. Swiping
  // within that window is instant (no fetch); swiping further only fetches
  // the newly-revealed week and merges it in — no full-page reload/flash.
  async function fetchWeekWindow(target: Date, force: boolean) {
    const base = startOfWeek(target, { weekStartsOn: 1 })
    const from = addDays(base, -7)
    const to = addDays(base, 14)
    const fromMs = from.getTime()
    const toMs = to.getTime()

    const covered = !!weekRange && fromMs >= weekRange.from && toMs <= weekRange.to
    if (covered && !force) return

    const fromIso = from.toISOString()
    const toIso = to.toISOString()
    const cacheKey = lessonsCacheKey(fromIso, toIso)
    const isFirstLoad = !weekRange
    if (isFirstLoad) setLoading(true)

    if (!isOnline()) {
      const cached = cacheGet<any[]>(cacheKey)
      if (cached?.data) mergeWeekLessons(cached.data.filter((l: any) => l.lesson_type !== 'student_away'), fromMs, toMs)
      setLoading(false)
      return
    }

    try {
      await autoCompletePastLessons()
    } catch {
      /* best-effort; edge function also runs on a schedule */
    }

    const { data, error } = await supabase
      .from('lessons')
      .select('*, pupil:pupils(id, first_name, last_name)')
      .gte('start_time', fromIso)
      .lt('start_time', toIso)
      .order('start_time')

    if (error) {
      console.error(error)
      const cached = cacheGet<any[]>(cacheKey)
      if (cached?.data) mergeWeekLessons(cached.data.filter((l: any) => l.lesson_type !== 'student_away'), fromMs, toMs)
    } else {
      const rows = (data || []).filter((l: any) => l.lesson_type !== 'student_away')
      cacheSet(cacheKey, data || [])
      try {
        const recent = cacheGet<any[]>('lessons:recent')
        const merged = [...(recent?.data || []).filter((l: any) => {
          const s = new Date(l.start_time).getTime()
          return s < fromMs || s >= toMs
        }), ...(data || [])]
        cacheSet('lessons:recent', merged.slice(-400))
      } catch {}
      mergeWeekLessons(rows, fromMs, toMs)
    }
    setLoading(false)
  }

  async function fetchDayOrMonth() {
    setLoading(true)
    let from: Date
    let to: Date

    if (viewMode === 'day') {
      from = new Date(currentDate)
      from.setHours(0, 0, 0, 0)
      to = addDays(from, 1)
    } else {
      const monthStart = startOfMonth(currentDate)
      from = startOfWeek(monthStart, { weekStartsOn: 1 })
      const monthEnd = endOfMonth(currentDate)
      to = addDays(endOfWeek(monthEnd, { weekStartsOn: 1 }), 1)
    }

    const fromIso = from.toISOString()
    const toIso = to.toISOString()
    const cacheKey = lessonsCacheKey(fromIso, toIso)

    // Offline: show last saved diary for this range
    if (!isOnline()) {
      const cached = cacheGet<any[]>(cacheKey)
      if (cached?.data) {
        setLessons(cached.data.filter((l: any) => l.lesson_type !== 'student_away'))
      }
      setLoading(false)
      return
    }

    // Mark past booked lessons as delivered (completed) before loading the view
    try {
      await autoCompletePastLessons()
    } catch {
      /* best-effort; edge function also runs on a schedule */
    }

    const { data, error } = await supabase
      .from('lessons')
      .select('*, pupil:pupils(id, first_name, last_name)')
      .gte('start_time', fromIso)
      .lt('start_time', toIso)
      .order('start_time')

    if (error) {
      console.error(error)
      const cached = cacheGet<any[]>(cacheKey)
      if (cached?.data) {
        setLessons(cached.data.filter((l: any) => l.lesson_type !== 'student_away'))
      }
    } else {
      const rows = data || []
      cacheSet(cacheKey, rows)
      // also keep a rolling "recent lessons" blob for broader offline coverage
      try {
        const recent = cacheGet<any[]>('lessons:recent')
        const merged = [...(recent?.data || []).filter((l: any) => {
          const s = new Date(l.start_time).getTime()
          return s < new Date(fromIso).getTime() || s >= new Date(toIso).getTime()
        }), ...rows]
        cacheSet('lessons:recent', merged.slice(-400))
      } catch {}
      setLessons(rows.filter((l: any) => l.lesson_type !== 'student_away'))
    }
    setLoading(false)
  }

  function goPrevious() {
    if (viewMode === 'day') setCurrentDate(addDays(currentDate, -1))
    else if (viewMode === 'week') setCurrentDate(addDays(currentDate, -7))
    else setCurrentDate(addMonths(currentDate, -1))
  }

  function goNext() {
    if (viewMode === 'day') setCurrentDate(addDays(currentDate, 1))
    else if (viewMode === 'week') setCurrentDate(addDays(currentDate, 7))
    else setCurrentDate(addMonths(currentDate, 1))
  }

  function goToday() {
    setCurrentDate(new Date())
  }

  function getHeaderTitle() {
    return format(currentDate, 'MMMM')
  }

  function handleAddSelect(type: string) {
    if (type === 'lesson') setShowAddLesson(true)
    else if (type === 'gap') setShowGap(true)
    else if (type === 'away') setShowAway(true)
    else if (type === 'pupil') setShowAddPupil(true)
    else if (type === 'income' || type === 'expense') window.location.href = '/instructor/money'
    else alert(`${type.charAt(0).toUpperCase() + type.slice(1)} – coming soon`)
  }

  function openSlotMenu(date: Date, time?: string) {
    setSelectedDate(date)
    setSelectedTime(time)
    setShowSlotMenu(true)
  }

  function openAddLesson(date?: Date, time?: string) {
    setSelectedDate(date)
    setSelectedTime(time)
    setShowAddLesson(true)
  }

  function LessonCard({ lesson }: { lesson: Lesson }) {
    const pupil = lesson.pupil as any
    return (
      <button
        onClick={() => {
          if (lesson.pupil_id) navigate(`/instructor/pupils/${lesson.pupil_id}`)
          else if (lesson.title === 'Away' || lesson.title === 'Appointment') setEditAway(lesson)
          else setEditLesson(lesson)
        }}
        className="w-full text-left px-3 py-2.5 flex items-start gap-3 hover:bg-slate-50"
      >
        <div className="text-sm font-medium text-slate-500 w-14 shrink-0 pt-0.5">
          {formatTime(lesson.start_time)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-900 truncate text-sm">
            {shortName(pupil, lesson.title || 'Private')}
          </div>
          {lesson.title === 'Appointment' && lesson.notes && (
            <div className="text-xs text-slate-600 mt-0.5 whitespace-pre-wrap">
              {lesson.notes}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 mt-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
              {lesson.lesson_type.replace('_', ' ')}
            </span>
            <span className={cn(
              'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize',
              lesson.payment_status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-rose-100 text-rose-800'
            )}>
              {lesson.payment_status}
            </span>
          </div>
        </div>
      </button>
    )
  }

  function DayView() {
    const dayLessons = lessons.filter(l => isSameDay(new Date(l.start_time), currentDate))
    return (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {dayLessons.length === 0 ? (
          <div className="px-4 py-12 text-sm text-slate-400 text-center">No lessons on this day</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {dayLessons.map(lesson => <LessonCard key={lesson.id} lesson={lesson} />)}
          </div>
        )}
      </div>
    )
  }

  function WeekView() {
    // Show 3 weeks for snap-scroll: previous, current, next
    const base = startOfWeek(currentDate, { weekStartsOn: 1 })
    const weekOffsets = [-7, 0, 7]
    const weeks = weekOffsets.map((off) =>
      Array.from({ length: 7 }, (_, i) => addDays(base, off + i))
    )

    function getLessonStyle(lesson: Lesson, day: Date) {
      const dayStart = new Date(day)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(day)
      dayEnd.setHours(23, 59, 59, 999)
      const start = new Date(lesson.start_time)
      const end = new Date(lesson.end_time)
      // Clip to this day's boundaries — a multi-day booking gets a separate
      // block per day it touches, each sized to that day only, rather than
      // one giant block anchored to the start day.
      const segStart = start < dayStart ? dayStart : start
      const segEnd = end > dayEnd ? dayEnd : end
      // Also clip to the visible hour grid itself (HOURS[0]..HOURS[last]+1) —
      // an all-day block (00:00–23:59) would otherwise compute a top/height
      // based on the full 24h day even though the rendered grid only covers
      // a subset of hours, making the block start above and run past the
      // bottom of the visible column indefinitely.
      const gridStart = new Date(day); gridStart.setHours(HOURS[0] || 0, 0, 0, 0)
      const gridEnd = new Date(day); gridEnd.setHours((HOURS[HOURS.length - 1] || 23) + 1, 0, 0, 0)
      const clippedStart = segStart < gridStart ? gridStart : segStart
      const clippedEnd = segEnd > gridEnd ? gridEnd : segEnd
      const startMinutes = clippedStart.getHours() * 60 + clippedStart.getMinutes()
      const duration = Math.max(differenceInMinutes(clippedEnd, clippedStart), 0)
      const top = ((startMinutes - (HOURS[0] || 0) * 60) / 60) * HOUR_HEIGHT
      // Min height so name + start time stay readable on short blocks
      const height = Math.max((duration / 60) * HOUR_HEIGHT, 48)
      return { top, height }
    }

    function isAllDayBlock(lesson: Lesson) {
      const start = new Date(lesson.start_time)
      const end = new Date(lesson.end_time)
      return start.getHours() === 0 && start.getMinutes() === 0 && differenceInMinutes(end, start) >= 23 * 60 + 30
    }

    function getBlockStyle(lesson: Lesson): Record<string, string> {
      let stored: any = {}
      try { stored = JSON.parse(localStorage.getItem('dmw_diary_colours') || '{}') } catch {}
      const key = (lesson.title === 'Away' || lesson.title === 'Appointment') ? 'private' : (lesson.lesson_type || 'lesson')
      const pair = stored[key] || null
      // Don't put line-through on the whole block — it makes names unreadable
      if (lesson.status === 'cancelled') return { backgroundColor: '#dc2626', color: '#fff', opacity: '0.95' }
      if (lesson.lesson_type === 'gap') return { backgroundColor: pair?.booked || '#3b82f6', color: '#fff' }
      if (lesson.title === 'Away') return { backgroundColor: pair?.booked || '#475569', color: '#fff' }
      if (lesson.title === 'Appointment') return { backgroundColor: '#7c3aed', color: '#fff' }
      const isDelivered = lesson.status === 'delivered'
      const defaults: Record<string, { booked: string; delivered: string }> = {
        lesson: { booked: '#fb923c', delivered: '#22c55e' },
        driving_test: { booked: '#000000', delivered: '#000000' },
        mock_test: { booked: '#fbbf24', delivered: '#22c55e' },
        private: { booked: '#475569', delivered: '#475569' },
      }
      const fb = defaults[key] || { booked: '#fb923c', delivered: '#22c55e' }
      const bg = isDelivered ? (pair?.delivered || fb.delivered) : (pair?.booked || fb.booked)
      return { backgroundColor: bg, color: '#fff' }
    }

    function paymentFooter(lesson: Lesson) {
      if (lesson.status === 'cancelled') {
        return (
          <div className="absolute left-0 right-0 bottom-0 text-center text-[9px] font-semibold leading-[14px] bg-white/25 text-white">
            Cancelled
          </div>
        )
      }
      if (lesson.lesson_type === 'gap' || lesson.title === 'Away' || lesson.title === 'Appointment' || lesson.lesson_type === 'private') return null
      let stored: any = {}
      try { stored = JSON.parse(localStorage.getItem('dmw_diary_colours') || '{}') } catch {}
      const paidColour = stored.payment?.paid || '#22c55e'
      const unpaidColour = stored.payment?.unpaid || '#ec4899'
      const isPaid = lesson.payment_status === 'paid'
      return (
        <div
          className="absolute left-0 right-0 bottom-0 text-center text-[9px] font-semibold leading-[14px] text-white"
          style={{ backgroundColor: isPaid ? paidColour : unpaidColour }}
        >
          {isPaid ? 'Paid' : 'Unpaid'}
        </div>
      )
    }

    function handleGridClick(day: Date, e: { currentTarget: HTMLDivElement; clientY: number }) {
      const dayRect = e.currentTarget.getBoundingClientRect()
      const relY = e.clientY - dayRect.top
      const hourFloat = relY / HOUR_HEIGHT
      let hour = Math.floor(hourFloat) + (HOURS[0] || 0)
      let mins = Math.round((hourFloat - Math.floor(hourFloat)) * 60 / 15) * 15
      if (mins === 60) { hour += 1; mins = 0 }
      hour = Math.max(0, Math.min(23, hour))
      const time = `${hour.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
      openSlotMenu(day, time)
    }

    function renderWeek(weekDays: Date[], key: string) {
      return (
        <div
          key={key}
          className="w-full shrink-0 snap-center flex flex-col"
          style={{ minWidth: '100%', height: '100%' }}
        >
          {/* Date bar fixed outside vertical scroll */}
          <div className="grid grid-cols-[42px_repeat(7,minmax(0,1fr))] border-b border-slate-300 bg-white shrink-0 z-20">
            <div className="border-r border-slate-100 bg-white" />
            {weekDays.map((day) => (
              <div key={day.toISOString()} className={'py-1.5 text-center border-r border-slate-100 last:border-r-0 bg-white' + (isSameDay(day, new Date()) ? ' bg-blue-50' : '')}>
                <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">{format(day, 'EEE')}</div>
                <div className={'text-sm font-semibold mt-0.5 w-6 h-6 mx-auto flex items-center justify-center rounded-full ' + (isSameDay(day, new Date()) ? 'bg-blue-900 text-white' : 'text-slate-800')}>
                  {format(day, 'd')}
                </div>
              </div>
            ))}
          </div>
          {/* Only the time grid scrolls vertically */}
          <div
            className="flex-1 overflow-y-auto min-h-0 week-grid-scroll"
            ref={(el) => {
              if (el && !(el as any)._inited) {
                el.scrollTop = DEFAULT_SCROLL_HOUR * HOUR_HEIGHT
                ;(el as any)._inited = true
              }
            }}
            onScroll={(e) => {
              const top = e.currentTarget.scrollTop
              document.querySelectorAll<HTMLElement>('.week-grid-scroll').forEach((other) => {
                if (other !== e.currentTarget && other.scrollTop !== top) other.scrollTop = top
              })
            }}
          >
            <div className="grid grid-cols-[42px_repeat(7,minmax(0,1fr))] relative" style={{ height: HOURS.length * HOUR_HEIGHT }}>
              <div className="relative border-r border-slate-200 bg-white">
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="absolute left-0 right-0 border-b border-slate-200"
                    style={{ top: (hour - (HOURS[0] || 0)) * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                  >
                    <div className="absolute left-0 right-0 border-b border-slate-100" style={{ top: HOUR_HEIGHT / 2 }} />
                    <span
                      className="absolute right-1 -top-2.5 text-[11px] font-normal text-slate-500 tabular-nums leading-none"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {`${hour.toString().padStart(2, '0')}:00`}
                    </span>
                  </div>
                ))}
              </div>
              {weekDays.map((day) => {
                const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0)
                const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999)
                const dayLessons = lessons.filter((l) => {
                  const s = new Date(l.start_time)
                  const e = new Date(l.end_time)
                  return s <= dayEnd && e >= dayStart
                })
                return (
                  <div
                    key={day.toISOString()}
                    onClick={(e) => handleGridClick(day, e)}
                    className={'relative border-r border-slate-200 last:border-r-0 cursor-pointer ' + (isSameDay(day, new Date()) ? 'bg-blue-50/30' : '')}
                    style={{ height: HOURS.length * HOUR_HEIGHT, containerType: 'inline-size' } as any}
                  >
                    {HOURS.map((hour) => (
                      <div key={hour} className="absolute left-0 right-0" style={{ top: (hour - (HOURS[0] || 0)) * HOUR_HEIGHT, height: HOUR_HEIGHT }}>
                        <div className="absolute left-0 right-0 bottom-0 border-b border-slate-300" />
                        <div className="absolute left-0 right-0 border-b border-slate-200 border-dashed" style={{ top: HOUR_HEIGHT / 2 }} />
                      </div>
                    ))}
                    {isSameDay(day, new Date(nowTick)) && (() => {
                      const now = new Date(nowTick)
                      const mins = now.getHours() * 60 + now.getMinutes()
                      const top = (mins / 60) * HOUR_HEIGHT
                      const col = getNowLineColour()
                      return (
                        <div className="absolute left-0 right-0 z-[5] pointer-events-none" style={{ top }}>
                          <div className="flex items-center">
                            <div className="w-2.5 h-2.5 rounded-full -ml-1 shrink-0" style={{ backgroundColor: col }} />
                            <div className="flex-1 h-[2px]" style={{ backgroundColor: col }} />
                          </div>
                        </div>
                      )
                    })()}
                    {dayLessons.map((lesson) => {
                      const { top, height } = getLessonStyle(lesson, day)
                      const pupil = lesson.pupil as any
                      const name = shortName(pupil, lesson.title || 'Private', true)
                      const fullName = pupil?.first_name
                        ? `${pupil.first_name} ${pupil.last_name || ''}`.trim()
                        : name
                      const isCancelled = lesson.status === 'cancelled'
                      const hasFooter =
                        isCancelled ||
                        !(lesson.lesson_type === 'gap' || lesson.title === 'Away' || lesson.title === 'Appointment' || lesson.lesson_type === 'private')
                      // Appointment notes should sit in the middle of the box, not pinned to
                      // the top — center the whole name+notes group for any Appointment,
                      // not just ones that happen to span the full day.
                      const isCenteredAppointment = lesson.title === 'Appointment'
                      return (
                        <div
                          key={lesson.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (lesson.pupil_id) {
                              navigate(`/instructor/pupils/${lesson.pupil_id}`)
                            } else if (lesson.title === 'Away' || lesson.title === 'Appointment') {
                              setEditAway(lesson)
                            } else {
                              setEditLesson(lesson)
                            }
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            if (lesson.title === 'Away' || lesson.title === 'Appointment') {
                              setEditAway(lesson)
                            } else {
                              setEditLesson(lesson)
                            }
                          }}
                          className="absolute z-[1] cursor-pointer overflow-hidden"
                          style={{
                            top,
                            height,
                            left: 1,
                            right: 1,
                            borderRadius: 4,
                            boxSizing: 'border-box',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: isCenteredAppointment ? 'center' : 'flex-start',
                            padding: '2px 3px 0',
                            paddingBottom: hasFooter ? 15 : 2,
                            ...getBlockStyle(lesson),
                          }}
                        >
                          {/* Name: the dominant element — scales with the day column's own width
                              (container query units) so it stays readable without ever
                              overpowering the box, on phones and wider screens alike. */}
                          <div style={{ flex: '1 1 auto', minHeight: 0, overflow: isCenteredAppointment ? 'visible' : 'hidden', textAlign: isCenteredAppointment ? 'center' : 'left' }}>
                            <div
                              className="text-white font-semibold"
                              style={{
                                fontSize: 'clamp(10px, 26cqw, 16px)',
                                lineHeight: 1.15,
                                overflow: 'hidden',
                                display: '-webkit-box',
                                WebkitBoxOrient: 'vertical',
                                WebkitLineClamp: 3,
                                overflowWrap: 'break-word',
                                wordBreak: 'normal',
                                textDecoration: isCancelled ? 'line-through' : undefined,
                              }}
                              title={fullName}
                            >
                              {name}
                            </div>
                            {lesson.title === 'Appointment' && lesson.notes && (
                              <div
                                className="text-white/90 mt-0.5"
                                style={{
                                  fontSize: 'clamp(8px, 16cqw, 11px)',
                                  lineHeight: 1.2,
                                  overflowWrap: 'break-word',
                                  wordBreak: 'break-word',
                                  whiteSpace: 'pre-wrap',
                                }}
                              >
                                {lesson.notes}
                              </div>
                            )}
                          </div>
                          {/* Time: secondary — small, muted, one line */}
                          <div
                            className="text-white/80 font-medium tabular-nums shrink-0"
                            style={{ fontSize: 'clamp(8px, 15cqw, 11px)', lineHeight: 1.3, marginTop: 1 }}
                          >
                            {formatTime(lesson.start_time)}–{formatTime(lesson.end_time)}
                          </div>
                          {paymentFooter(lesson)}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )
    }

    return (
      <div
        className="bg-white overflow-hidden flex flex-col"
        style={{ height: 'calc(100dvh - 8.75rem)' }}
      >
        <div
          className="overflow-x-auto overflow-y-hidden flex-1 snap-x snap-mandatory flex min-h-0 h-full"
          onScroll={(e) => {
            const el = e.currentTarget as HTMLDivElement & { _lock?: boolean }
            if (el._lock) return
            const w = el.clientWidth
            if (!w) return
            const idx = Math.round(el.scrollLeft / w)
            if (idx === 0 && el.scrollLeft < w * 0.15) {
              el._lock = true
              setCurrentDate((d) => addDays(d, -7))
              el.scrollLeft = w
              requestAnimationFrame(() => { el._lock = false })
            } else if (idx === 2 && el.scrollLeft > w * 1.85) {
              el._lock = true
              setCurrentDate((d) => addDays(d, 7))
              el.scrollLeft = w
              requestAnimationFrame(() => { el._lock = false })
            }
          }}
          ref={(el) => {
            if (el && !(el as any)._inited) {
              el.scrollLeft = el.clientWidth
              ;(el as any)._inited = true
            }
          }}
        >
          {weeks.map((wd, i) => renderWeek(wd, `w-${i}`))}
        </div>
      </div>
    )
  }

  function MonthView() {
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

    return (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-slate-500">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map(day => {
            const dayLessons = lessons.filter(l => isSameDay(new Date(l.start_time), day))
            const isCurrentMonth = isSameMonth(day, currentDate)
            const isToday = isSameDay(day, new Date())
            return (
              <button
                key={day.toISOString()}
                onClick={() => openAddLesson(day)}
                className={cn('min-h-[72px] p-1.5 border-b border-r border-slate-100 text-left hover:bg-slate-50', !isCurrentMonth && 'bg-slate-50/50')}
              >
                <div className={cn('text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1', isToday ? 'bg-blue-900 text-white' : isCurrentMonth ? 'text-slate-800' : 'text-slate-400')}>
                  {format(day, 'd')}
                </div>
                <div className="space-y-0.5">
                  {dayLessons.slice(0, 2).map(lesson => {
                    const pupil = lesson.pupil as any
                    return (
                      <div key={lesson.id} className={cn(
                        'text-[10px] leading-tight px-1 py-0.5 rounded truncate font-medium',
                        lesson.status === 'cancelled' ? 'bg-red-600 text-white line-through' :
                        lesson.payment_status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-rose-100 text-rose-800'
                      )}>
                        {shortName(pupil, lesson.title || 'Private')}
                      </div>
                    )
                  })}
                  {dayLessons.length > 2 && <div className="text-[10px] text-slate-400 px-1">+{dayLessons.length - 2} more</div>}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className={viewMode === 'week' ? 'flex flex-col' : 'pb-6'}>
      <div className="bg-blue-900 text-white px-2.5 pt-1.5 pb-1.5 flex items-center justify-between gap-1.5 shrink-0 sticky top-0 z-30">
        {viewMode === 'month' ? (
          <button type="button" onClick={() => setShowCal(true)} className="text-xl font-bold">
            {getHeaderTitle()}
          </button>
        ) : (
          <h1 className="text-base font-bold leading-tight">{getHeaderTitle()}</h1>
        )}
        <div className="flex items-center gap-2">
          <button type="button" onClick={goToday} className="text-sm font-medium text-blue-100 px-2">
            Now
          </button>
          {viewMode !== 'week' && (
            <button type="button" onClick={() => { setViewMode('week'); localStorage.setItem('dmw_diary_view', 'week') }} className="text-sm font-medium text-blue-100 px-2">
              Week
            </button>
          )}
          <button type="button" onClick={() => setShowCal(true)} className="p-2 rounded-lg hover:bg-blue-800" title="Pick date">
            <Calendar size={20} />
          </button>
          <button type="button" onClick={() => fetchLessons()} className="p-2 rounded-lg hover:bg-blue-800" title="Refresh">
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {showCal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCal(false)}>
          <div className="bg-white rounded-2xl p-4 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold mb-3">Go to date</h2>
            <input
              type="date"
              className="w-full px-4 py-3 rounded-xl border border-slate-300 mb-3"
              value={format(currentDate, 'yyyy-MM-dd')}
              onChange={(e) => {
                if (e.target.value) {
                  setCurrentDate(new Date(e.target.value + 'T12:00:00'))
                  setShowCal(false)
                }
              }}
            />
            <button onClick={() => setShowCal(false)} className="w-full py-2 text-slate-500 text-sm">Close</button>
          </div>
        </div>
      )}

      {(viewMode === 'day' || viewMode === 'month') && (
        <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-slate-100">
          <button onClick={goPrevious} className="p-2 rounded-lg hover:bg-slate-100"><ChevronLeft size={20} /></button>
          <span className="text-sm font-medium text-slate-700">
            {viewMode === 'day' ? format(currentDate, 'EEE d MMM yyyy') : format(currentDate, 'MMMM yyyy')}
          </span>
          <button onClick={goNext} className="p-2 rounded-lg hover:bg-slate-100"><ChevronRight size={20} /></button>
        </div>
      )}
      {loading ? (
        <div className="text-center py-16 text-slate-400">Loading…</div>
      ) : viewMode === 'week' ? (
        <WeekView />
      ) : (
        <div className="px-3 pt-3">
          {viewMode === 'day' && <DayView />}
          {viewMode === 'month' && <MonthView />}
        </div>
      )}

      {showSlotMenu && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setShowSlotMenu(false)}>
          <div className="bg-white rounded-t-2xl w-full p-4 space-y-2 safe-bottom" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-lg mb-2">
              {selectedDate ? format(selectedDate, 'EEE d MMM') : ''} {selectedTime || ''}
            </h2>
            <button
              onClick={() => { setShowSlotMenu(false); setShowAddLesson(true) }}
              className="w-full py-3 rounded-xl border border-slate-200 font-medium text-left px-4"
            >
              Add lesson
            </button>
            <button
              onClick={() => { setShowSlotMenu(false); setShowGap(true) }}
              className="w-full py-3 rounded-xl border border-slate-200 font-medium text-left px-4"
            >
              Create gap
            </button>
            <button
              onClick={() => { setShowSlotMenu(false); setShowAway(true) }}
              className="w-full py-3 rounded-xl border border-slate-200 font-medium text-left px-4"
            >
              Create away
            </button>
            <button onClick={() => setShowSlotMenu(false)} className="w-full py-3 text-slate-500 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}
      <AddNewMenu
        open={showAddMenu}
        onClose={() => setShowAddMenu(false)}
        onSelect={handleAddSelect}
      />

      <EditLessonModal
        open={!!editLesson}
        lesson={editLesson}
        onClose={() => setEditLesson(null)}
        onSaved={fetchLessons}
      />
      <GapModal open={showGap} initialDate={selectedDate || currentDate} onClose={() => setShowGap(false)} onSaved={fetchLessons} />
      <AwayModal open={showAway} initialDate={selectedDate || currentDate} onClose={() => setShowAway(false)} onSaved={fetchLessons} />
      <AwayModal
        open={!!editAway}
        editing={editAway as any}
        onClose={() => setEditAway(null)}
        onSaved={fetchLessons}
      />
      <AddPupilModal open={showAddPupil} onClose={() => setShowAddPupil(false)} onSaved={() => {}} />
      <AddLessonModal
        open={showAddLesson}
        onClose={() => setShowAddLesson(false)}
        initialDate={selectedDate}
        initialTime={selectedTime}
        onSaved={() => fetchLessons()}
      />
    </div>
  )
}
