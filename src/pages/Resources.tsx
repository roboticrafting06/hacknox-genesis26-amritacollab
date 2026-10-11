import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ImagePlus, Package, Pencil, Plus, Search, Trash2, Undo2, UserCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { ok, useQuery } from '../lib/hooks'
import { fmtDay, iso, normTokens } from '../lib/logic'
import { Badge, Empty, ErrorBox, Field, Note, PageHeader, Skeleton, Tabs, useTab, useToast } from '../components/ui'

interface Res { id: number; creator_id: string; creator_name: string; name: string; specs: string | null; mode: 'rent' | 'buy'; till_day: string | null; expires_at: string; image_path: string | null }
interface Offer { id: number; request_id: number; request_name: string; mode: string; offerer_id: string; offerer_name: string; offerer_email: string; requester_id: string; requester_name: string; requester_email: string; expires_at: string }
const img = (p: string) => supabase.storage.from('resource-images').getPublicUrl(p).data.publicUrl
const Thumb = ({ r }: { r: Res }) => r.image_path ? <img src={img(r.image_path)} alt={r.name} loading="lazy" className="size-20 rounded-xl object-cover shrink-0" /> :
  <div className="size-20 rounded-xl bg-soft text-brand grid place-items-center shrink-0"><Package size={28} /></div>

export default function Resources() {
  const tab = useTab('browse'); const [sp] = useSearchParams(); const { profile } = useAuth(); const toast = useToast(); const nav = useNavigate()
  const q = useQuery(async () => ({ res: ok(await supabase.from('resource_requests').select('*').order('id', { ascending: false })) as Res[],
    offers: ok(await supabase.from('resource_offers').select('*').order('id', { ascending: false })) as Offer[] }), [])
  const [kw, setKw] = useState('')
  const offer = async (id: number) => { const { error } = await supabase.rpc('offer_resource', { p_req: id }); error ? toast(error.message, 'error') : toast('Contact details exchanged — see My resources.'); q.reload() }
  const del = async (r: Res) => { if (!confirm('Delete this request?')) return; if (r.image_path) await supabase.storage.from('resource-images').remove([r.image_path])
    const { error } = await supabase.from('resource_requests').delete().eq('id', r.id); error ? toast(error.message, 'error') : toast('Request deleted.'); q.reload() }
  const withdraw = async (id: number) => { if (!confirm('Withdraw your offer?')) return; const { error } = await supabase.from('resource_offers').delete().eq('id', id); error ? toast(error.message, 'error') : toast('Offer withdrawn.'); q.reload() }
  const d = q.data; const me = profile!.id; const kt = new Set(normTokens(kw))
  return <div><PageHeader title="Resources" sub="Request to rent or buy — or lend what you have." icon={<Package />} />
    <Tabs items={[['browse', 'Browse', <Search size={15} />], ['create', 'Request a resource', <Plus size={15} />], ['mine', 'My resources', <UserCheck size={15} />]]} />
    {q.error && <ErrorBox msg={q.error} />}{q.loading && !d && <Skeleton />}
    {d && tab === 'browse' && <div className="space-y-4"><input className="input" placeholder="Search e.g. oscilloscope, Raspberry Pi" value={kw} onChange={e => setKw(e.target.value)} />
      {(() => { const items = d.res.filter(r => r.creator_id !== me && (!kt.size || normTokens(r.name + ' ' + (r.specs ?? '')).some(x => kt.has(x))))
        return !items.length ? <Empty icon={<Package />} title="No open resource requests" /> : items.map(r => { const offered = d.offers.some(o => o.request_id === r.id && o.offerer_id === me)
          return <div key={r.id} className="card p-4 flex gap-4 animate-up"><Thumb r={r} /><div className="flex-1 min-w-0"><div className="flex gap-2 items-center flex-wrap"><b className="text-lg">{r.name}</b><Badge k={r.mode} /></div>
            <p className="text-xs text-mut">requested by {r.creator_name} · {r.mode === 'rent' ? `needed till ${fmtDay(r.till_day!)}` : `expires ${fmtDay(r.expires_at)}`}</p>{r.specs && <p className="text-sm mt-1.5">{r.specs}</p>}</div>
            {offered ? <Badge k="accepted">you offered</Badge> : <button className="btn btn-ok btn-sm self-center" onClick={() => offer(r.id)}>I have it</button>}</div> }) })()}</div>}
    {d && tab === 'create' && <Create key={sp.get('edit') || 'new'} edit={d.res.find(r => r.id === Number(sp.get('edit')) && r.creator_id === me)} />}
    {d && tab === 'mine' && <div className="space-y-8">
      <section><h2 className="font-bold mb-3">My requests</h2>{!d.res.filter(r => r.creator_id === me).length ? <Empty icon={<Package />} title="No requests" to="/app/resources?tab=create" cta="Request a resource" /> :
        <div className="space-y-3">{d.res.filter(r => r.creator_id === me).map(r => { const os = d.offers.filter(o => o.request_id === r.id)
          return <div key={r.id} className="card p-4 animate-up"><div className="flex gap-4"><Thumb r={r} /><div className="flex-1"><div className="flex gap-2 items-center"><b className="text-lg">{r.name}</b><Badge k={r.mode} /></div>
            <p className="text-xs text-mut">expires {fmtDay(r.expires_at)}</p>{r.specs && <p className="text-sm mt-1">{r.specs}</p>}</div>
            <div className="flex gap-2 self-start"><button className="btn btn-ghost btn-sm" aria-label="Edit" onClick={() => nav(`/app/resources?tab=create&edit=${r.id}`)}><Pencil size={14} /></button>
            <button className="btn btn-bad btn-sm" aria-label="Delete" onClick={() => del(r)}><Trash2 size={14} /></button></div></div>
            {os.length ? <Note kind="ok"><b>People who have it:</b>{os.map(o => <div key={o.id}>{o.offerer_name} · <a className="font-semibold underline" href={`mailto:${o.offerer_email}`}>{o.offerer_email}</a></div>)}</Note> : <Note kind="warn">No offers yet.</Note>}</div> })}</div>}</section>
      <section><h2 className="font-bold mb-3">Requests I offered to help with</h2>{!d.offers.filter(o => o.offerer_id === me).length ? <p className="text-sm text-mut">None.</p> :
        <div className="space-y-3">{d.offers.filter(o => o.offerer_id === me).map(o => <div key={o.id} className="card p-4"><b>{o.request_name}</b> <Badge k={o.mode} /><p className="text-sm mt-1">Requester: {o.requester_name} · <a className="font-semibold text-brand" href={`mailto:${o.requester_email}`}>{o.requester_email}</a> <span className="text-mut">· expires {fmtDay(o.expires_at)}</span></p>
          <button className="btn btn-ghost btn-sm mt-2" onClick={() => withdraw(o.id)}><Undo2 size={13} />Withdraw offer</button></div>)}</div>}</section></div>}
  </div>
}

function Create({ edit }: { edit?: Res }) {
  const nav = useNavigate(); const toast = useToast(); const { profile } = useAuth()
  const [mode, setMode] = useState<'rent' | 'buy'>(edit?.mode ?? 'rent'); const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget); setBusy(true); let path: string | null = null
    if (file) { path = `${profile!.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`; const up = await supabase.storage.from('resource-images').upload(path, file); if (up.error) { setBusy(false); return toast(up.error.message, 'error') } }
    const body = { name: String(f.get('name')).trim(), specs: String(f.get('specs') || '').trim() || null, mode, till_day: mode === 'rent' ? f.get('till') : null }
    const { error } = edit ? await supabase.from('resource_requests').update(path ? { ...body, image_path: path } : body).eq('id', edit.id)
      : await supabase.from('resource_requests').insert({ ...body, expires_at: mode === 'rent' ? f.get('till') : iso(new Date()), image_path: path })   // server trigger sets the real expiry
    setBusy(false); if (error) { if (path) await supabase.storage.from('resource-images').remove([path]); return toast(error.message, 'error') }
    if (edit && path && edit.image_path) await supabase.storage.from('resource-images').remove([edit.image_path])
    toast(edit ? 'Request updated.' : 'Resource request posted.'); nav('/app/resources?tab=mine')
  }
  return <form onSubmit={submit} className="card p-6 space-y-5 max-w-xl animate-up">
    <Field label="Resource name"><input className="input" name="name" required maxLength={120} defaultValue={edit?.name} placeholder="e.g. Digital oscilloscope" /></Field>
    <Field label="Specifications"><textarea className="input" name="specs" rows={3} maxLength={400} defaultValue={edit?.specs ?? ""} placeholder="e.g. 100 MHz, 4 channels" /></Field>
    <div className="grid grid-cols-2 gap-3"><div><span className="label">I want to</span><div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-soft">{(['rent', 'buy'] as const).map(m =>
      <button type="button" key={m} onClick={() => setMode(m)} className={`rounded-lg py-2 text-sm font-bold capitalize ${mode === m ? 'bg-surface text-brand shadow-card' : 'text-mut'}`}>{m}</button>)}</div></div>
      {mode === 'rent' && <Field label="Needed till"><input className="input" type="date" name="till" min={iso(new Date())} defaultValue={edit?.till_day ?? ""} required /></Field>}</div>
    <label className="flex items-center gap-3 rounded-xl border border-dashed border-line px-4 py-3 text-sm cursor-pointer hover:border-brand transition"><ImagePlus size={18} className="text-brand" />
      <span className="flex-1 truncate">{file ? file.name : edit?.image_path ? 'Photo kept — choose a file to replace it' : 'Add a reference photo (optional, max 5 MB)'}</span>
      <input type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={e => { const x = e.target.files?.[0]; if (x && x.size > 5e6) { toast('Image must be under 5 MB.', 'error'); return } setFile(x ?? null) }} /></label>
    <p className="text-xs text-mut">Rent requests expire on the “till” date. Buy requests auto-expire after 30 days.</p>
    <button className="btn w-full py-3" disabled={busy}>{busy ? 'Saving…' : edit ? 'Save changes' : 'Submit request'}</button></form>
}
