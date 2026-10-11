import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type Role = 'student' | 'lab' | 'faculty'
export interface Profile { id: string; role: Role; name: string; email: string; dept: string | null; year: string | null }
interface Ctx { session: Session | null; profile: Profile | null; loading: boolean; signOut: () => Promise<void>; refresh: () => Promise<Profile | null> }
const AuthCtx = createContext<Ctx>(null!)
export const useAuth = () => useContext(AuthCtx)
export const HOME: Record<Role, string> = { student: '/app', lab: '/lab', faculty: '/faculty' }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async (s: Session | null) => {
    if (!s) { setProfile(null); return null }
    const { data } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle()
    setProfile((data as Profile) ?? null); return (data as Profile) ?? null
  }
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => { setSession(data.session); await load(data.session); setLoading(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); setTimeout(() => load(s), 0) })
    return () => sub.subscription.unsubscribe()
  }, [])
  return <AuthCtx.Provider value={{ session, profile, loading, signOut: async () => { await supabase.auth.signOut() },
    refresh: () => load(session) }}>{children}</AuthCtx.Provider>
}
