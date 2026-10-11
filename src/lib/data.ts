import { supabase } from './supabase'
import { addDays, iso, type Taken } from './logic'
export async function fetchTaken(kind: 'equipment' | 'faculty', days = 60): Promise<Taken[]> {
  const { data, error } = await supabase.rpc(kind === 'equipment' ? 'equipment_taken' : 'faculty_taken', { p_from: iso(new Date()), p_to: iso(addDays(new Date(), days)) })
  if (error) throw new Error(error.message)
  return (data as Taken[]) ?? []
}
