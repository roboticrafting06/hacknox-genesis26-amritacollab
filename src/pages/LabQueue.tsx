import { useState } from 'react'
import { CalendarDays, CheckCircle2, ClipboardCheck, History, Inbox as InboxIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ok, useQuery } from '../lib/hooks'
import { SLOTS, fmtDay, iso } from '../lib/logic'
import { Badge, Empty, ErrorBox, Note, PageHeader, Prio, Skeleton, Tabs, useTab, useToast } from '../components/ui'

export default function LabQueue() {
  const tab = useTab('pending'); const toast = useToast(); const [notes, setNotes] = useState<Record<number, string>>({})
  const { data, loading, error, reload } = useQuery(async () => ok(await supabase.from('equipment_bookings').select('*, equipment(name)').order('created_at')) as any[], [])
  const decide = async (id: number, status: 'accepted' | 'rejected') => {
    const { error } = await supabase.from('equipment_bookings').update({ status, note: (notes[id] || '').trim() || null }).eq('id', id).eq('status', 'pending')
    if (error) toast(error.code === '23505' ? 'That slot was already given to another request — decline this one.' : error.message, 'error')
    else toast(status === 'accepted' ? 'Accepted. The slot is now blocked.' : 'Declined. The student sees the next available slots.')
    reload() }
  const rows = data ?? []; const today = iso(new Date())
  const accepted = rows.filter(r => r.status === 'accepted')
  const pending = rows.filter(r => r.status === 'pending').sort((a, b) => (a.priority === 'high' ? 0 : 1) - (b.priority === 'high' ? 0 : 1) || b.score - a.score || a.created_at.localeCompare(b.created_at))
  const upcoming = accepted.filter(r => r.day >= today).sort((a, b) => (a.day + a.slot).localeCompare(b.day + b.slot))
  const counts: Record<string, number> = {}; upcoming.forEach(r => { const k = `${r.equipment.name}|${r.day}`; counts[k] = (counts[k] || 0) + 1 })
  const blocked = Object.entries(counts).filter(([, c]) => c >= SLOTS.length).map(([k]) => k.split('|'))
  return <div><PageHeader title="Equipment requests" sub="High-priority work floats to the top." icon={<ClipboardCheck />} />
    <Tabs items={[['pending', `Pending${pending.length ? ` (${pending.length})` : ''}`, <InboxIcon size={15} />], ['schedule', 'Schedule', <CalendarDays size={15} />], ['history', 'History', <History size={15} />]]} />
    {error && <ErrorBox msg={error} />}{loading && !data && <Skeleton />}
    {data && tab === 'pending' && (!pending.length ? <Empty icon={<CheckCircle2 />} title="All caught up" hint="No pending requests." /> : <div className="space-y-3">{pending.map(r => {
      const conflict = accepted.some(a => a.equipment_id === r.equipment_id && a.day === r.day && a.slot === r.slot)
      return <div key={r.id} className="card p-5 animate-up">
        <div className="flex justify-between gap-3 flex-wrap"><div><b className="text-lg">{r.equipment.name}</b><p className="text-sm">{fmtDay(r.day)} · {r.slot}</p>
          <p className="text-xs text-mut">{r.student_name} · {r.student_dept} · {r.student_email}</p></div>
          <div className="text-right"><Prio p={r.priority} /><p className="text-xs text-mut mt-1 max-w-56">{r.reason}</p></div></div>
        <p className="text-sm my-3">{r.purpose}</p>
        {conflict && <Note kind="bad">This slot was already given to another request. You can only decline.</Note>}
        <div className="flex gap-2 flex-wrap mt-3"><input className="input flex-1 min-w-48" maxLength={200} placeholder="Note to student (optional)" value={notes[r.id] || ''} onChange={e => setNotes({ ...notes, [r.id]: e.target.value })} />
          {!conflict && <button className="btn btn-ok" onClick={() => decide(r.id, 'accepted')}>Accept</button>}<button className="btn btn-bad" onClick={() => decide(r.id, 'rejected')}>Decline</button></div></div> })}</div>)}
    {data && tab === 'schedule' && <div className="space-y-6">
      <section><h2 className="font-bold mb-2">Fully booked (blocked) days</h2>{blocked.length ? <div className="flex flex-wrap gap-2">{blocked.map(([n, d]) => <span key={n + d} className="chip">{n} · {fmtDay(d)}</span>)}</div> : <p className="text-sm text-mut">No blocked days.</p>}</section>
      <section><h2 className="font-bold mb-2">Upcoming approved bookings</h2><div className="card overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase text-mut"><th className="p-3">Date</th><th>Slot</th><th>Equipment</th><th>Student</th></tr></thead>
        <tbody>{upcoming.map(b => <tr key={b.id} className="border-t border-line"><td className="p-3">{fmtDay(b.day)}</td><td>{b.slot}</td><td>{b.equipment.name}</td><td>{b.student_name} <span className="text-mut">{b.student_email}</span></td></tr>)}
          {!upcoming.length && <tr><td colSpan={4} className="p-4 text-mut">Nothing booked yet.</td></tr>}</tbody></table></div></section></div>}
    {data && tab === 'history' && <div className="card overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase text-mut"><th className="p-3">Equipment</th><th>When</th><th>Student</th><th>Priority</th><th>Result</th></tr></thead>
      <tbody>{rows.filter(r => r.status !== 'pending').reverse().slice(0, 100).map(b => <tr key={b.id} className="border-t border-line"><td className="p-3">{b.equipment.name}</td><td>{fmtDay(b.day)} · {b.slot}</td><td>{b.student_name}</td><td><Prio p={b.priority} /></td><td><Badge k={b.status} /></td></tr>)}</tbody></table></div>}
  </div>
}
