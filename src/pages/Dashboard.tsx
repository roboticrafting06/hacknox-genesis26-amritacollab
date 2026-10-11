import { Link } from 'react-router-dom'
import { ArrowUpRight, Cpu, GraduationCap, Package, Users } from 'lucide-react'
import { useAuth } from '../lib/auth'

const T = [['/app/equipment', Cpu, 'Equipment', 'See what is free and request a slot.', 'sm:col-span-2 bg-brand text-white', true],
  ['/app/mentors', GraduationCap, 'Faculty mentors', 'Describe your need, get matched.', '', false],
  ['/app/teams', Users, 'Team requests', 'Post a team or join one.', '', false],
  ['/app/resources', Package, 'Resources', 'Rent, buy or lend what you have.', 'sm:col-span-2', false]] as const

export default function Dashboard() {
  const { profile } = useAuth(); const h = new Date().getHours()
  return <div>
    <div className="animate-up mb-8"><p className="text-mut text-sm font-semibold">{h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}</p>
      <h1 className="font-display text-4xl font-bold tracking-tight">Hi, {profile?.name.split(' ')[0]} <span className="inline-block animate-float">👋</span></h1>
      <p className="text-mut mt-1">{profile?.dept}{profile?.year ? ` · ${profile.year}` : ''}</p></div>
    <div className="grid sm:grid-cols-3 gap-4">
      {T.map(([to, Icon, t, d, cls, hero], i) => <Link key={to} to={to} style={{ animationDelay: `${i * 70}ms` }}
        className={`group card animate-up p-6 min-h-40 flex flex-col justify-between hover:-translate-y-1 transition ${cls}`}>
        <div className="flex justify-between"><span className={`size-12 rounded-2xl grid place-items-center ${hero ? 'bg-white/20' : 'bg-soft text-brand'}`}><Icon size={24} /></span>
          <ArrowUpRight className="opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition" /></div>
        <div><h3 className="font-display text-2xl font-bold">{t}</h3><p className={`text-sm mt-1 ${hero ? 'text-white/80' : 'text-mut'}`}>{d}</p></div></Link>)}
    </div></div>
}
