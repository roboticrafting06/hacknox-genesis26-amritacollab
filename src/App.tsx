import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactElement } from 'react'
import { HOME, useAuth, type Role } from './lib/auth'
import { configured } from './lib/supabase'
import Shell from './components/Shell'
import Landing from './pages/Landing'
import { Login, Register } from './pages/Auth'
import Dashboard from './pages/Dashboard'
import Equipment from './pages/Equipment'
import Mentors from './pages/Mentors'
import Teams from './pages/Teams'
import Resources from './pages/Resources'
import InboxPage from './pages/Inbox'
import LabQueue from './pages/LabQueue'
import FacultyQueue from './pages/FacultyQueue'

function Guard({ roles, children }: { roles?: Role[]; children: ReactElement }) {
  const { session, profile, loading } = useAuth()
  if (loading || (session && !profile)) return <div className="min-h-screen grid place-items-center"><div className="size-10 rounded-full border-4 border-soft border-t-brand animate-spin" /></div>
  if (!session || !profile) return <Navigate to="/" replace />
  if (roles && !roles.includes(profile.role)) return <Navigate to={HOME[profile.role]} replace />
  return children
}

export default function App() {
  const { profile } = useAuth()
  if (!configured) return <div className="min-h-screen grid place-items-center p-6"><div className="card p-8 max-w-lg">
    <h1 className="font-display text-2xl font-bold">Almost there</h1>
    <p className="text-mut mt-2 text-sm">Copy <code>.env.example</code> to <code>.env</code> and set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, then restart <code>npm run dev</code>.</p></div></div>
  return <Routes>
    <Route path="/" element={profile ? <Navigate to={HOME[profile.role]} replace /> : <Landing />} />
    <Route path="/login/:role" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route element={<Guard><Shell /></Guard>}>
      <Route path="/inbox" element={<InboxPage />} />
      <Route path="/app" element={<Guard roles={['student']}><Dashboard /></Guard>} />
      <Route path="/app/equipment" element={<Guard roles={['student']}><Equipment /></Guard>} />
      <Route path="/app/mentors" element={<Guard roles={['student']}><Mentors /></Guard>} />
      <Route path="/app/teams" element={<Guard roles={['student']}><Teams /></Guard>} />
      <Route path="/app/resources" element={<Guard roles={['student']}><Resources /></Guard>} />
      <Route path="/lab" element={<Guard roles={['lab']}><LabQueue /></Guard>} />
      <Route path="/faculty" element={<Guard roles={['faculty']}><FacultyQueue /></Guard>} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
}
