import { useState, type FormEvent, type ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { HOME, useAuth, type Role } from '../lib/auth'
import { DEPTS } from '../lib/logic'
import { Field } from '../components/ui'
import { Logo } from '../components/Shell'

const LABEL: Record<string, string> = { student: 'Student', lab: 'Lab assistant', faculty: 'Faculty' }
function Frame({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return <div className="min-h-screen grid lg:grid-cols-2">
    <div className="hidden lg:flex mesh relative flex-col justify-between p-12 bg-brand/5 border-r border-line"><Link to="/"><Logo /></Link>
      <div><h2 className="font-display text-4xl font-bold leading-tight">Collaborate more.<br />Coordinate less.</h2><p className="text-mut mt-3 max-w-sm">One place for labs, mentors, teams and resources.</p></div><span /></div>
    <div className="grid place-items-center p-6"><div className="w-full max-w-md animate-up">
      <Link to="/" className="lg:hidden block mb-8"><Logo /></Link>
      <h1 className="font-display text-3xl font-bold">{title}</h1><p className="text-mut text-sm mt-1 mb-6">{sub}</p>{children}</div></div></div>
}

// Password box with a show/hide toggle (used on the login forms)
function PasswordInput({ name = 'password', autoComplete }: { name?: string; autoComplete?: string }) {
  const [show, setShow] = useState(false)
  return <div className="relative">
    <input className="input pr-11" type={show ? 'text' : 'password'} name={name} required autoComplete={autoComplete} />
    <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} title={show ? 'Hide password' : 'Show password'}
      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-mut hover:text-brand hover:bg-soft transition">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
}

export function Login() {
  const { role = 'student' } = useParams(); const nav = useNavigate(); const { profile } = useAuth()
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  if (!LABEL[role]) return <Navigate to="/" replace />
  if (profile) return <Navigate to={HOME[profile.role]} replace />
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true); setErr(''); const f = new FormData(e.currentTarget)
    const { data, error } = await supabase.auth.signInWithPassword({ email: String(f.get('email')).trim(), password: String(f.get('password')) })
    if (error || !data.user) { setErr('Invalid email or password.'); setBusy(false); return }
    const { data: p } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle()
    if (p?.role !== role) { await supabase.auth.signOut(); setErr(`This account is not a ${LABEL[role].toLowerCase()} account. Use the right portal.`); setBusy(false); return }
    nav(HOME[role as Role], { replace: true })
  }
  return <Frame title={`${LABEL[role]} login`} sub="Welcome back to AmritaCollab.">
    <form onSubmit={submit} className="space-y-4">
      <Field label="Email"><input className="input" type="email" name="email" required autoFocus autoComplete="email" /></Field>
      <Field label="Password"><PasswordInput autoComplete="current-password" /></Field>
      {err && <p role="alert" className="text-sm text-bad bg-bad/10 rounded-xl px-3.5 py-2.5">{err}</p>}
      <button className="btn w-full py-3" disabled={busy}>{busy ? 'Signing in…' : 'Log in'}</button></form>
    <div className="flex justify-between text-sm text-mut mt-5">
      {role === 'student' ? <Link className="text-brand font-semibold" to="/register">Create student account</Link> : <span />}
      <span className="flex gap-3">{Object.keys(LABEL).filter(r => r !== role).map(r => <Link key={r} className="hover:text-brand" to={`/login/${r}`}>{LABEL[r]}</Link>)}</span></div>
  </Frame>
}

export function Register() {
  const nav = useNavigate(); const { profile } = useAuth(); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false)
  if (profile) return <Navigate to={HOME[profile.role]} replace />
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true); setErr(''); const f = new FormData(e.currentTarget)
    const { data, error } = await supabase.auth.signUp({ email: String(f.get('email')).trim(), password: String(f.get('password')),
      options: { data: { name: String(f.get('name')).trim(), dept: f.get('dept'), year: String(f.get('year') || '').trim() } } })
    setBusy(false)
    if (error) return setErr(error.message)
    if (!data.session) return setSent(true)   // email confirmation enabled in Supabase
    nav('/app', { replace: true })
  }
  if (sent) return <Frame title="Check your email" sub="We sent a confirmation link. Open it, then log in."><Link className="btn" to="/login/student">Go to login</Link></Frame>
  return <Frame title="Create your account" sub="Students only. Faculty and lab accounts are set up by admins.">
    <form onSubmit={submit} className="space-y-4">
      <Field label="Full name"><input className="input" name="name" required /></Field>
      <Field label="Email"><input className="input" type="email" name="email" required /></Field>
      <div className="grid grid-cols-[1fr_110px] gap-3">
        <Field label="Department"><select className="input" name="dept" required>{DEPTS.map(d => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Year"><input className="input" name="year" placeholder="3rd" /></Field></div>
      <Field label="Password (min 6)"><input className="input" type="password" name="password" minLength={6} required autoComplete="new-password" /></Field>
      {err && <p role="alert" className="text-sm text-bad bg-bad/10 rounded-xl px-3.5 py-2.5">{err}</p>}
      <button className="btn w-full py-3" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button></form>
    <p className="text-sm text-mut mt-5">Already registered? <Link className="text-brand font-semibold" to="/login/student">Log in</Link></p>
  </Frame>
}
