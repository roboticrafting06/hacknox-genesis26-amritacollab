import { useEffect, useState } from 'react'
import { NavLink, Outlet, Link } from 'react-router-dom'
import { Cpu, GraduationCap, Home, Inbox, LogOut, Moon, Package, Sun, Users, ClipboardCheck, CalendarCheck } from 'lucide-react'
import { HOME, useAuth, type Role } from '../lib/auth'
import { supabase } from '../lib/supabase'
import AIAssistant from './AIAssistant'

const NAV: Record<Role, [string, string, any][]> = {
  student: [['/app', 'Home', Home], ['/app/equipment', 'Equipment', Cpu], ['/app/mentors', 'Mentors', GraduationCap], ['/app/teams', 'Teams', Users], ['/app/resources', 'Resources', Package]],
  lab: [['/lab', 'Equipment queue', ClipboardCheck]],
  faculty: [['/faculty', 'Mentoring requests', CalendarCheck]],
}
export const Logo = ({ light }: { light?: boolean }) => <span className="flex items-center gap-2.5 font-display font-bold text-xl tracking-tight">
  <span className="size-9 rounded-xl bg-brand grid place-items-center shadow-card"><svg width="20" height="20" viewBox="0 0 32 32"><path d="M6 24 16 6l10 18h-5l-5-9-5 9z" fill="#f2c14e" /></svg></span>
  <span className={light ? 'text-white' : ''}>Amrita<span className="text-brand">Collab</span></span></span>

export default function Shell() {
  const { profile, signOut } = useAuth(); const [dark, setDark] = useState(document.documentElement.classList.contains('dark')); const [unread, setUnread] = useState(0)
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); try { localStorage.setItem('theme', dark ? 'dark' : 'light') } catch {} }, [dark])
  useEffect(() => {
    if (!profile) return
    const load = () => supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('read', false).then(r => setUnread(r.count ?? 0))
    load(); const ch = supabase.channel('n-' + profile.id).on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` }, load).subscribe()
    window.addEventListener('inbox-read', load); return () => { supabase.removeChannel(ch); window.removeEventListener('inbox-read', load) }
  }, [profile])
  if (!profile) return null
  const items = [...NAV[profile.role], ['/inbox', 'Inbox', Inbox] as [string, string, any]]
  const link = (end: boolean) => ({ isActive }: { isActive: boolean }) => `relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${isActive ? 'bg-brand text-white shadow-card' : 'text-mut hover:bg-soft hover:text-brand'}`
  return <div className="min-h-screen lg:flex">
    <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-line bg-surface/60 backdrop-blur p-4 sticky top-0 h-screen">
      <Link to={HOME[profile.role]} className="px-2 py-3"><Logo /></Link>
      <nav className="mt-4 space-y-1 flex-1">{items.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === HOME[profile.role] || to === '/inbox'} className={link(true)}>
        <Icon size={18} />{label}{label === 'Inbox' && unread > 0 && <span className="ml-auto grid place-items-center min-w-5 h-5 px-1 rounded-full bg-gold text-[11px] font-extrabold text-black">{unread}</span>}</NavLink>)}</nav>
      <div className="card p-3 text-sm"><p className="font-bold truncate">{profile.name}</p><p className="text-xs text-mut capitalize">{profile.role === 'lab' ? 'Lab assistant' : profile.role}</p>
        <div className="flex gap-2 mt-3"><button className="btn btn-ghost btn-sm flex-1" onClick={() => setDark(!dark)} aria-label="Toggle theme">{dark ? <Sun size={14} /> : <Moon size={14} />}</button>
          <button className="btn btn-ghost btn-sm flex-1" onClick={signOut}><LogOut size={14} />Log out</button></div></div>
    </aside>
    <div className="flex-1 min-w-0">
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-bg/85 backdrop-blur border-b border-line">
        <Logo /><div className="flex gap-2"><button className="btn btn-ghost btn-sm" onClick={() => setDark(!dark)} aria-label="Toggle theme">{dark ? <Sun size={14} /> : <Moon size={14} />}</button>
          <button className="btn btn-ghost btn-sm" onClick={signOut} aria-label="Log out"><LogOut size={14} /></button></div></header>
      <main className="max-w-5xl mx-auto px-4 sm:px-8 py-6 lg:py-10 pb-28 lg:pb-12"><Outlet /></main>
      {profile.role === 'student' && <AIAssistant />}
      <nav className="lg:hidden fixed bottom-3 inset-x-3 z-30 card flex justify-around p-1.5 backdrop-blur bg-surface/90">
        {items.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === HOME[profile.role] || to === '/inbox'} aria-label={label}
          className={({ isActive }) => `relative flex-1 flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-bold ${isActive ? 'bg-brand text-white' : 'text-mut'}`}>
          <Icon size={18} />{label.split(' ')[0]}{label === 'Inbox' && unread > 0 && <span className="absolute top-0.5 right-3 size-2 rounded-full bg-gold" />}</NavLink>)}</nav>
    </div></div>
}
