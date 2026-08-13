import { useState, useEffect, FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { X, Info } from 'lucide-react'
import { format } from 'date-fns'

interface Props {
  open: boolean
  initialDate?: Date
  editing?: { id: string; start_time: string; end_time: string; title: string; notes: string | null; visible_to_pupil?: boolean } | null
  onClose: () => void
  onSaved: () => void
}

export default function AwayModal({ open, initialDate, editing, onClose, onSaved }: Props) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [allDay, setAllDay] = useState(true)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [notes, setNotes] = useState('')
  const [kind, setKind] = useState<'away' | 'appointment'>('away')
  const [visibleToPupil, setVisibleToPupil] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editing) {
      const s = new Date(editing.start_time)
      const e = new Date(editing.end_time)
      const isFullDay = s.getHours() === 0 && s.getMinutes() === 0 && e.getHours() === 23 && e.getMinutes() === 59
      setStartDate(format(s, 'yyyy-MM-dd'))
      setEndDate(format(e, 'yyyy-MM-dd'))
      setAllDay(isFullDay)
      setStartTime(format(s, 'HH:mm'))
      setEndTime(format(e, 'HH:mm'))
      setNotes(editing.notes || '')
      setKind(editing.title === 'Appointment' ? 'appointment' : 'away')
      setVisibleToPupil(editing.visible_to_pupil !== false)
    } else {
      const d = format(initialDate || new Date(), 'yyyy-MM-dd')
      setStartDate(d)
      setEndDate(d)
      setAllDay(true)
      setStartTime('09:00')
      setEndTime('17:00')
      setNotes('')
      setKind('away')
      setVisibleToPupil(true)
    }
  }, [open, initialDate, editing])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    const start = allDay
      ? new Date(`${startDate}T00:00:00`)
      : new Date(`${startDate}T${startTime}:00`)
    const end = allDay
      ? new Date(`${endDate}T23:59:00`)
      : new Date(`${endDate}T${endTime}:00`)
    // Away = visible on pupil app; Appointment = instructor diary only
    const title = kind === 'away' ? 'Away' : 'Appointment'
    const payload = {
      lesson_type: 'private',
      title,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: 'booked',
      payment_status: 'unpaid',
      pupil_id: null,
      notes: notes || null,
      gearbox: 'manual',
      visible_to_pupil: kind === 'appointment' ? visibleToPupil : true,
    }
    const { error } = editing
      ? await supabase.from('lessons').update(payload).eq('id', editing.id)
      : await supabase.from('lessons').insert(payload)
    if (error) alert(error.message)
    else {
      onSaved()
      onClose()
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!editing) return
    if (!confirm('Delete this entry?')) return
    setSaving(true)
    const { error } = await supabase.from('lessons').delete().eq('id', editing.id)
    if (error) alert(error.message)
    else {
      onSaved()
      onClose()
    }
    setSaving(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40">
      <div className="bg-white rounded-t-2xl w-full max-h-[90vh] overflow-y-auto p-4 space-y-3 safe-bottom">
        <div className="flex justify-between items-center">
          <h2 className="font-bold text-lg">{editing ? 'Edit unavailability' : 'Add Unavailability'}</h2>
          <button onClick={onClose}><X size={22} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-sm text-slate-600 mb-1 block">Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setKind('away')}
                className={`py-2.5 rounded-xl text-sm font-semibold border ${kind === 'away' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-200'}`}
              >
                Away
              </button>
              <button
                type="button"
                onClick={() => setKind('appointment')}
                className={`py-2.5 rounded-xl text-sm font-semibold border ${kind === 'appointment' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-200'}`}
              >
                Appointment
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {kind === 'away'
                ? 'Shown on the pupil app as instructor holiday / unavailable.'
                : 'Only on your diary by default — pupils will not see this unless you turn on visibility below.'}
            </p>
          </div>

          {kind === 'appointment' && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <label className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-800">Show to pupils</span>
                <input
                  type="checkbox"
                  checked={visibleToPupil}
                  onChange={(e) => setVisibleToPupil(e.target.checked)}
                  className="w-5 h-5"
                />
              </label>
              <div className="flex gap-2 text-xs text-slate-600">
                <Info size={14} className="shrink-0 mt-0.5" />
                <span>
                  When on, pupils see this appointment's date and time under "Instructor away" —
                  never your notes, which always stay private. This applies to any day of the
                  week, including Saturdays and Sundays.
                </span>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-slate-600">Start date</label>
              <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value) }} required className="w-full mt-1 px-4 py-3 rounded-xl border border-slate-300" />
            </div>
            <div>
              <label className="text-sm text-slate-600">End date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required min={startDate} className="w-full mt-1 px-4 py-3 rounded-xl border border-slate-300" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            All day
          </label>
          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-slate-600">Start</label>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full mt-1 px-4 py-3 rounded-xl border border-slate-300" />
              </div>
              <div>
                <label className="text-sm text-slate-600">End</label>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full mt-1 px-4 py-3 rounded-xl border border-slate-300" />
              </div>
            </div>
          )}
          <div>
            <label className="text-sm text-slate-600">Private notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full mt-1 px-4 py-3 rounded-xl border border-slate-300" placeholder="Private notes" />
          </div>
          <button type="submit" disabled={saving} className="w-full py-3 rounded-xl bg-blue-900 text-white font-semibold">
            {saving ? 'Saving…' : 'Save'}
          </button>
          {editing && (
            <button type="button" disabled={saving} onClick={handleDelete} className="w-full py-3 rounded-xl border border-red-300 text-red-600 font-semibold">
              Delete
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
