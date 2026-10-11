import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, LogOut, Pencil, Plus, Search, Trash2, UserCheck, UserMinus, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { ok, useQuery } from '../lib/hooks'
import { ANY_DEPT, DEPTS, normTokens } from '../lib/logic'
import { Badge, Empty, ErrorBox, Field, PageHeader, Skeleton, Tabs, useTab, useToast } from '../components/ui'

interface Role { id: number; request_id: number; dept: string; specialization: string; details: string | null; filled_by: string | null; filled_name: string | null }
interface Team { id: number; creator_id: string; creator_name: string; creator_dept: string; title: string; description: string; team_roles: Role[] }
interface Member { name: string; email: string; role: string }
interface Draft { dept: string; spec: string; details: string }
const load = async () => ok(await supabase.from('team_requests').select('*, team_roles(*)').order('id', { ascending: false }).order('id', { referencedTable: 'team_roles' })) as Team[]
const DeptChip = ({ d }: { d: string }) => d === ANY_DEPT ? <span className="chip bg-line/60 text-mut">Any department</span> : <span className="chip"><Lock size={11} />{d} only</span>

export default function Teams() {
  const tab = useTab('browse'); const q = useQuery(load, [])
  return <div><PageHeader title="Team requests" sub="Find collaborators across departments." icon={<Users />} />
    <Tabs items={[['browse', 'Browse', <Search size={15} />], ['create', 'Create request', <Plus size={15} />], ['mine', 'My teams', <UserCheck size={15} />]]} />
    {q.error && <ErrorBox msg={q.error} />}{q.loading && !q.data && <Skeleton />}
    {q.data && (tab === 'browse' ? <Browse teams={q.data} reload={q.reload} /> : tab === 'create' ? <Create /> : <Mine teams={q.data} reload={q.reload} />)}</div>
}

function Browse({ teams, reload }: { teams: Team[]; reload: () => void }) {
  const { profile } = useAuth(); const toast = useToast(); const [dept, setDept] = useState(''); const [kw, setKw] = useState('')
  const cards = useMemo(() => { const kwt = new Set(normTokens(kw)); const filtered = !!(dept || kwt.size)
    return teams.filter(t => t.creator_id !== profile!.id).map(t => {
      const joined = t.team_roles.some(r => r.filled_by === profile!.id); const tt = new Set(normTokens(t.title + ' ' + t.description))
      const roles = t.team_roles.map(r => { const open = !r.filled_by; const kmatch = normTokens(r.specialization).some(x => kwt.has(x))
        const eligible = r.dept === ANY_DEPT || r.dept === profile!.dept
        return { ...r, open, kmatch, eligible, match: open && (!dept || r.dept === dept || r.dept === ANY_DEPT) && (!kwt.size || kmatch || [...kwt].some(x => tt.has(x))) } })
      return { t, joined, roles, show: roles.some(r => r.match) || (joined && !filtered) } }).filter(c => c.show) }, [teams, dept, kw, profile])
  const accept = async (id: number) => { const { error } = await supabase.rpc('accept_team_role', { p_role: id }); if (error) toast(error.message, 'error'); else toast('You joined! Contact details are in your Inbox and “My teams”.'); reload() }
  return <div className="space-y-4">
    <div className="card p-4 grid sm:grid-cols-[1fr_1fr] gap-3 animate-up"><select className="input" value={dept} onChange={e => setDept(e.target.value)}><option value="">Any department</option>{DEPTS.map(d => <option key={d}>{d}</option>)}</select>
      <input className="input" placeholder="Keyword e.g. ROS2, CAD, PCB" value={kw} onChange={e => setKw(e.target.value)} /></div>
    {!cards.length ? <Empty icon={<Users />} title="No open team requests match" hint="Try clearing filters, or post your own." /> :
      cards.map(({ t, joined, roles }, i) => <div key={t.id} className="card p-5 animate-up" style={{ animationDelay: `${i * 50}ms` }}>
        <div className="flex justify-between gap-3"><div><b className="text-lg">{t.title}</b><p className="text-xs text-mut">by {t.creator_name} · {t.creator_dept}</p></div>{joined && <Badge k="accepted">you joined</Badge>}</div>
        <p className="text-sm my-3">{t.description}</p>
        <div className="grid gap-2">{roles.map(r => <div key={r.id} className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 ${r.match && r.eligible ? 'border-ok/40 bg-ok/5' : 'border-line'}`}>
          <div className="min-w-0"><p className="text-sm font-semibold">{r.specialization}{r.kmatch && <span className="chip bg-ok/15 text-ok ml-2">match</span>}</p>
            <div className="mt-1"><DeptChip d={r.dept} /></div>{r.details && <p className="text-xs text-mut mt-1">{r.details}</p>}</div>
          {!r.open ? <Badge k="filled" /> : joined ? <span className="text-mut">–</span> : r.eligible ? <button className="btn btn-ok btn-sm shrink-0" onClick={() => accept(r.id)}>Accept role</button>
            : <span className="text-xs text-mut text-right shrink-0">Not open to<br />{profile!.dept?.split(' ')[0]}</span>}</div>)}</div></div>)}</div>
}

/** One role editor row: department rule + custom specialization + optional details */
function RoleFields({ r, set, label }: { r: Draft; set: (d: Draft) => void; label: string }) {
  return <div className="grid sm:grid-cols-2 gap-3 p-3 rounded-xl bg-soft/50">
    <div><select className="input" aria-label={`${label} department`} value={r.dept} onChange={e => set({ ...r, dept: e.target.value })}>
      <option value={ANY_DEPT}>Any department (open to everyone)</option>{DEPTS.map(d => <option key={d} value={d}>{d} only</option>)}</select></div>
    <input className="input" required maxLength={80} aria-label={`${label} specialization`} placeholder="Specialization e.g. PCB design" value={r.spec} onChange={e => set({ ...r, spec: e.target.value })} />
    <input className="input sm:col-span-2" maxLength={200} aria-label={`${label} details`} placeholder="Details for this role (optional) e.g. needs SolidWorks, 6 hrs/week" value={r.details} onChange={e => set({ ...r, details: e.target.value })} /></div>
}
const blank = (): Draft => ({ dept: ANY_DEPT, spec: '', details: '' })
const toRow = (x: Draft, request_id: number) => ({ request_id, dept: x.dept, specialization: x.spec.trim(), details: x.details.trim() || null })

function Create() {
  const nav = useNavigate(); const toast = useToast(); const [title, setTitle] = useState(''); const [desc, setDesc] = useState(''); const [busy, setBusy] = useState(false)
  const [roles, setRoles] = useState<Draft[]>([blank(), blank()])
  const setN = (n: number) => setRoles(r => Array.from({ length: Math.max(1, Math.min(8, n || 1)) }, (_, i) => r[i] ?? blank()))
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true)
    const t = await supabase.from('team_requests').insert({ title: title.trim(), description: desc.trim() }).select('id').single()
    if (t.error) { setBusy(false); return toast(t.error.message, 'error') }
    const r = await supabase.from('team_roles').insert(roles.map(x => toRow(x, t.data.id)))
    if (r.error) { await supabase.from('team_requests').delete().eq('id', t.data.id); setBusy(false); return toast(r.error.message, 'error') }
    toast('Team request posted.'); nav('/app/teams?tab=mine')
  }
  return <form onSubmit={submit} className="card p-6 space-y-5 max-w-2xl animate-up">
    <Field label="Project title"><input className="input" required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} /></Field>
    <Field label="Short description"><textarea className="input" rows={3} required maxLength={600} value={desc} onChange={e => setDesc(e.target.value)} /></Field>
    <Field label="People needed"><div className="flex items-center gap-3"><input type="range" min={1} max={8} value={roles.length} onChange={e => setN(+e.target.value)} className="flex-1 accent-[rgb(var(--brand))]" /><span className="chip text-base w-10 justify-center">{roles.length}</span></div></Field>
    <p className="text-xs text-mut -mt-2">Choose a specific department to restrict a role: only students from that department will be able to take it.</p>
    <div className="space-y-3">{roles.map((r, i) => <RoleFields key={i} label={`Person ${i + 1}`} r={r} set={d => setRoles(rs => rs.map((x, j) => j === i ? d : x))} />)}</div>
    <button className="btn w-full py-3" disabled={busy}>{busy ? 'Posting…' : 'Post team request'}</button></form>
}

function Roster({ id }: { id: number }) {
  const { data } = useQuery(async () => ok(await supabase.rpc('team_roster', { p_req: id })) as Member[], [id])
  return <div className="mt-3 space-y-1.5">{data?.map((m, i) => <div key={i} className="text-sm flex flex-wrap gap-x-2"><b>{m.name}</b><a className="text-brand" href={`mailto:${m.email}`}>{m.email}</a><span className="text-mut">— {m.role}</span></div>)}</div>
}

function Mine({ teams, reload }: { teams: Team[]; reload: () => void }) {
  const { profile } = useAuth(); const toast = useToast()
  const [editTeam, setEditTeam] = useState<number | null>(null); const [editRole, setEditRole] = useState<number | 'new:' | string | null>(null)
  const [tDraft, setTDraft] = useState({ title: '', description: '' }); const [rDraft, setRDraft] = useState<Draft>(blank())
  const created = teams.filter(t => t.creator_id === profile!.id); const joined = teams.filter(t => t.team_roles.some(r => r.filled_by === profile!.id))
  const done = (err: { message: string } | null, msg: string) => { err ? toast(err.message, 'error') : toast(msg); setEditTeam(null); setEditRole(null); reload() }
  const del = async (id: number) => { if (!confirm('Delete this team request? Members will be notified.')) return; const { error } = await supabase.from('team_requests').delete().eq('id', id); done(error, 'Team request deleted.') }
  const removeMember = async (r: Role) => { if (!confirm(`Remove ${r.filled_name} from the team? The role will open again and they won't be able to rejoin.`)) return
    const { error } = await supabase.rpc('remove_team_member', { p_role: r.id }); done(error, `${r.filled_name} was removed. The role is open again.`) }
  const leave = async (r: Role) => { if (!confirm('Leave this team?')) return; const { error } = await supabase.rpc('leave_team_role', { p_role: r.id }); done(error, 'You left the team.') }
  const saveTeam = async (id: number) => { const { error } = await supabase.from('team_requests').update({ title: tDraft.title.trim(), description: tDraft.description.trim() }).eq('id', id); done(error, 'Team updated.') }
  const saveRole = async (t: Team, r?: Role) => { if (!rDraft.spec.trim()) return toast('Add a specialization.', 'error')
    const { error } = r ? await supabase.from('team_roles').update({ dept: rDraft.dept, specialization: rDraft.spec.trim(), details: rDraft.details.trim() || null }).eq('id', r.id)
      : await supabase.from('team_roles').insert(toRow(rDraft, t.id)); done(error, r ? 'Role updated.' : 'Role added.') }
  const delRole = async (r: Role) => { if (!confirm('Delete this open role?')) return; const { error } = await supabase.from('team_roles').delete().eq('id', r.id); done(error, 'Role deleted.') }
  return <div className="space-y-8">
    <section><h2 className="font-bold mb-3">Requests I created</h2>{!created.length ? <Empty icon={<Users />} title="You haven't posted any" to="/app/teams?tab=create" cta="Create one" /> :
      <div className="space-y-3">{created.map(t => <div key={t.id} className="card p-5 animate-up">
        {editTeam === t.id ? <div className="space-y-3"><input className="input" maxLength={120} value={tDraft.title} onChange={e => setTDraft({ ...tDraft, title: e.target.value })} />
          <textarea className="input" rows={3} maxLength={600} value={tDraft.description} onChange={e => setTDraft({ ...tDraft, description: e.target.value })} />
          <div className="flex gap-2"><button className="btn btn-sm" onClick={() => saveTeam(t.id)}>Save</button><button className="btn btn-ghost btn-sm" onClick={() => setEditTeam(null)}>Cancel</button></div></div> :
          <><div className="flex justify-between gap-3"><b className="text-lg">{t.title}</b><div className="flex gap-2 shrink-0">
            <button className="btn btn-ghost btn-sm" aria-label="Edit team" onClick={() => { setEditTeam(t.id); setTDraft({ title: t.title, description: t.description }) }}><Pencil size={14} /></button>
            <button className="btn btn-bad btn-sm" aria-label="Delete team" onClick={() => del(t.id)}><Trash2 size={14} /></button></div></div>
            <p className="text-sm text-mut mt-1">{t.description}</p></>}
        <div className="mt-3 grid gap-2">{t.team_roles.map(r => editRole === r.id ? <div key={r.id} className="space-y-2"><RoleFields label="Role" r={rDraft} set={setRDraft} />
          <div className="flex gap-2"><button className="btn btn-sm" onClick={() => saveRole(t, r)}>Save role</button><button className="btn btn-ghost btn-sm" onClick={() => setEditRole(null)}>Cancel</button></div></div> :
          <div key={r.id} className="flex items-center justify-between gap-3 text-sm rounded-xl border border-line px-3.5 py-2.5">
            <div className="min-w-0"><p className="font-semibold">{r.specialization}</p><div className="mt-1"><DeptChip d={r.dept} /></div>{r.details && <p className="text-xs text-mut mt-1">{r.details}</p>}</div>
            {r.filled_by ? <div className="flex items-center gap-2 shrink-0"><Badge k="filled">{r.filled_name}</Badge>
              <button className="btn btn-bad btn-sm" onClick={() => removeMember(r)}><UserMinus size={13} />Remove</button></div> :
              <div className="flex items-center gap-2 shrink-0"><Badge k="open" />
                <button className="btn btn-ghost btn-sm" aria-label="Edit role" onClick={() => { setEditRole(r.id); setRDraft({ dept: r.dept, spec: r.specialization, details: r.details ?? '' }) }}><Pencil size={13} /></button>
                <button className="btn btn-bad btn-sm" aria-label="Delete role" onClick={() => delRole(r)}><Trash2 size={13} /></button></div>}</div>)}
          {editRole === 'new:' + t.id ? <div className="space-y-2"><RoleFields label="New role" r={rDraft} set={setRDraft} />
            <div className="flex gap-2"><button className="btn btn-sm" onClick={() => saveRole(t)}>Add role</button><button className="btn btn-ghost btn-sm" onClick={() => setEditRole(null)}>Cancel</button></div></div> :
            t.team_roles.length < 8 && <button className="btn btn-ghost btn-sm justify-self-start" onClick={() => { setEditRole('new:' + t.id); setRDraft(blank()) }}><Plus size={13} />Add a role</button>}</div>
        {t.team_roles.some(r => r.filled_by) && <Roster key={t.team_roles.map(r => r.filled_by).join()} id={t.id} />}</div>)}</div>}</section>
    <section><h2 className="font-bold mb-3">Teams I joined</h2>{!joined.length ? <p className="text-sm text-mut">You haven't joined any team yet.</p> :
      <div className="space-y-3">{joined.map(t => { const mine = t.team_roles.find(r => r.filled_by === profile!.id)!
        return <div key={t.id} className="card p-5"><div className="flex justify-between gap-3"><b>{t.title}</b><button className="btn btn-ghost btn-sm" onClick={() => leave(mine)}><LogOut size={13} />Leave</button></div>
          <p className="text-sm text-mut">{t.description}</p><Roster key={t.team_roles.map(r => r.filled_by).join()} id={t.id} /></div> })}</div>}</section></div>
}
