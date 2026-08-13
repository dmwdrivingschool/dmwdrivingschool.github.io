import { useEffect, useState, useRef, FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { getLinkedPupil } from '../../lib/pupilSession'
import { triggerMessagePush } from '../../lib/pushNotifications'
import { fetchQuietHours, isQuietNow, nextWindowOpen, type QuietHoursSettings } from '../../lib/quietHours'
import { format } from 'date-fns'
import { Paperclip, Clock } from 'lucide-react'
import { cn } from '../../lib/utils'

export default function PupilMessages() {
  const { profile } = useAuth()
  const [pupilId, setPupilId] = useState<string | null>(null)
  const [messagingEnabled, setMessagingEnabled] = useState(false)
  const [pupilStatus, setPupilStatus] = useState<string | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [body, setBody] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [quietHours, setQuietHours] = useState<QuietHoursSettings | null>(null)
  const [queued, setQueued] = useState<any[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  async function signedAttachment(path: string | null) {
    if (!path || /^https?:\/\//i.test(path)) return path
    const { data, error } = await supabase.storage.from('message-attachments').createSignedUrl(path, 3600)
    return error ? null : data?.signedUrl || null
  }

  useEffect(() => {
    async function load() {
      if (!profile) return
      const p = await getLinkedPupil(profile)
      if (!p) return
      setPupilId(p.id)
      const st = (p as any).status || null
      setPupilStatus(st)
      setMessagingEnabled(st === 'active' || !!(p as any).messaging_enabled)
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('pupil_id', p.id)
        .order('created_at', { ascending: true })
      const hydrated = await Promise.all((data || []).map(async (m: any) => ({ ...m, attachment_url: await signedAttachment(m.attachment_url) })))
      setMessages(hydrated)

      setQuietHours(await fetchQuietHours())

      await loadQueued(p.id)
    }
    load()
  }, [profile])

  async function loadQueued(pid: string) {
    const { data } = await supabase
      .from('queued_pupil_messages')
      .select('*')
      .eq('pupil_id', pid)
      .eq('status', 'pending')
      .order('send_at', { ascending: true })
    setQueued(data || [])
  }

  async function cancelQueued(id: string) {
    const { error } = await supabase.from('queued_pupil_messages').update({ status: 'cancelled' }).eq('id', id)
    if (error) alert(error.message)
    else setQueued((prev) => prev.filter((q) => q.id !== id))
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function uploadAttachment(pid: string, f: File) {
    const path = `${pid}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { error } = await supabase.storage.from('message-attachments').upload(path, f, {
      upsert: false,
      contentType: f.type || 'application/octet-stream',
    })
    if (error) {
      alert(error.message)
      return null
    }
    return path
  }

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!pupilId || (!body.trim() && !file)) return
    if (!messagingEnabled) {
      alert('Messaging is not enabled yet. Your instructor will turn this on when you can message them.')
      return
    }

    // Re-fetch rather than trust whatever was loaded when this page first
    // opened — a tab left open across the quiet-hours boundary would
    // otherwise still think quiet hours are off (or on) and send/queue
    // incorrectly.
    const liveQuietHours = await fetchQuietHours()
    setQuietHours(liveQuietHours)

    if (isQuietNow(liveQuietHours)) {
      setSending(true)
      let attachment_path: string | null = null
      if (file) {
        attachment_path = await uploadAttachment(pupilId, file)
        if (file && !attachment_path) {
          setSending(false)
          return
        }
      }
      const sendAt = nextWindowOpen(liveQuietHours)
      const { data, error } = await supabase
        .from('queued_pupil_messages')
        .insert({
          pupil_id: pupilId,
          body: body.trim(),
          attachment_path,
          attachment_name: file?.name || null,
          send_at: sendAt.toISOString(),
        })
        .select()
        .single()
      if (error) alert(error.message)
      else if (data) {
        setQueued((prev) => [...prev, data])
        alert(
          `It's quiet hours right now, so this will be sent at ${sendAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.\n\n${liveQuietHours.emergencyNote}`
        )
      }
      setBody('')
      setFile(null)
      setSending(false)
      return
    }

    setSending(true)
    let attachment_url: string | null = null
    if (file) {
      attachment_url = await uploadAttachment(pupilId, file)
      if (file && !attachment_url) {
        setSending(false)
        return
      }
    }
    const payload: any = {
      pupil_id: pupilId,
      body: body.trim() || (file ? `(Attachment: ${file.name})` : ''),
      direction: 'inbound',
      subject: 'Message from pupil',
    }
    if (attachment_url) payload.attachment_url = attachment_url
    const { data, error } = await supabase.from('messages').insert(payload).select().single()
    if (error) alert(error.message)
    else if (data) {
      setMessages((prev) => [...prev, data])
      triggerMessagePush(data.id)
    }
    setBody('')
    setFile(null)
    setSending(false)
  }

  const locked = !messagingEnabled
  const quietActive = !!quietHours && isQuietNow(quietHours)

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="px-4 py-3 border-b bg-white">
        <h1 className="text-lg font-bold text-slate-900">Message feed</h1>
      </div>
      {locked && (
        <div className="mx-4 mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-950">
          <strong>Messaging is not available yet.</strong>
          <p className="mt-1 text-amber-900">
            You can read messages from your instructor here, but you cannot send a reply until they enable messaging
            on your profile
            {pupilStatus === 'enquiry' || pupilStatus === 'waiting'
              ? ' (usually after you are taken on as a pupil).'
              : '.'}
          </p>
        </div>
      )}
      {!locked && quietActive && quietHours && (
        <div className="mx-4 mt-3 bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-sm text-indigo-950">
          <div className="flex items-center gap-1.5 font-semibold">
            <Clock size={14} /> Quiet hours until {quietHours.end}
          </div>
          <p className="mt-1 text-indigo-900">
            You can still write a message — it'll be held and sent automatically at {quietHours.end}.
          </p>
          <p className="mt-1 text-indigo-900">{quietHours.emergencyNote}</p>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 && (
          <p className="text-center text-slate-400 text-sm py-12">No messages yet</p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              'rounded-xl p-3 text-sm max-w-[85%]',
              m.direction === 'inbound' ? 'bg-blue-50 ml-auto' : 'bg-white border border-slate-200'
            )}
          >
            {m.subject && <div className="text-xs font-semibold text-slate-500 mb-1">{m.subject}</div>}
            <p className="whitespace-pre-wrap text-slate-800">{m.body}</p>
            {m.attachment_url && (
              <a href={m.attachment_url} target="_blank" rel="noreferrer" className="block mt-2">
                {/\.(jpg|jpeg|png|gif|webp|heic)(\?|$)/i.test(String(m.attachment_url)) ||
                String(m.attachment_url).includes('message-attachments') ? (
                  <img
                    src={m.attachment_url}
                    alt="Attachment"
                    className="max-h-48 rounded-lg border border-slate-200 object-cover max-w-full"
                  />
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-800 underline">
                    <Paperclip size={12} /> View attachment
                  </span>
                )}
              </a>
            )}
            <div className="text-[10px] text-slate-400 mt-1 flex gap-1 justify-end">
              <span>{m.created_at ? format(new Date(m.created_at), 'd MMM · HH:mm') : ''}</span>
              {m.direction === 'inbound' && <span>{m.read_at ? '✓✓' : '✓'}</span>}
            </div>
          </div>
        ))}
        {queued.map((q) => (
          <div
            key={q.id}
            className="rounded-xl p-3 text-sm max-w-[85%] ml-auto border border-dashed border-indigo-300 bg-indigo-50/60"
          >
            <p className="whitespace-pre-wrap text-slate-800">{q.body || (q.attachment_name ? `(Photo: ${q.attachment_name})` : '')}</p>
            <div className="text-[10px] text-indigo-700 mt-1.5 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1">
                <Clock size={11} /> Sending {format(new Date(q.send_at), 'd MMM · HH:mm')}
              </span>
              <button type="button" onClick={() => cancelQueued(q.id)} className="font-semibold text-rose-600">
                Cancel
              </button>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {locked ? (
        <div className="p-3 border-t bg-slate-50 text-center text-sm text-slate-500">
          Message box locked until your instructor enables messaging.
        </div>
      ) : (
        <form onSubmit={send} className="p-3 border-t bg-white space-y-2">
          {file && (
            <div className="text-xs text-slate-600 flex justify-between items-center bg-slate-50 rounded-lg px-2 py-1">
              <span className="truncate">{file.name}</span>
              <button type="button" onClick={() => setFile(null)} className="text-rose-600 font-semibold shrink-0 ml-2">
                Remove
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <label className="shrink-0 p-3 rounded-xl border border-slate-200 cursor-pointer">
              <Paperclip size={18} className="text-slate-600" />
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Message…"
              className="flex-1 px-4 py-3 rounded-xl border border-slate-300 text-sm"
            />
            <button
              type="submit"
              disabled={sending || (!body.trim() && !file)}
              className={cn(
                'px-4 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-40',
                quietActive ? 'bg-indigo-600' : 'bg-blue-900'
              )}
            >
              {sending ? '…' : quietActive ? 'Queue' : 'Send'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
