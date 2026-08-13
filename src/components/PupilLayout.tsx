import { useEffect, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LogOut, ArrowLeft } from 'lucide-react'
import { applyPupilTheme } from '../lib/pupilTheme'
import { getLinkedPupil } from '../lib/pupilSession'
import InstallPrompt from './InstallPrompt'
import OfflineBanner from './OfflineBanner'
import MessageNotificationListener from './MessageNotificationListener'
import NotificationSetup from './NotificationSetup'

export default function PupilLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isHome = location.pathname === '/pupil' || location.pathname === '/pupil/'
  const [headerBg, setHeaderBg] = useState(
    () => localStorage.getItem('dmw_pupil_theme_primary') || '#0A4CA1'
  )
  const [pupilStatus, setPupilStatus] = useState<string | null>(null)

  useEffect(() => {
    const id = localStorage.getItem('dmw_pupil_theme') || 'blue'
    applyPupilTheme(id)
    const primary = getComputedStyle(document.documentElement).getPropertyValue('--dmw-primary').trim() || '#0A4CA1'
    setHeaderBg(primary)
    localStorage.setItem('dmw_pupil_theme_primary', primary)

    function onTheme(e: Event) {
      const c = (e as CustomEvent).detail as string
      setHeaderBg(c)
      localStorage.setItem('dmw_pupil_theme_primary', c)
    }
    window.addEventListener('dmw-theme', onTheme)
    return () => window.removeEventListener('dmw-theme', onTheme)
  }, [])

  useEffect(() => {
    getLinkedPupil(profile)
      .then((p) => {
        if (p?.status) setPupilStatus(p.status)
      })
      .catch(() => {})
  }, [location.pathname, profile])

  // Inactive / waiting / enquiry: keep them on home (limited screens live there)
  useEffect(() => {
    if (!pupilStatus) return
    if (
      (pupilStatus === 'inactive' || pupilStatus === 'waiting' || pupilStatus === 'enquiry') &&
      !isHome
    ) {
      navigate('/pupil', { replace: true })
    }
  }, [pupilStatus, isHome, navigate])

  return (
    <>
    <NotificationSetup role="pupil" />
    <MessageNotificationListener role="pupil" profile={profile} />
    <div className="min-h-full flex flex-col bg-slate-50">
      <header
        className="text-white px-3 pb-1 pt-[calc(env(safe-area-inset-top,0px)_+_0.25rem)] flex items-center justify-between shrink-0"
        style={{ backgroundColor: headerBg }}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {!isHome && (
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="p-1 -ml-0.5 rounded-lg hover:bg-white/10 shrink-0"
              aria-label="Back"
            >
              <ArrowLeft size={22} />
            </button>
          )}
          <img
            src="/logo.png"
            alt="DMW Driving School"
            className="h-8 sm:h-9 w-auto max-h-9 max-w-[7rem] object-contain shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm truncate leading-tight">DMW Driving School</div>
            <div className="text-xs text-white/80 truncate">{profile?.full_name || 'Pupil'}</div>
          </div>
        </div>
        <button
          onClick={() => signOut()}
          className="p-1.5 rounded-lg hover:bg-white/10 shrink-0"
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
      </header>
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <OfflineBanner />
      <InstallPrompt />
    </div>
    </>
  )
}
