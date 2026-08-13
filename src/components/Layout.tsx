import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { triggerMessagePush } from '../lib/pushNotifications'
import { runLessonReminders } from '../lib/reminders'
import {
  Calendar,
  Users,
  Wallet,
  MessageSquare,
  Settings,
  LogOut,
} from 'lucide-react'
import { cn } from '../lib/utils'
import InstallPrompt from './InstallPrompt'
import OfflineBanner from './OfflineBanner'
import NotificationSetup from './NotificationSetup'
import CancellationReviewPopup from './CancellationReviewPopup'
import MessageNotificationListener from './MessageNotificationListener'

const instructorNav = [
  { to: '/instructor', icon: Calendar, label: 'Diary' },
  { to: '/instructor/pupils', icon: Users, label: 'Pupils' },
  { to: '/instructor/money', icon: Wallet, label: 'Money' },
  { to: '/instructor/messages', icon: MessageSquare, label: 'Messages' },
  { to: '/instructor/settings', icon: Settings, label: 'Settings' },
]

const DECLINE_MESSAGE = `Unfortunately we won't be able to help you at this time.

Due to GDPR your details will be deleted from our system. You're welcome to enquire again at a later date if your circumstances change.

Thank you for your interest in DMW Driving School.`

type EnquiryPupil = {
  id: string
  first_name: string
  last_name: string
  phone: string | null
  email: string | null
  created_at?: string
}

function getHandledEnquiryIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem('dmw_handled_enquiries') || '[]')
  } catch {
    return []
  }
}

function markEnquiryHandled(id: string) {
  try {
    const ids = getHandledEnquiryIds()
    if (!ids.includes(id)) {
      ids.push(id)
      localStorage.setItem('dmw_handled_enquiries', JSON.stringify(ids.slice(-200)))
    }
  } catch {}
}

export default function Layout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [showLogout, setShowLogout] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [logReminder, setLogReminder] = useState<{ count: number } | null>(null)
  const [enquiryPopup, setEnquiryPopup] = useState<EnquiryPupil | null>(null)
  const [enquiryBusy, setEnquiryBusy] = useState(false)

  useEffect(() => {
    async function loadUnread() {
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('direction', 'inbound')
        .is('read_at', null)
      setUnreadCount(count || 0)
    }
    loadUnread()
    runLessonReminders().catch(() => {})
    const t = setInterval(loadUnread, 30000)

    // 6pm reflective log reminder (once per day)
    async function checkLogReminder() {
      const now = new Date()
      if (now.getHours() < 18) return
      const key = `dmw_log_remind_${now.toISOString().slice(0, 10)}`
      if (localStorage.getItem(key)) return
      const day = now.toISOString().slice(0, 10)
      const { data: dayLessons } = await supabase
        .from('lessons')
        .select('id, pupil_id')
        .gte('start_time', `${day}T00:00:00`)
        .lte('start_time', `${day}T23:59:59`)
        .neq('status', 'cancelled')
      if (!dayLessons?.length) return
      const { data: logs } = await supabase
        .from('reflective_logs')
        .select('id, pupil_id, session_goal, achieved')
        .eq('log_date', day)
      const filled = new Set(
        (logs || [])
          .filter((l: any) => l.session_goal || l.achieved)
          .map((l: any) => l.pupil_id)
      )
      const missing = dayLessons.filter((l: any) => l.pupil_id && !filled.has(l.pupil_id))
      if (missing.length) {
        setLogReminder({ count: missing.length })
        localStorage.setItem(key, '1')
      }
    }
    checkLogReminder()

    // New website enquiries → accept / decline / later popup
    async function checkEnquiries() {
      const handled = new Set(getHandledEnquiryIds())
      const { data } = await supabase
        .from('pupils')
        .select('id, first_name, last_name, phone, email, created_at')
        .eq('status', 'enquiry')
        .order('created_at', { ascending: false })
        .limit(20)
      const next = (data || []).find((p: EnquiryPupil) => !handled.has(p.id))
      if (next) setEnquiryPopup(next)
    }
    checkEnquiries()
    // Poll frequently so enquiries appear without a manual refresh
    const enquiryInterval = setInterval(checkEnquiries, 12000)

    const onVisible = () => {
      if (document.visibilityState === 'visible') checkEnquiries()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    // Realtime: new enquiry rows (requires Supabase Realtime enabled on pupils)
    const channel = supabase
      .channel('enquiry-pupils')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pupils' },
        (payload) => {
          const row = payload.new as EnquiryPupil & { status?: string }
          if (row?.status === 'enquiry' && row.id && !getHandledEnquiryIds().includes(row.id)) {
            setEnquiryPopup({
              id: row.id,
              first_name: row.first_name,
              last_name: row.last_name,
              phone: row.phone,
              email: row.email,
              created_at: (row as any).created_at,
            })
          }
        }
      )
      .subscribe()

    return () => {
      clearInterval(t)
      clearInterval(enquiryInterval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      supabase.removeChannel(channel)
    }
  }, [])

  async function deletePupilCascade(pupilId: string) {
    // Remove dependent rows first to avoid 409 Conflict on pupils delete
    await supabase.from('messages').delete().eq('pupil_id', pupilId)
    await supabase.from('reflective_logs').delete().eq('pupil_id', pupilId)
    await supabase.from('pupil_progress').delete().eq('pupil_id', pupilId)
    await supabase.from('lessons').delete().eq('pupil_id', pupilId)
    await supabase.from('transactions').update({ pupil_id: null }).eq('pupil_id', pupilId)
    return supabase.from('pupils').delete().eq('id', pupilId)
  }

  async function acceptEnquiry() {
    if (!enquiryPopup) return
    setEnquiryBusy(true)
    const { error } = await supabase
      .from('pupils')
      .update({ status: 'waiting' })
      .eq('id', enquiryPopup.id)
    if (error) {
      alert(error.message)
      setEnquiryBusy(false)
      return
    }
    // Notify pupil they are on the waiting list (+ push)
    const { data: waitMsg } = await supabase
      .from('messages')
      .insert({
        pupil_id: enquiryPopup.id,
        subject: 'You are on the waiting list',
        body: `Hi ${enquiryPopup.first_name},\n\nGood news — your enquiry has been reviewed and you have been moved to the waiting list.\n\nWe will be in touch as soon as a suitable slot is available.\n\nThank you,\nDMW Driving School`,
        direction: 'outbound',
      })
      .select('id')
      .maybeSingle()
    if (waitMsg?.id) triggerMessagePush(waitMsg.id)
    markEnquiryHandled(enquiryPopup.id)
    setEnquiryPopup(null)
    setEnquiryBusy(false)
    navigate('/instructor/pupils')
  }

  async function declineEnquiry() {
    if (!enquiryPopup) return
    if (
      !confirm(
        `Decline ${enquiryPopup.first_name} ${enquiryPopup.last_name}?\n\nThey will see a message when they open the app. Their details stay until they confirm, then are deleted (GDPR).`
      )
    ) {
      return
    }
    setEnquiryBusy(true)
    try {
      // Do NOT delete the pupil yet — they need the row to log in and read the message.
      await supabase.from('messages').insert({
        pupil_id: enquiryPopup.id,
        subject: 'Enquiry declined',
        body: DECLINE_MESSAGE,
        direction: 'outbound',
      })
      const { data: existing } = await supabase
        .from('pupils')
        .select('notes')
        .eq('id', enquiryPopup.id)
        .maybeSingle()
      const prevNotes = (existing as any)?.notes || ''
      const { error } = await supabase
        .from('pupils')
        .update({
          status: 'inactive',
          notes: `[ENQUIRY_DECLINED]\n${DECLINE_MESSAGE}\n\n${prevNotes}`.slice(0, 4000),
        })
        .eq('id', enquiryPopup.id)
      if (error) {
        alert(error.message)
        setEnquiryBusy(false)
        return
      }
      markEnquiryHandled(enquiryPopup.id)
      setEnquiryPopup(null)
      alert('Declined. They will see the message next time they open the app.')
    } catch (err: any) {
      alert(err?.message || 'Failed to decline')
    }
    setEnquiryBusy(false)
  }

  function decideLater() {
    if (!enquiryPopup) return
    markEnquiryHandled(enquiryPopup.id)
    setEnquiryPopup(null)
  }

  return (
    <>
    <NotificationSetup role="instructor" />
    <MessageNotificationListener role="instructor" profile={profile} />
    <div className="min-h-full flex flex-col bg-slate-50">
      <header className="bg-blue-900 text-white px-3 pb-1 pt-[calc(env(safe-area-inset-top,0px)_+_0.25rem)] flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src="/logo.png"
            alt="DMW Driving School"
            className="h-8 sm:h-9 w-auto max-w-[7rem] object-contain shrink-0"
          />
          <div className="text-sm text-blue-100 truncate font-medium">
            {profile?.full_name || profile?.email || ''}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowLogout(true)}
          className="p-1.5 rounded-lg hover:bg-blue-800 shrink-0"
          title="Log out"
        >
          <LogOut size={18} />
        </button>
      </header>

      {showLogout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-3">
            <h2 className="font-bold text-lg text-slate-900">Log out?</h2>
            <p className="text-sm text-slate-600">
              You are about to log out of the DMW app. You will need your email and password to sign back in.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowLogout(false)}
                className="flex-1 py-3 rounded-xl border border-slate-200 font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowLogout(false)
                  await signOut()
                }}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white font-semibold"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>

      {logReminder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-3">
            <h2 className="font-bold text-lg">Reflective logs due</h2>
            <p className="text-sm text-slate-600">
              {logReminder.count} lesson{logReminder.count > 1 ? 's' : ''} today still need a reflective log filled in.
            </p>
            <button type="button" onClick={() => setLogReminder(null)} className="w-full py-3 rounded-xl bg-blue-900 text-white font-semibold">
              OK
            </button>
          </div>
        </div>
      )}

      {enquiryPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-3">
            <h2 className="font-bold text-lg text-slate-900">New enquiry</h2>
            <p className="text-sm text-slate-700">
              <span className="font-semibold">
                {enquiryPopup.first_name} {enquiryPopup.last_name}
              </span>
              {(enquiryPopup.phone || enquiryPopup.email) && (
                <>
                  <br />
                  <span className="text-slate-500">
                    {[enquiryPopup.phone, enquiryPopup.email].filter(Boolean).join(' · ')}
                  </span>
                </>
              )}
            </p>
            <p className="text-sm text-slate-600">
              Accept to move them to the waiting list, decline to send a GDPR message and delete their details, or decide later to leave them in Enquiries.
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                disabled={enquiryBusy}
                onClick={acceptEnquiry}
                className="w-full py-3 rounded-xl bg-blue-900 text-white font-semibold disabled:opacity-50"
              >
                Accept → Waiting list
              </button>
              <button
                type="button"
                disabled={enquiryBusy}
                onClick={declineEnquiry}
                className="w-full py-3 rounded-xl bg-rose-600 text-white font-semibold disabled:opacity-50"
              >
                Decline & delete
              </button>
              <button
                type="button"
                disabled={enquiryBusy}
                onClick={decideLater}
                className="w-full py-3 rounded-xl border border-slate-200 text-slate-700 font-medium disabled:opacity-50"
              >
                Decide later
              </button>
            </div>
          </div>
        </div>
      )}

      <OfflineBanner />
      <CancellationReviewPopup />
      <InstallPrompt />

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 safe-bottom z-20">
        <div className="flex justify-around">
          {instructorNav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/instructor'}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center py-2 px-3 text-xs font-medium transition-colors min-w-[64px]',
                  isActive ? 'text-blue-900' : 'text-slate-400 hover:text-slate-600'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative">
                    <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                    {label === 'Messages' && unreadCount > 0 && (
                      <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
    </>
  )
}
