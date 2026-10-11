import type { Faculty, Taken } from '../logic'

export interface Eq { id: number; name: string; category: string; location: string }
export interface TeamRole { id: number; request_id: number; dept: string; specialization: string; filled_by: string | null; filled_name: string | null; details?: string | null }
export interface Team { id: number; creator_id: string; creator_name: string; creator_dept: string; title: string; description: string; team_roles: TeamRole[] }
export interface Res { id: number; creator_id: string; creator_name: string; name: string; specs: string | null; mode: 'rent' | 'buy'; till_day: string | null; expires_at: string }

/** Everything the agent may look at. Loaded through the normal (RLS-protected) queries. */
export interface AgentCtx {
  today: string
  me: { id: string; name: string; dept: string | null }
  equipment: Eq[]; faculty: Faculty[]
  eqTaken: Taken[]; facTaken: Taken[]
  teams: Team[]; resources: Res[]; myOffers: number[]
}

/** An action the agent *proposes*. Nothing is written until the student presses Confirm. */
export type Proposal =
  | { kind: 'equipment'; equipment_id: number; day: string; slot: string; purpose: string }
  | { kind: 'mentor'; faculty_id: number; title: string; description: string; day: string; slot: string }
  | { kind: 'team_create'; title: string; description: string; roles: { dept: string; spec: string }[] }
  | { kind: 'team_join'; role_id: number }
  | { kind: 'resource_create'; name: string; specs?: string; mode: 'rent' | 'buy'; till_day?: string }
  | { kind: 'resource_offer'; request_id: number }

export interface AgentTurn { reply: string; proposal?: Proposal; suggestions?: string[] }
export interface ChatMsg { role: 'user' | 'assistant'; content: string }
