import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchWorkingHours, workingDaysList, slotsForHours, defaultWorkingHours, type WorkingHours } from '../lib/workingHours'
import { ArrowLeft } from 'lucide-react'
import { cn } from '../lib/utils'

export default function Availability() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [hours, setHours] = useState<WorkingHours>(defaultWorkingHours())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    ;(async () => {
      setLoading(true)
      const [pupilRes, wh] = await Promise.all([
        supabase.from('pupils').select('first_name, last_name, availability').eq('id', id).single(),
        fetchWorkingHours(),
      ])
      setHours(wh)
      const pupil = pupilRes.data
      if (pupil) {
        setName(`${pupil.first_name} ${pupil.last_name}`)
        if (pupil.availability && typeof pupil.availability === 'object') {
          setSelected(pupil.availability as any)
        }
      }
      setLoading(false)
    })()
  }, [id])

  function toggle(day: string, slot: string) {
    setSelected((prev) => {
      const list = prev[day] || []
      const next = list.includes(slot) ? list.filter((s) => s !== slot) : [...list, slot].sort()
      return { ...prev, [day]: next }
    })
  }

  function toggleAll(day: string, slots: string[]) {
    setSelected((prev) => {
      const list = prev[day] || []
      const allOn = slots.every((s) => list.includes(s))
      return { ...prev, [day]: allOn ? [] : [...slots] }
    })
  }

  async function save() {
    if (!id) return
    setSaving(true)
    const { error } = await supabase.from('pupils').update({ availability: selected }).eq('id', id)
    if (error) alert(error.message)
    setSaving(false)
  }

  const days = workingDaysList(hours)
  const slots = slotsForHours(hours)

  return (
    <div className="pb-8 min-h-full bg-white">
      <div className="bg-blue-900 text-white px-4 pt-3 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-blue-200">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg font-bold">Availability</h1>
            {name && <p className="text-sm text-blue-200">{name}</p>}
          </div>
        </div>
        <button onClick={save} disabled={saving} className="text-sm font-semibold text-blue-100">
          {saving ? '…' : 'Save'}
        </button>
      </div>

      {loading ? (
        <p className="px-4 pt-6 text-slate-400 text-sm">Loading…</p>
      ) : (
        <div className="px-4 space-y-5 pt-4">
          <p className="text-xs text-slate-400 -mt-1">
            Showing times within your working hours ({hours.start}–{hours.end}).
          </p>
          {days.map((day) => {
            const list = selected[day] || []
            return (
              <div key={day}>
                <h2 className="font-semibold text-slate-900 mb-2">{day}</h2>
                <div className="flex flex-wrap gap-2">
                  {slots.map((slot) => {
                    const on = list.includes(slot)
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => toggle(day, slot)}
                        className={cn(
                          'px-3 py-2 rounded-lg text-sm font-medium',
                          on ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-400'
                        )}
                      >
                        {slot}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => toggleAll(day, slots)}
                    className={cn(
                      'px-3 py-2 rounded-lg text-sm font-medium',
                      slots.length > 0 && slots.every((s) => list.includes(s))
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-100 text-slate-400'
                    )}
                  >
                    ALL
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
