import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { getLinkedPupil } from '../../lib/pupilSession'
import { supabase } from '../../lib/supabase'
import { fetchWorkingHours, workingDaysList, slotsForHours, defaultWorkingHours, type WorkingHours } from '../../lib/workingHours'
import { ArrowLeft } from 'lucide-react'
import { cn } from '../../lib/utils'

export default function PupilAvailability() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [pupilId, setPupilId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [hours, setHours] = useState<WorkingHours>(defaultWorkingHours())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const [p, wh] = await Promise.all([getLinkedPupil(profile), fetchWorkingHours()])
      setHours(wh)
      if (p) {
        setPupilId(p.id)
        if ((p as any).availability && typeof (p as any).availability === 'object') {
          setSelected((p as any).availability)
        }
      }
      setLoading(false)
    })()
  }, [profile])

  function toggle(day: string, slot: string) {
    setSelected((prev) => {
      const list = prev[day] || []
      const next = list.includes(slot) ? list.filter((s) => s !== slot) : [...list, slot].sort()
      return { ...prev, [day]: next }
    })
  }

  async function save() {
    if (!pupilId) return
    setSaving(true)
    const { error } = await supabase.rpc('pupil_update_self', { patch: { availability: selected } })
    if (error) alert(error.message)
    else alert('Saved')
    setSaving(false)
  }

  const days = workingDaysList(hours)
  const slots = slotsForHours(hours)

  return (
    <div className="pb-8">
      <div className="px-4 pt-3 flex items-center justify-between mb-2">
        <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-slate-500">
          <ArrowLeft size={16} /> Back
        </button>
        <button type="button" onClick={save} className="text-sm font-semibold text-blue-900">
          {saving ? '…' : 'Save'}
        </button>
      </div>
      <h1 className="px-4 text-xl font-bold text-slate-900 mb-1">My availability</h1>
      <p className="px-4 text-xs text-slate-400 mb-4">
        Only showing times within your instructor's working hours ({hours.start}–{hours.end}).
      </p>
      {loading ? (
        <p className="px-4 text-slate-400 text-sm">Loading…</p>
      ) : (
        <div className="px-4 space-y-5">
          {days.map((day) => {
            const list = selected[day] || []
            return (
              <div key={day}>
                <h2 className="font-semibold text-slate-900 mb-2">{day}</h2>
                <div className="flex flex-wrap gap-2">
                  {slots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => toggle(day, slot)}
                      className={cn(
                        'px-3 py-2 rounded-lg text-sm font-medium',
                        list.includes(slot) ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-400'
                      )}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
