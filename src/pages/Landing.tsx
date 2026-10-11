import { Link } from 'react-router-dom'
import { ArrowRight, Cpu, GraduationCap, Package, ShieldCheck, Users, Wrench } from 'lucide-react'
import { Logo } from '../components/Shell'

const F = [[Cpu, 'Book lab equipment', 'Pick a slot on a live calendar. Urgent work is auto-prioritised for the lab assistant.'],
  [GraduationCap, 'Find your mentor', 'Describe what you need in plain words — get matched to the right faculty instantly.'],
  [Users, 'Build project teams', 'Post the roles you need across departments, or join a team that needs you.'],
  [Package, 'Share resources', 'Rent or buy from fellow students. Upload a photo and let people reach out.']] as const

export default function Landing() {
  return <div className="relative overflow-hidden min-h-screen">
    <div className="mesh absolute inset-0 -z-10" />
    <header className="max-w-6xl mx-auto px-5 py-5 flex items-center justify-between"><Logo />
      <Link to="/login/student" className="btn btn-ghost">Sign in</Link></header>
    <section className="max-w-6xl mx-auto px-5 pt-12 pb-20 grid lg:grid-cols-[1.1fr_.9fr] gap-12 items-center">
      <div className="animate-up">
        <span className="chip"><ShieldCheck size={14} />Built for Amrita students, faculty &amp; labs</span>
        <h1 className="font-display text-5xl sm:text-6xl font-bold leading-[1.05] tracking-tight mt-5">Everything on campus,<br /><span className="text-brand">one collab away.</span></h1>
        <p className="text-lg text-mut mt-5 max-w-xl">Book equipment, meet mentors, assemble teams and trade resources — without the chasing, the spreadsheets or the WhatsApp groups.</p>
        <div className="flex flex-wrap gap-3 mt-8">
          <Link to="/register" className="btn text-base px-6 py-3">Get started <ArrowRight size={18} /></Link>
          <Link to="/login/student" className="btn btn-ghost text-base px-6 py-3">Student login</Link></div>
        <div className="flex gap-5 mt-8 text-sm text-mut">
          <Link className="hover:text-brand underline-offset-4 hover:underline flex items-center gap-1.5" to="/login/lab"><Wrench size={14} />Lab assistant</Link>
          <Link className="hover:text-brand underline-offset-4 hover:underline flex items-center gap-1.5" to="/login/faculty"><GraduationCap size={14} />Faculty</Link></div>
      </div>
      <div className="relative hidden lg:block h-[420px]" aria-hidden>
        {[['Ultimaker S5', 'Tomorrow · 10:00', 'bg-ok', 'top-0 left-4 rotate-[-4deg]'], ['Mentor match 92%', 'ROS2 · Dr. Adarsh', 'bg-gold', 'top-36 right-0 rotate-[3deg] [animation-delay:-2s]'], ['Team: Rover-X', '2 of 4 roles filled', 'bg-brand', 'bottom-0 left-12 rotate-[-2deg] [animation-delay:-4s]']].map(([a, b, c, pos]) =>
          <div key={a} className={`card absolute ${pos} w-64 p-4 animate-float backdrop-blur`}><div className="flex items-center gap-3"><span className={`size-10 rounded-xl ${c}`} />
            <div><p className="font-bold">{a}</p><p className="text-xs text-mut">{b}</p></div></div></div>)}
      </div>
    </section>
    <section className="max-w-6xl mx-auto px-5 pb-24 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {F.map(([Icon, t, d], i) => <div key={t} className="card p-5 animate-up hover:-translate-y-1 transition" style={{ animationDelay: `${i * 80}ms` }}>
        <div className="size-11 rounded-xl bg-soft text-brand grid place-items-center mb-4"><Icon size={22} /></div><h3 className="font-bold">{t}</h3><p className="text-sm text-mut mt-1.5">{d}</p></div>)}
    </section>
  </div>
}
