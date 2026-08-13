import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { triggerMessagePush } from '../lib/pushNotifications'
import { fetchQuietHours, isQuietNow, nextWindowOpen, type QuietHoursSettings } from '../lib/quietHours'
import { cacheGet, cacheSet, isOnline } from '../lib/offlineCache'
import { useAuth } from '../contexts/AuthContext'
import type { Lesson, Pupil } from '../types/database'
import { formatDate, formatTime, cn } from '../lib/utils'
import {
  BookOpen,
  Video,
  ClipboardList,
  MessageCircle,
  User,
  ExternalLink,
  CalendarOff,
  Clock,
  Settings,
  Wallet,
  Paperclip,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { getLinkedPupil, touchLastViewed } from '../lib/pupilSession'
import PupilTerms from './pupil/PupilTerms'
import { format, differenceInHours, differenceInDays } from 'date-fns'
import { runLessonReminders, cacheNextLesson, getCachedNextLesson, setupNotifications } from '../lib/reminders'
import NotificationSetup from '../components/NotificationSetup'
import { createCancellationReviewIfNeeded } from '../lib/cancellationReviews'
import { useTripRealtime } from '../hooks/useTripRealtime'
import { formatFrozenEta } from '../lib/instructorTracking'
import TripTrackerMap from '../components/TripTrackerMap'
import DateRangeList from '../components/DateRangeList'
import { groupConsecutiveDayRanges, formatRangeLabel } from '../lib/dateRanges'

export default function PupilHome() {
  const { profile, signOut } = useAuth()
  const [pupil, setPupil] = useState<Pupil | null>(null)
  // Live "instructor on the way" trip (Realtime)
  // pupil id is set after load; hook re-runs when pupilId changes
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [holidays, setHolidays] = useState<Lesson[]>([])
  const [instructorAway, setInstructorAway] = useState<
    { id: string; start_time: string; end_time: string; title: string | null }[]
  >([])
  const [gaps, setGaps] = useState<Lesson[]>([])
  const [unread, setUnread] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelLesson, setCancelLesson] = useState<Lesson | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [quickMsg, setQuickMsg] = useState('')
  const [quickFile, setQuickFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [quietHours, setQuietHours] = useState<QuietHoursSettings | null>(null)
  const [blockingMsgs, setBlockingMsgs] = useState<any[]>([])
  const [feedMsgs, setFeedMsgs] = useState<any[]>([])
  const [installHint, setInstallHint] = useState(false)
  const [bookGap, setBookGap] = useState<Lesson | null>(null)
  const [booking, setBooking] = useState(false)
  const [showHolidayForm, setShowHolidayForm] = useState(false)
  const [editingHoliday, setEditingHoliday] = useState<Lesson | null>(null)
  const [holStart, setHolStart] = useState('')
  const [holEnd, setHolEnd] = useState('')
  const [savingHoliday, setSavingHoliday] = useState(false)

  const { trip: liveTrip, isLive: instructorEnRoute, loading: tripLoading } = useTripRealtime({
    pupilId: pupil?.id || null,
    enabled: !!pupil?.id,
  })

  useEffect(() => {
    load()
    // PWA install hint
    const dismissed = localStorage.getItem('dmw_install_dismissed')
    if (!dismissed && !window.matchMedia('(display-mode: standalone)').matches) {
      setInstallHint(true)
    }
  }, [profile])

  async function load() {
    if (!profile) {
      setLoading(false)
      return
    }
    setLoading(true)
    const p = await getLinkedPupil(profile)
    setPupil(p)
    fetchQuietHours().then(setQuietHours)
    if (p) {
      // Instructor-triggered remote logout
      const flo = (p as any).force_logout_at
      if (flo) {
        const seen = localStorage.getItem('dmw_force_logout_seen')
        if (seen !== flo) {
          localStorage.setItem('dmw_force_logout_seen', flo)
          await signOut()
          alert('You have been signed out by your instructor. Please log in again.')
          return
        }
      }

      const cacheKey = `pupil_home:${p.id}`

      // Offline: show last saved next lessons / holidays / gaps
      if (!isOnline()) {
        const cached = cacheGet<{
          lessons?: any[]
          holidays?: any[]
          gaps?: any[]
          messages?: any[]
        }>(cacheKey)
        if (cached?.data) {
          setLessons(cached.data.lessons || [])
          setHolidays(cached.data.holidays || [])
          setGaps(cached.data.gaps || [])
          if (cached.data.lessons?.[0]) cacheNextLesson(cached.data.lessons[0])
          else {
            const fallback = getCachedNextLesson()
            if (fallback) setLessons([fallback as any])
          }
        } else {
          const fallback = getCachedNextLesson()
          if (fallback) setLessons([fallback as any])
        }
        setLoading(false)
        return
      }

      await touchLastViewed(p.id)
      runLessonReminders({ pupilId: p.id }).catch(() => {})
      const now = new Date().toISOString()

      let lessonData: any[] = []
      let holData: any[] = []
      let gapData: any[] = []

      if (p.status === 'active' || p.status === 'passed') {
        const lessonRes = await supabase
          .from('lessons')
          .select('*')
          .eq('pupil_id', p.id)
          .neq('lesson_type', 'student_away')
          .gte('start_time', now)
          .neq('status', 'cancelled')
          .order('start_time')
          .limit(20)
        lessonData = lessonRes.data || []
        setLessons(lessonData)
        cacheNextLesson(lessonData[0] || null)

        const holRes = await supabase
          .from('lessons')
          .select('*')
          .eq('pupil_id', p.id)
          .eq('lesson_type', 'student_away')
          .gte('end_time', now)
          .order('start_time')
        holData = holRes.data || []
        setHolidays(holData)

        // Instructor Away blocks (title Away, no pupil) — visible to students.
        // Goes through an RPC (not a direct table select) so notes can never
        // reach the pupil's device, the same guarantee Appointments already
        // have below.
        const awayRes = await supabase.rpc('pupil_visible_away')
        const awayRows = (awayRes.data || []).filter((a: any) => new Date(a.end_time) >= new Date(now)).slice(0, 10)

        // Instructor Appointments the pupil is allowed to see — date/time
        // only, notes are never included (this function can't return them).
        // Any with visibility off are already excluded server-side.
        const apptRes = await supabase.rpc('pupil_visible_appointments')
        const apptRows = (apptRes.data || [])
          .filter((a: any) => new Date(a.end_time) >= new Date(now))
          .slice(0, 10)

        setInstructorAway([...awayRows, ...apptRows])

        const gapRes = await supabase
          .from('lessons')
          .select('*')
          .eq('lesson_type', 'gap')
          .gte('start_time', now)
          .order('start_time')
          .limit(20)
        gapData = gapRes.data || []
        setGaps(gapData)
      }

      const { data: msgData } = await supabase
        .from('messages')
        .select('*')
        .eq('pupil_id', p.id)
        .order('created_at', { ascending: false })
        .limit(50)

      const all = msgData || []
      // Only block on instructor messages without read_at
      const unreadInstructor = all.filter(
        (m: any) => m.direction !== 'inbound' && !m.read_at
      )
      setBlockingMsgs(unreadInstructor)
      setUnread(unreadInstructor)
      setFeedMsgs([...all].reverse())

      cacheSet(cacheKey, {
        lessons: lessonData,
        holidays: holData,
        gaps: gapData,
        messages: all,
        savedAt: Date.now(),
      })
    }
    setLoading(false)
  }

  async function markMessagesRead() {
    if (!pupil || !blockingMsgs.length) return
    const ids = blockingMsgs.map((m) => m.id)
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .in('id', ids)
    setBlockingMsgs([])
    setUnread([])
  }

  async function confirmCancel() {
    if (!cancelLesson || !pupil) return
    setCancelling(true)
    const hours = differenceInHours(new Date(cancelLesson.start_time), new Date())
    const within48 = hours < 48
    const { error } = await supabase
      .from('lessons')
      .update({
        status: 'cancelled',
        notes: [cancelLesson.notes, within48 ? 'Cancelled by pupil (within 48h – charge may apply)' : 'Cancelled by pupil']
          .filter(Boolean)
          .join(' | '),
      })
      .eq('id', cancelLesson.id)
    if (error) alert(error.message)
    else {
      await supabase.from('messages').insert({
        pupil_id: pupil.id,
        body: `Pupil cancelled lesson on ${format(new Date(cancelLesson.start_time), 'EEE d MMM yyyy HH:mm')}.${within48 ? ' Within 48 hours – instructor will decide on any charge.' : ''}`,
        direction: 'inbound',
        subject: 'Lesson cancelled by pupil',
      })
      if (within48) {
        await createCancellationReviewIfNeeded({
          lesson: cancelLesson as any,
          pupilId: pupil.id,
        })
      }
      setCancelLesson(null)
      await load()
    }
    setCancelling(false)
  }

  async function sendQuick(e: React.FormEvent) {
    e.preventDefault()
    if (!pupil || (!quickMsg.trim() && !quickFile)) return
    const canMsg = pupil.status === 'active' || !!(pupil as any).messaging_enabled
    if (!canMsg) {
      alert('Messaging is not enabled yet. Your instructor will turn this on when you can message them.')
      return
    }

    // Re-fetch live rather than trust whatever loaded when the Home screen
    // first opened — this box previously had no quiet-hours check at all,
    // so a message sent here always went straight through and pushed to
    // the instructor immediately, even during quiet hours.
    const liveQuietHours = await fetchQuietHours()
    setQuietHours(liveQuietHours)

    if (isQuietNow(liveQuietHours)) {
      setSending(true)
      let attachment_path: string | null = null
      if (quickFile) {
        const path = `${pupil.id}/${Date.now()}-${quickFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
        const { error: upErr } = await supabase.storage
          .from('message-attachments')
          .upload(path, quickFile, { upsert: false, contentType: quickFile.type || 'image/jpeg' })
        if (upErr) {
          alert(upErr.message + '\n\nCreate a public Storage bucket named "message-attachments" in Supabase if missing.')
          setSending(false)
          return
        }
        attachment_path = path
      }
      const sendAt = nextWindowOpen(liveQuietHours)
      const { error } = await supabase.from('queued_pupil_messages').insert({
        pupil_id: pupil.id,
        body: quickMsg.trim(),
        attachment_path,
        attachment_name: quickFile?.name || null,
        send_at: sendAt.toISOString(),
      })
      if (error) alert(error.message)
      else {
        setQuickMsg('')
        setQuickFile(null)
        alert(
          `It's currently outside your instructor's messaging hours. Your message has been scheduled to send at ${sendAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.\n\n${liveQuietHours.emergencyNote}`
        )
      }
      setSending(false)
      return
    }

    setSending(true)
    let attachment_url: string | null = null
    if (quickFile) {
      const path = `${pupil.id}/${Date.now()}-${quickFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: upErr } = await supabase.storage
        .from('message-attachments')
        .upload(path, quickFile, { upsert: false, contentType: quickFile.type || 'image/jpeg' })
      if (upErr) {
        alert(upErr.message + '\n\nCreate a public Storage bucket named "message-attachments" in Supabase if missing.')
        setSending(false)
        return
      }
      attachment_url = supabase.storage.from('message-attachments').getPublicUrl(path).data.publicUrl
    }
    const payload: any = {
      pupil_id: pupil.id,
      body: quickMsg.trim() || (quickFile ? `(Photo: ${quickFile.name})` : ''),
      direction: 'inbound',
      subject: 'Message from pupil',
    }
    if (attachment_url) payload.attachment_url = attachment_url
    const { data: inserted, error } = await supabase.from('messages').insert(payload).select('id').maybeSingle()
    if (error) alert(error.message)
    else {
      setQuickMsg('')
      setQuickFile(null)
      triggerMessagePush(inserted?.id)
      alert('Message sent')
    }
    setSending(false)
  }

  async function confirmBookGap() {
    if (!pupil || !bookGap) return
    setBooking(true)
    // Convert gap into this pupil's lesson
    const { error } = await supabase
      .from('lessons')
      .update({
        pupil_id: pupil.id,
        lesson_type: 'lesson',
        status: 'booked',
        title: `${pupil.first_name} ${pupil.last_name?.charAt(0) || ''}`,
      })
      .eq('id', bookGap.id)
      .eq('lesson_type', 'gap')

    if (error) {
      alert(error.message || 'Could not book — slot may have been taken')
      setBooking(false)
      return
    }

    await supabase.from('messages').insert({
      pupil_id: pupil.id,
      body: `${pupil.first_name} ${pupil.last_name} booked the gap on ${format(new Date(bookGap.start_time), 'EEE d MMM yyyy')} at ${format(new Date(bookGap.start_time), 'HH:mm')}.`,
      direction: 'inbound',
      subject: 'Gap booked',
    })

    setBookGap(null)
    setBooking(false)
    await load()
  }


  async function saveHoliday() {
    if (!pupil || !holStart) return
    setSavingHoliday(true)
    const start = new Date(holStart + 'T00:00:00')
    const end = new Date((holEnd || holStart) + 'T23:59:59')
    if (end < start) {
      alert('End date must be on or after start date')
      setSavingHoliday(false)
      return
    }
    if (editingHoliday) {
      const { error } = await supabase
        .from('lessons')
        .update({ start_time: start.toISOString(), end_time: end.toISOString() })
        .eq('id', editingHoliday.id)
      if (error) {
        alert(error.message)
        setSavingHoliday(false)
        return
      }
      setEditingHoliday(null)
      setShowHolidayForm(false)
      setSavingHoliday(false)
      await load()
      return
    }
    // Do not set duration_minutes — it is a generated column in Supabase
    const { error } = await supabase.from('lessons').insert({
      pupil_id: pupil.id,
      lesson_type: 'student_away',
      status: 'booked',
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      title: `${pupil.first_name} holiday`,
      payment_status: 'unpaid',
    })
    if (error) {
      alert(error.message)
      setSavingHoliday(false)
      return
    }
    const range =
      holEnd && holEnd !== holStart
        ? `${format(start, 'EEE d MMM yyyy')} – ${format(end, 'EEE d MMM yyyy')}`
        : format(start, 'EEE d MMM yyyy')
    await supabase.from('messages').insert({
      pupil_id: pupil.id,
      direction: 'inbound',
      subject: 'Student holiday',
      body: `${pupil.first_name} ${pupil.last_name} added a holiday: ${range}.`,
    })
    setShowHolidayForm(false)
    setHolStart('')
    setHolEnd('')
    setSavingHoliday(false)
    await load()
  }

  async function deleteHoliday() {
    if (!editingHoliday) return
    if (!confirm('Remove this holiday?')) return
    setSavingHoliday(true)
    const { error } = await supabase.from('lessons').delete().eq('id', editingHoliday.id)
    if (error) {
      alert(error.message)
      setSavingHoliday(false)
      return
    }
    setEditingHoliday(null)
    setShowHolidayForm(false)
    setSavingHoliday(false)
    await load()
  }

  function openEditHoliday(h: Lesson) {
    setEditingHoliday(h)
    setHolStart(format(new Date(h.start_time), 'yyyy-MM-dd'))
    setHolEnd(format(new Date(h.end_time), 'yyyy-MM-dd'))
    setShowHolidayForm(true)
  }

  if (loading) {
    return <div className="p-4 text-center text-slate-400 py-20">Loading…</div>
  }

  if (pupil && !pupil.terms_accepted_at) {
    return (
      <PupilTerms
        pupilId={pupil.id}
        onAccepted={() => setPupil({ ...pupil, terms_accepted_at: new Date().toISOString() })}
      />
    )
  }

  // Declined enquiry — show message then sign out (GDPR delete handled by instructor flow)
  if (pupil && (pupil as any).status === 'declined') {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {pupil?.terms_accepted_at ? <NotificationSetup role="pupil" /> : null}
        <div className="bg-blue-900 text-white px-4 py-4">
          <h1 className="text-lg font-bold">Enquiry update</h1>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <p className="text-sm text-slate-800 whitespace-pre-wrap">
            {`Unfortunately we won't be able to help you at this time.

Due to GDPR your details will be deleted from our system. You're welcome to enquire again at a later date if your circumstances change.

Thank you for your interest in DMW Driving School.`}
          </p>
        </div>
        <div className="p-4 border-t border-slate-100">
          <button
            type="button"
            className="w-full py-3 rounded-xl bg-blue-900 text-white font-semibold"
            onClick={async () => {
              try {
                await supabase.from('pupils').delete().eq('id', pupil.id)
              } catch {}
              await signOut()
              window.location.href = '/login'
            }}
          >
            OK
          </button>
        </div>
      </div>
    )
  }

  // Inactive — declined enquiry (must read then self-delete) or general inactive lock
  if (pupil && pupil.status === 'inactive') {
    const notesStr = String((pupil as any).notes || '')
    const fromNotes = notesStr.includes('[ENQUIRY_DECLINED]')
    const declineMsg =
      (blockingMsgs || []).find(
        (m: any) =>
          m.direction !== 'inbound' &&
          (String(m.subject || '').toLowerCase().includes('enquiry declined') ||
            String(m.body || '').includes("won't be able to help you at this time"))
      ) ||
      (unread || []).find(
        (m: any) =>
          m.direction !== 'inbound' &&
          (String(m.subject || '').toLowerCase().includes('enquiry declined') ||
            String(m.body || '').includes("won't be able to help you at this time"))
      )

    const fromDeleted = notesStr.includes('[ACCOUNT_DELETED]')
    const deletedMsg =
      (blockingMsgs || []).find(
        (m: any) =>
          m.direction !== 'inbound' &&
          String(m.subject || '').toLowerCase().includes('account has been removed')
      ) ||
      (unread || []).find(
        (m: any) =>
          m.direction !== 'inbound' &&
          String(m.subject || '').toLowerCase().includes('account has been removed')
      )

    if (declineMsg || fromNotes || fromDeleted || deletedMsg) {
      const isDeleted = !!(fromDeleted || deletedMsg)
      const bodyText =
        deletedMsg?.body ||
        declineMsg?.body ||
        notesStr.replace(/^\[(ENQUIRY_DECLINED|ACCOUNT_DELETED)\]\s*/i, '').trim() ||
        (isDeleted
          ? `Your record with DMW Driving School has been removed by your instructor.\n\nIf you believe this is a mistake, please contact DMW Driving School as soon as possible.`
          : `Unfortunately we won't be able to help you at this time.

Due to GDPR your details will be deleted from our system. You're welcome to enquire again at a later date if your circumstances change.

Thank you for your interest in DMW Driving School.`)
      return (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <div className="bg-blue-900 text-white px-4 py-4">
            <h1 className="text-lg font-bold">{isDeleted ? 'Account removed' : 'Enquiry update'}</h1>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <p className="text-sm text-slate-800 whitespace-pre-wrap">{bodyText}</p>
          </div>
          <div className="p-4 border-t border-slate-100">
            <button
              type="button"
              className="w-full py-3 rounded-xl bg-blue-900 text-white font-semibold"
              onClick={async () => {
                try {
                  await supabase.from('reflective_logs').delete().eq('pupil_id', pupil.id)
                  await supabase.from('pupil_progress').delete().eq('pupil_id', pupil.id)
                  await supabase.from('lessons').delete().eq('pupil_id', pupil.id)
                  await supabase.from('transactions').delete().eq('pupil_id', pupil.id)
                  await supabase.from('messages').delete().eq('pupil_id', pupil.id)
                  if ((pupil as any).profile_id) {
                    await supabase
                      .from('profiles')
                      .update({ role: 'removed' })
                      .eq('id', (pupil as any).profile_id)
                  }
                  await supabase.from('pupils').delete().eq('id', pupil.id)
                } catch {}
                await signOut()
                window.location.href = '/login'
              }}
            >
              OK — I understand
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="p-6 space-y-4 max-w-md mx-auto">
        <h1 className="text-xl font-bold text-slate-900">Hi {pupil.first_name}</h1>
        <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 space-y-2">
          <p className="font-semibold text-slate-900">Your account is inactive</p>
          <p>
            You are currently marked as inactive with DMW Driving School, so the app is not available for booking or lessons.
          </p>
          <p>
            Please contact DMW Driving School if you would like to continue lessons or have any questions.
          </p>
        </div>
        <button
          type="button"
          onClick={async () => {
            await signOut()
            window.location.href = '/login'
          }}
          className="w-full py-3 rounded-xl border border-slate-300 font-medium text-slate-700"
        >
          Sign out
        </button>
      </div>
    )
  }

  // Waiting / enquiry limited UI
  if (pupil && (pupil.status === 'waiting' || pupil.status === 'enquiry')) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-xl font-bold text-slate-900">Hi {pupil.first_name}</h1>
        {pupil.status === 'waiting' ? (
          <>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 space-y-2">
              <p>
                You are on the <strong>waiting list</strong>. Your instructor will be in touch as soon as possible.
              </p>
              <p className="text-amber-950/90">
                <strong>Messaging:</strong> you can read messages from your instructor, but you cannot send messages
                until they enable messaging on your profile.
              </p>
            </div>
            <button
              type="button"
              className="w-full py-3 rounded-xl border border-rose-300 text-rose-700 font-semibold bg-white"
              onClick={async () => {
                const ok = confirm(
                  'Remove yourself from the waiting list?\n\nThis will permanently delete all your details from DMW Driving School (GDPR). This cannot be undone.'
                )
                if (!ok) return
                const fullName = `${pupil.first_name} ${pupil.last_name}`.trim()
                try {
                  // Notify instructor (name is in the body so it stays readable after unlink)
                  await supabase.from('messages').insert({
                    pupil_id: pupil.id,
                    subject: 'Removed from waiting list',
                    body: `${fullName} has removed themself from the waiting list.`,
                    direction: 'inbound',
                  })
                  await supabase.from('reflective_logs').delete().eq('pupil_id', pupil.id)
                  await supabase.from('pupil_progress').delete().eq('pupil_id', pupil.id)
                  await supabase.from('lessons').delete().eq('pupil_id', pupil.id)
                  await supabase.from('transactions').update({ pupil_id: null }).eq('pupil_id', pupil.id)
                  // Unlink messages so pupil row can be deleted (avoids 409)
                  await supabase.from('messages').update({ pupil_id: null }).eq('pupil_id', pupil.id)
                  const { error } = await supabase.from('pupils').delete().eq('id', pupil.id)
                  if (error) throw error
                } catch (err: any) {
                  alert(err?.message || 'Could not remove you. Please contact DMW Driving School.')
                  return
                }
                await signOut()
                window.location.href = '/login'
              }}
            >
              Remove from waiting list
            </button>
          </>
        ) : (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 space-y-3">
            <p>
              <strong>Thank you for your enquiry.</strong> You are currently on the enquiry list.
            </p>
            <p>
              At this time DMW Driving School may not have been able to look at your enquiry yet — for example if they are on a lesson.
            </p>
            <p className="font-medium text-slate-800">Next steps</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                You may be moved to the <strong>waiting list</strong> when your enquiry has been reviewed.
              </li>
              <li>
                If we are unable to accommodate you in the near future, we will not be able to move you to the waiting list and your details will be deleted in line with GDPR. You will be notified if that happens.
              </li>
            </ul>
          </div>
        )}
        <div className="pt-2 border-t border-slate-100 space-y-2">
          <h2 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
            <MessageCircle size={12} /> Messages
          </h2>
          <div className="max-h-52 overflow-y-auto space-y-2 bg-slate-50 border border-slate-100 rounded-xl p-2">
            {feedMsgs.length === 0 && (
              <p className="text-center text-slate-400 text-xs py-4">No messages yet</p>
            )}
            {feedMsgs.slice(-10).map((m: any) => (
              <div
                key={m.id}
                className={
                  m.direction === 'inbound'
                    ? 'bg-blue-50 rounded-lg p-2 text-xs ml-4'
                    : 'bg-white border border-slate-200 rounded-lg p-2 text-xs mr-4'
                }
              >
                {m.subject && <div className="font-semibold text-slate-500 mb-0.5">{m.subject}</div>}
                <p className="whitespace-pre-wrap text-slate-800">{m.body}</p>
              </div>
            ))}
          </div>
          {(pupil as any).messaging_enabled ? (
            <form onSubmit={sendQuick} className="space-y-1.5">
              {quietActive && quietHours && (
                <div className="flex items-center gap-1.5 text-[11px] bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-lg px-2 py-1.5">
                  <Clock size={12} className="shrink-0" />
                  Instructor quiet hours — your message will be scheduled to send at {quietHours.end}. If it's important, call or text your instructor directly.
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={quickMsg}
                  onChange={(e) => setQuickMsg(e.target.value)}
                  placeholder="Write a message…"
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
                <button
                  type="submit"
                  disabled={sending || !quickMsg.trim()}
                  className={cn(
                    'px-3 py-2 rounded-xl text-white text-xs font-semibold disabled:opacity-40 shrink-0',
                    quietActive ? 'bg-indigo-600' : 'bg-blue-900'
                  )}
                >
                  {quietActive ? 'Schedule' : 'Send'}
                </button>
              </div>
            </form>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-950">
              You can read messages above. Sending is locked until your instructor enables messaging on your profile.
            </div>
          )}
          <Link to="/pupil/my-messages" className="block w-full py-2 rounded-xl border border-slate-200 text-center font-medium text-xs">
            Open full message feed
          </Link>
        </div>

        <Link to="/pupil/profile" className="block text-center py-3 rounded-xl border border-slate-200 font-medium">
          View profile
        </Link>
      </div>
    )
  }

  // Must read instructor messages first
  if (blockingMsgs.length > 0) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        <div className="bg-blue-900 text-white px-4 py-4">
          <h1 className="text-lg font-bold">Message from your instructor</h1>
          <p className="text-sm text-blue-200">Please read before continuing</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {blockingMsgs.map((m) => (
            <div key={m.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              {m.subject && <div className="font-semibold text-sm mb-1">{m.subject}</div>}
              <p className="text-sm text-slate-800 whitespace-pre-wrap">{m.body}</p>
              <div className="text-xs text-slate-400 mt-2">
                {m.created_at ? format(new Date(m.created_at), 'd MMM yyyy HH:mm') : ''}
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 border-t">
          <button
            type="button"
            onClick={markMessagesRead}
            className="w-full py-3 rounded-xl bg-blue-900 text-white font-semibold"
          >
            I have read this
          </button>
        </div>
      </div>
    )
  }

  const nextLesson = lessons[0]
  const testDate = pupil?.practical_test_date
  const daysToTest = testDate ? differenceInDays(new Date(testDate), new Date()) : null

  const quietActive = !!quietHours && isQuietNow(quietHours)

  const tileClass =
    'bg-white border border-slate-200 rounded-[clamp(0.65rem,2.2vw,1rem)] flex flex-col items-center justify-center gap-[clamp(0.2rem,1.2vw,0.45rem)] text-center px-[clamp(0.25rem,1.5vw,0.6rem)] py-[clamp(0.55rem,2.4vw,1rem)] min-h-[clamp(3.4rem,14vw,5.2rem)] active:bg-slate-50'

  const tileIcon = 'text-blue-900 shrink-0'
  const tileIconSize = 'clamp(1rem,4.2vw,1.35rem)'
  const tileLabel = 'font-medium leading-tight text-[clamp(0.65rem,2.8vw,0.8rem)] text-slate-800'

  return (
    <div
      className="mx-auto w-full max-w-lg space-y-[clamp(0.55rem,2.2vw,0.9rem)]"
      style={{
        padding: 'clamp(0.5rem, 2.5vw, 1rem)',
        paddingBottom: 'clamp(0.75rem, 3vw, 1.25rem)',
        fontSize: 'clamp(0.8rem, 2.8vw, 1rem)',
      }}
    >
      {!navigator.onLine && getCachedNextLesson() && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-[clamp(0.65rem,2.6vw,0.75rem)]">
          <span className="font-semibold">Offline — next lesson: </span>
          {format(new Date(getCachedNextLesson()!.start_time), 'EEE d MMM · HH:mm')}
        </div>
      )}

      <div className={instructorEnRoute ? 'space-y-2' : 'flex items-center justify-between gap-2'}>
        <div className="min-w-0 flex-1">
          {instructorEnRoute && liveTrip ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
              <h1 className="font-bold text-emerald-950 text-[clamp(0.95rem,3.8vw,1.15rem)] leading-snug break-words">
                Hi {pupil?.first_name || 'there'}, your instructor is on the way
              </h1>
              <p className="text-emerald-900/90 text-[clamp(0.7rem,2.8vw,0.8rem)] mt-1 leading-snug break-words">
                Track them on the map below and be ready for your lesson
                {liveTrip.eta_arrive_at || liveTrip.eta_seconds != null
                  ? ` · ETA ${formatFrozenEta(liveTrip)}`
                  : ''}
                .
              </p>
            </div>
          ) : (
            <>
              <h1 className="font-bold text-slate-900 truncate text-[clamp(1rem,4.2vw,1.25rem)]">
                Hi {pupil?.first_name || 'there'}
              </h1>
              <div className="flex flex-wrap gap-x-3 text-slate-600 text-[clamp(0.65rem,2.6vw,0.75rem)]">
                {pupil && pupil.credit_hours > 0 && <span>{pupil.credit_hours}h credit</span>}
                {daysToTest != null && daysToTest >= 0 && (
                  <span className="text-blue-800">Test in {daysToTest}d</span>
                )}
              </div>
            </>
          )}
        </div>
        {!instructorEnRoute && (
          <div className="flex gap-1.5 shrink-0">
            <Link to="/pupil/settings" className="flex items-center gap-1 rounded-lg bg-white border border-slate-200 font-medium text-[clamp(0.65rem,2.6vw,0.75rem)] px-[clamp(0.45rem,2vw,0.7rem)] py-[clamp(0.3rem,1.2vw,0.45rem)]">
              <Settings style={{ width: tileIconSize, height: tileIconSize }} /> Settings
            </Link>
            <Link to="/pupil/profile" className="flex items-center gap-1 rounded-lg bg-white border border-slate-200 font-medium text-[clamp(0.65rem,2.6vw,0.75rem)] px-[clamp(0.45rem,2vw,0.7rem)] py-[clamp(0.3rem,1.2vw,0.45rem)]">
              <User style={{ width: tileIconSize, height: tileIconSize }} /> Profile
            </Link>
          </div>
        )}
      </div>

      {instructorEnRoute && liveTrip && (
        <div className="space-y-2">
          <TripTrackerMap trip={liveTrip} height="min(55vh, 480px)" />
          <p className="text-[11px] text-slate-500 text-center">
            Position updates live · ETA is fixed from when they set off
          </p>
        </div>
      )}

      {!instructorEnRoute && (
      <div className="grid grid-cols-2 gap-[clamp(0.35rem,1.6vw,0.55rem)]">
        <Link to="/pupil/my-resources" className={tileClass}>
          <BookOpen className={tileIcon} style={{ width: tileIconSize, height: tileIconSize }} />
          <span className={tileLabel}>Resources</span>
        </Link>
        <Link to="/pupil/videos" className={tileClass}>
          <Video className={tileIcon} style={{ width: tileIconSize, height: tileIconSize }} />
          <span className={tileLabel}>Learning videos</span>
        </Link>
        <Link to="/pupil/my-progress" className={tileClass}>
          <ClipboardList className={tileIcon} style={{ width: tileIconSize, height: tileIconSize }} />
          <span className={tileLabel}>Progress</span>
        </Link>
        <Link to="/pupil/my-logs" className={tileClass}>
          <ExternalLink className={tileIcon} style={{ width: tileIconSize, height: tileIconSize }} />
          <span className={tileLabel}>Reflective log</span>
        </Link>
        <Link to="/pupil/payments" className={tileClass}>
          <Wallet className={tileIcon} style={{ width: tileIconSize, height: tileIconSize }} />
          <span className={tileLabel}>Payments</span>
        </Link>
        <Link to="/pupil/availability" className={tileClass}>
          <Clock className={tileIcon} style={{ width: tileIconSize, height: tileIconSize }} />
          <span className={tileLabel}>My availability</span>
        </Link>
      </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <h2 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Upcoming lessons</h2>
          <Link to="/pupil/my-lessons" className="text-[11px] font-semibold text-blue-900">View all</Link>
        </div>
        {lessons.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl py-3 text-center text-slate-400 text-xs">No upcoming lessons</div>
        ) : (
          <div className="space-y-1.5">
            {lessons.slice(0, 2).map((lesson) => (
              <div key={lesson.id} className="bg-white border border-slate-200 rounded-xl px-2.5 py-2 flex items-center gap-2">
                <Link to="/pupil/my-lessons" className="flex-1 min-w-0 flex items-center gap-2 text-left">
                  <div className="text-xs font-medium text-slate-500 w-12 shrink-0">{formatDate(lesson.start_time)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-xs capitalize truncate">{(lesson.lesson_type || 'lesson').replace(/_/g, ' ')}</div>
                    <div className="text-[11px] text-slate-500">{formatTime(lesson.start_time)}</div>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCancelLesson(lesson) }}
                  className="shrink-0 px-2.5 py-1.5 rounded-lg bg-rose-600 text-white text-[11px] font-bold"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

{!instructorEnRoute && (
      <>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <h2 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Upcoming holiday</h2>
          <button
            type="button"
            onClick={() => { setEditingHoliday(null); setHolStart(''); setHolEnd(''); setShowHolidayForm(true) }}
            className="text-[11px] font-semibold"
            style={{ color: 'var(--dmw-primary, #0A4CA1)' }}
          >
            + Add
          </button>
        </div>
        {holidays.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl py-2.5 text-center text-slate-400 text-xs">No holiday booked</div>
        ) : (
          holidays.map((h) => (
            <button
              type="button"
              key={h.id}
              onClick={() => openEditHoliday(h)}
              className="w-full text-left bg-white border border-slate-200 rounded-xl px-2.5 py-2 flex items-center justify-between gap-2 mb-1 hover:bg-slate-50"
            >
              <span className="flex items-center gap-2">
                <CalendarOff size={14} className="text-slate-400" />
                <span className="text-xs font-medium">{formatRangeLabel(new Date(h.start_time), new Date(h.end_time))}</span>
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 shrink-0">Edit</span>
            </button>
          ))
        )}
      </div>

      {instructorAway.length > 0 && (
        <DateRangeList
          title="Instructor away"
          groups={groupConsecutiveDayRanges(instructorAway)}
          emptyText=""
          variant="amber"
        />
      )}

      <div>
        <h2 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Available gaps</h2>
        {gaps.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl py-2.5 text-center text-slate-400 text-xs">No gaps available</div>
        ) : (
          gaps.slice(0, 3).map((g) => (
            <div key={g.id} className="bg-white border border-slate-200 rounded-xl px-2.5 py-2 mb-1.5 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-xs">{format(new Date(g.start_time), 'EEE d MMM')} · {formatTime(g.start_time)}</div>
                <div className="text-[11px] text-slate-500">{g.duration_minutes || 60} mins · Tap Book to take this slot</div>
              </div>
              <button
                type="button"
                onClick={() => setBookGap(g)}
                className="shrink-0 px-3 py-1.5 rounded-lg text-white text-[11px] font-bold"
                style={{ background: 'var(--dmw-primary, #0A4CA1)' }}
              >
                Book
              </button>
            </div>
          ))
        )}
        <p className="text-[10px] text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 mt-1">
          A gap is an open time slot in your instructor&apos;s diary (not a free lesson). If one is listed, press Book to reserve it as your lesson.
        </p>
      </div>

</>
      )}

      <div className="pt-1">
        <h2 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
          <MessageCircle size={12} /> Message instructor
        </h2>
        {!(pupil.status === 'active' || (pupil as any).messaging_enabled) ? (
          <div className="mb-1.5 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-950">
            You cannot send messages until your instructor enables messaging on your profile. You can still open the feed to read their messages.
          </div>
        ) : (
        <form onSubmit={sendQuick} className="space-y-1.5 mb-1.5">
          {quietActive && quietHours && (
            <div className="flex items-center gap-1.5 text-[11px] bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-lg px-2 py-1.5">
              <Clock size={12} className="shrink-0" />
              Instructor quiet hours — your message will be scheduled to send at {quietHours.end}. If it's important, call or text your instructor directly.
            </div>
          )}
          {quickFile && (
            <div className="flex items-center justify-between gap-2 text-[11px] bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
              <span className="truncate">{quickFile.name}</span>
              <button type="button" onClick={() => setQuickFile(null)} className="text-rose-600 font-semibold shrink-0">Remove</button>
            </div>
          )}
          <div className="flex gap-2">
            <label className="shrink-0 px-2.5 py-2 rounded-xl border border-slate-200 flex items-center justify-center cursor-pointer" title="Attach photo">
              <Paperclip size={16} className="text-slate-600" />
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={(e) => setQuickFile(e.target.files?.[0] || null)}
              />
            </label>
            <input
              value={quickMsg}
              onChange={(e) => setQuickMsg(e.target.value)}
              placeholder="Write a message…"
              className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-sm"
            />
            <button
              type="submit"
              disabled={sending || (!quickMsg.trim() && !quickFile)}
              className={cn(
                'px-3 py-2 rounded-xl text-white text-xs font-semibold disabled:opacity-40 shrink-0',
                quietActive ? 'bg-indigo-600' : 'bg-blue-900'
              )}
            >
              {quietActive ? 'Schedule' : 'Send'}
            </button>
          </div>
        </form>
        )}
        <Link to="/pupil/my-messages" className="block w-full py-2 rounded-xl border border-slate-200 text-center font-medium text-xs">
          Message feed{unread.length ? ` (${unread.length} unread)` : ''}
        </Link>
      </div>

      {showHolidayForm && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/40"
          onClick={() => { if (!savingHoliday) { setShowHolidayForm(false); setEditingHoliday(null); setHolStart(''); setHolEnd('') } }}
        >
          <div className="bg-white rounded-t-2xl w-full p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-lg">{editingHoliday ? 'Edit holiday' : 'Add holiday'}</h2>
            <p className="text-xs text-slate-500">Your instructor will be notified.</p>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">From</label>
              <input type="date" value={holStart} onChange={(e) => setHolStart(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">To (optional — same day if blank)</label>
              <input type="date" value={holEnd} onChange={(e) => setHolEnd(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm" />
            </div>
            <button
              type="button"
              disabled={savingHoliday || !holStart}
              onClick={saveHoliday}
              className="w-full py-3 rounded-xl text-white font-semibold disabled:opacity-50"
              style={{ background: 'var(--dmw-primary, #0A4CA1)' }}
            >
              {savingHoliday ? 'Saving…' : editingHoliday ? 'Save changes' : 'Save holiday'}
            </button>
            {editingHoliday && (
              <button
                type="button"
                disabled={savingHoliday}
                onClick={deleteHoliday}
                className="w-full py-3 rounded-xl border border-red-300 text-red-600 font-semibold disabled:opacity-50"
              >
                Delete holiday
              </button>
            )}
            <button
              type="button"
              disabled={savingHoliday}
              onClick={() => { setShowHolidayForm(false); setEditingHoliday(null); setHolStart(''); setHolEnd('') }}
              className="w-full py-2 text-slate-500 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {bookGap && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => !booking && setBookGap(null)}>
          <div className="bg-white rounded-t-2xl w-full p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-lg">Book this slot?</h2>
            <p className="text-sm text-slate-600">
              {format(new Date(bookGap.start_time), 'EEEE d MMMM yyyy')} at {formatTime(bookGap.start_time)}
              <br />
              Duration: {bookGap.duration_minutes || 60} minutes
            </p>
            <p className="text-xs text-slate-500">
              This will book the lesson for you and remove the gap for other pupils. Standard lesson rates apply — this is not a free lesson.
            </p>
            <button
              type="button"
              disabled={booking}
              onClick={confirmBookGap}
              className="w-full py-3 rounded-xl text-white font-semibold disabled:opacity-50"
              style={{ background: 'var(--dmw-primary, #0A4CA1)' }}
            >
              {booking ? 'Booking…' : 'Confirm'}
            </button>
            <button type="button" disabled={booking} onClick={() => setBookGap(null)} className="w-full py-2 text-slate-500 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {cancelLesson && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setCancelLesson(null)}>
          <div className="bg-white rounded-t-2xl w-full p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-lg">Cancel lesson?</h2>
            <p className="text-sm text-slate-600">
              {format(new Date(cancelLesson.start_time), 'EEEE d MMMM yyyy')} at {formatTime(cancelLesson.start_time)}
            </p>
            {differenceInHours(new Date(cancelLesson.start_time), new Date()) < 48 ? (
              <p className="text-sm text-rose-600 bg-rose-50 rounded-xl p-3">
                Within 48 hours — you may still be charged under our terms.
              </p>
            ) : (
              <p className="text-sm text-slate-500">More than 48 hours away.</p>
            )}
            <button type="button" disabled={cancelling} onClick={confirmCancel} className="w-full py-3 rounded-xl bg-rose-600 text-white font-semibold">
              Confirm cancel
            </button>
            <button type="button" onClick={() => setCancelLesson(null)} className="w-full py-2 text-slate-500 text-sm">Keep lesson</button>
          </div>
        </div>
      )}
    </div>
  )
}
