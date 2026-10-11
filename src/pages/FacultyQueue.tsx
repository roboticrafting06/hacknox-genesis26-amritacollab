import { useState } from 'react'
import { CalendarCheck, CalendarDays, CheckCircle2, Download, History, Inbox as InboxIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { ok, useQuery } from '../lib/hooks'
import { fmtDay, iso } from '../lib/logic'
import { Badge, Empty, ErrorBox, PageHeader, Prio, SlotPicker, Skeleton, Tabs, useTab, useToast } from '../components/ui'

function Pending({ r, fid, done }: { r: any; fid: number; done: () => void }) {
  const toast = useToast(); const [day, setDay] = useState(r.day); const [slot, setSlot] = useState(r.slot); const [note, setNote] = useState('')
  const act = async (accept: boolean) => {
    if (accept && (!day || !slot)) return toast('Pick a day and slot first.', 'error')
    const { error } = await supabase.from('mentor_requests').update(accept ? { status: 'accepted', final_day: day, final_slot: slot, note: note.trim() || null } : { status: 'rejected', note: note.trim() || null }).eq('id', r.id).eq('status', 'pending')
    if (error) toast(error.code === '23505' ? 'That slot is already taken — choose another.' : error.message, 'error'); else toast(accept ? `Accepted for ${fmtDay(day)} ${slot}.` : 'Request declined.'); done() }
  const download = async () => { const { data, error } = await supabase.storage.from('mentor-files').createSignedUrl(r.attachment_path, 120); error ? toast(error.message, 'error') : window.open(data.signedUrl, '_blank', 'noopener') }
  return <div className="card p-5 animate-up">
    <div className="flex justify-between gap-3 flex-wrap"><div><b className="text-lg">{r.title}</b><p className="text-xs text-mut">{r.student_name} · {r.student_dept} · {r.student_email}</p></div>
      <div className="text-right"><Prio p={r.priority} /><p className="text-xs text-mut mt-1 max-w-56">{r.reason}</p></div></div>
    <p className="text-sm my-3">{r.description}</p>
    {r.attachment_path && <button className="btn btn-ghost btn-sm mb-3" onClick={download}><Download size={14} />Attachment</button>}
    <p className="text-xs text-mut mb-2">Student's preference: {fmtDay(r.day)} · {r.slot}</p>
    <SlotPicker kind="faculty" id={fid} day={day} slot={slot} onChange={(d, s) => { setDay(d); setSlot(s) }} />
    <div className="flex gap-2 flex-wrap mt-4"><input className="input flex-1 min-w-48" maxLength={200} placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} />
      <button className="btn btn-ok" onClick={() => act(true)}>Accept</button><button className="btn btn-bad" onClick={() => act(false)}>Decline</button></div></div>
}

export default function FacultyQueue() {
  const tab = useTab('pending'); const { profile } = useAuth()
  const { data, loading, error, reload } = useQuery(async () => {
    const me = ok(await supabase.from('faculty').select('id,name').eq('user_id', profile!.id).maybeSingle()) as { id: number; name: string } | null
    if (!me) throw new Error('Your account is not linked to a faculty record yet. Ask the admin to run supabase/staff-setup.sql.')
    return { me, rows: ok(await supabase.from('mentor_requests').select('*').eq('faculty_id', me.id).order('created_at')) as any[] } }, [profile?.id])
  const rows = data?.rows ?? []; const today = iso(new Date())
  const pending = rows.filter(r => r.status === 'pending').sort((a, b) => (a.priority === 'high' ? 0 : 1) - (b.priority === 'high' ? 0 : 1) || b.score - a.score)
  const sched = rows.filter(r => r.status === 'accepted' && r.final_day >= today).sort((a, b) => (a.final_day + a.final_slot).localeCompare(b.final_day + b.final_slot))
  return <div><PageHeader title="Mentoring requests" sub={data ? `Signed in as ${data.me.name}` : ''} icon={<CalendarCheck />} />
    <Tabs items={[['pending', `Pending${pending.length ? ` (${pending.length})` : ''}`, <InboxIcon size={15} />], ['schedule', 'My schedule', <CalendarDays size={15} />], ['history', 'History', <History size={15} />]]} />
    {error && <ErrorBox msg={error} />}{loading && !data && <Skeleton />}
    {data && tab === 'pending' && (!pending.length ? <Empty icon={<CheckCircle2 />} title="All caught up" hint="No pending requests." /> : <div className="space-y-3">{pending.map(r => <Pending key={r.id} r={r} fid={data.me.id} done={reload} />)}</div>)}
    {data && tab === 'schedule' && <div className="card overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase text-mut"><th className="p-3">Date</th><th>Slot</th><th>Student</th><th>Topic</th></tr></thead>
      <tbody>{sched.map(r => <tr key={r.id} className="border-t border-line"><td className="p-3">{fmtDay(r.final_day)}</td><td>{r.final_slot}</td><td>{r.student_name} <span className="text-mut">{r.student_email}</span></td><td>{r.title}</td></tr>)}
        {!sched.length && <tr><td colSpan={4} className="p-4 text-mut">No upcoming meetings.</td></tr>}</tbody></table></div>}
    {data && tab === 'history' && <div className="card overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase text-mut"><th className="p-3">Topic</th><th>Student</th><th>Priority</th><th>Result</th></tr></thead>
      <tbody>{rows.filter(r => r.status !== 'pending').reverse().map(r => <tr key={r.id} className="border-t border-line"><td className="p-3">{r.title}</td><td>{r.student_name}</td><td><Prio p={r.priority} /></td><td><Badge k={r.status} />{r.final_day && ` ${fmtDay(r.final_day)} ${r.final_slot}`}</td></tr>)}</tbody></table></div>}
  </div>
}
