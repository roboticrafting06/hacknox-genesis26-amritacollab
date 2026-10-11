import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Cpu, ClipboardList, MapPin, CalendarPlus, Zap, Flame, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ok, useQuery } from '../lib/hooks'
import { fetchTaken } from '../lib/data'
import { fmtDay, iso, nextAvailable, prioritise } from '../lib/logic'
import { Badge, Empty, ErrorBox, Field, Note, PageHeader, Prio, SlotPicker, Skeleton, Tabs, useTab, useToast } from '../components/ui'

interface Eq { id: number; name: string; category: string; location: string }

export default function Equipment() {
  const tab = useTab('available'); const [sp, setSp] = useSearchParams()
  const eqs = useQuery(async () => ({ eq: ok(await supabase.from('equipment').select('*').order('category').order('name')) as Eq[], taken: await fetchTaken('equipment') }), [])
  return <div><PageHeader title="Equipment" sub="Browse labs, pick a slot, get approved." icon={<Cpu />} />
    <Tabs items={[['available', 'Available', <Cpu size={15} />], ['book', 'Request booking', <CalendarPlus size={15} />], ['mine', 'My requests', <ClipboardList size={15} />]]} />
    {eqs.error && <ErrorBox msg={eqs.error} />}
    {tab !== 'mine' && eqs.loading && <Skeleton />}
    {tab === 'available' && eqs.data && <div className="grid sm:grid-cols-2 gap-4">{eqs.data.eq.map((e, i) => {
      const n = nextAvailable(eqs.data!.taken.filter(t => t.id === e.id), iso(new Date()), 1)[0]
      return <div key={e.id} className="card p-5 animate-up flex flex-col" style={{ animationDelay: `${i * 40}ms` }}>
        <div className="flex justify-between gap-3"><div><h3 className="font-bold leading-snug">{e.name}</h3><p className="text-xs text-mut flex items-center gap-1 mt-1"><MapPin size={12} />{e.location} · {e.category}</p></div></div>
        <div className="mt-4 flex items-center justify-between gap-2"><span className="chip">{n ? `Next: ${n.label}` : 'No slot in 60 days'}</span>
          <button className="btn btn-sm" onClick={() => setSp({ tab: 'book', eq: String(e.id) })}>Book</button></div></div> })}</div>}
    {tab === 'book' && eqs.data && <BookForm items={eqs.data.eq} initial={Number(sp.get('eq')) || eqs.data.eq[0]?.id} initialDay={sp.get('day') || ''} editId={Number(sp.get('edit')) || undefined} key={sp.get('edit') || 'new'} />}
    {tab === 'mine' && <Mine />}
  </div>
}

function BookForm({ items, initial, initialDay, editId }: { items: Eq[]; initial: number; initialDay: string; editId?: number }) {
  const nav = useNavigate(); const toast = useToast()
  const [eq, setEq] = useState(initial); const [purpose, setPurpose] = useState(''); const [day, setDay] = useState(initialDay); const [slot, setSlot] = useState(''); const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(!editId)
  useEffect(() => { if (!editId) return
    supabase.from('equipment_bookings').select('*').eq('id', editId).maybeSingle().then(({ data }) => {
      if (!data || data.status !== 'pending') { toast('That request can no longer be edited.', 'error'); nav('/app/equipment?tab=mine'); return }
      setEq(data.equipment_id); setPurpose(data.purpose); setDay(data.day); setSlot(data.slot); setReady(true) }) }, [editId])
  const p = useMemo(() => prioritise(purpose, day || undefined), [purpose, day])
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (!day || !slot) return toast('Pick a date and a time slot.', 'error')
    setBusy(true)
    const body = { equipment_id: eq, purpose: purpose.trim(), day, slot, priority: p.priority, score: p.score, reason: p.reason }
    const { error } = editId ? await supabase.from('equipment_bookings').update(body).eq('id', editId) : await supabase.from('equipment_bookings').insert(body)
    setBusy(false)
    if (error) return toast(error.message, 'error')
    toast(editId ? 'Request updated.' : 'Request submitted. The lab assistant will review it.'); nav('/app/equipment?tab=mine')
  }
  if (!ready) return <Skeleton n={2} />
  return <form onSubmit={submit} className="card p-6 space-y-5 max-w-2xl animate-up">
    {editId && <Note kind="warn">Editing a pending request. Once the lab assistant approves it, it can no longer be changed.</Note>}
    <Field label="Equipment"><select className="input" value={eq} onChange={e => { setEq(+e.target.value); setSlot('') }}>{items.map(e => <option key={e.id} value={e.id}>{e.name} — {e.location}</option>)}</select></Field>
    <Field label="What do you need it for?"><textarea className="input" rows={3} maxLength={400} required value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="e.g. Printing gripper prototype for my final-year project; review is next week" /></Field>
    {purpose.trim() && <div className={`flex items-start gap-2 text-sm rounded-xl px-3.5 py-2.5 ${p.priority === 'high' ? 'bg-bad/10 text-bad' : 'bg-soft text-mut'}`}>
      {p.priority === 'high' ? <Flame size={16} className="mt-0.5" /> : <Zap size={16} className="mt-0.5" />}<span><b className="capitalize">{p.priority} priority</b> · {p.reason}</span></div>}
    <div><span className="label">Date &amp; time slot</span><SlotPicker kind="equipment" id={eq} day={day} slot={slot} onChange={(d, s) => { setDay(d); setSlot(s) }} /></div>
    <button className="btn w-full py-3" disabled={busy}>{busy ? 'Saving…' : editId ? 'Save changes' : 'Submit request'}</button></form>
}

function Mine() {
  const nav = useNavigate(); const toast = useToast()
  const { data, loading, error, reload } = useQuery(async () => {
    const rows = ok(await supabase.from('equipment_bookings').select('*, equipment(name)').order('id', { ascending: false })) as any[]
    const taken = rows.some(r => r.status === 'rejected') ? await fetchTaken('equipment') : []
    return { rows, taken } }, [])
  const remove = async (id: number, pending: boolean) => { if (!confirm(pending ? 'Cancel this request?' : 'Remove this request from your list?')) return
    const { error } = await supabase.from('equipment_bookings').delete().eq('id', id); error ? toast(error.message, 'error') : toast(pending ? 'Request cancelled.' : 'Request removed.'); reload() }
  if (loading) return <Skeleton />; if (error) return <ErrorBox msg={error} />
  if (!data!.rows.length) return <Empty icon={<ClipboardList />} title="No requests yet" hint="Your bookings and their status will appear here." to="/app/equipment?tab=book" cta="Book equipment" />
  return <div className="space-y-3">{data!.rows.map(b => { const alts = b.status === 'rejected' ? nextAvailable(data!.taken.filter(t => t.id === b.equipment_id), b.day, 5) : []
    return <div key={b.id} className="card p-5 animate-up">
      <div className="flex justify-between gap-3 flex-wrap"><div><b>{b.equipment.name}</b><p className="text-sm text-mut">{fmtDay(b.day)} · {b.slot}</p></div><div className="flex gap-2"><Badge k={b.status} /><Prio p={b.priority} /></div></div>
      <p className="text-sm text-mut mt-2">{b.purpose}</p>
      {b.status === 'accepted' && <Note kind="ok">Approved — the slot is reserved for you. Approved requests can’t be changed.{b.note && ` Note: ${b.note}`}</Note>}
      {b.status === 'pending' && <Note kind="warn">Waiting for the lab assistant.
        <div className="flex gap-2 mt-2"><button className="btn btn-ghost btn-sm" onClick={() => nav(`/app/equipment?tab=book&edit=${b.id}`)}><Pencil size={13} />Edit</button>
          <button className="btn btn-bad btn-sm" onClick={() => remove(b.id, true)}><Trash2 size={13} />Cancel request</button></div></Note>}
      {b.status === 'rejected' && <Note kind="bad"><b>Request declined.</b>{b.note && ` Reason: ${b.note}`}<div className="mt-2 flex flex-wrap gap-1.5">Next available:{alts.map(a =>
        <button key={a.day + a.slot} className="chip" onClick={() => nav(`/app/equipment?tab=book&eq=${b.equipment_id}&day=${a.day}`)}>{a.label}</button>)}{!alts.length && ' none in the next 60 days'}</div>
        <button className="btn btn-ghost btn-sm mt-2" onClick={() => remove(b.id, false)}><Trash2 size={13} />Remove</button></Note>}
    </div> })}</div>
}
