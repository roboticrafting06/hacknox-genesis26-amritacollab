import { supabase } from '../supabase'
import { ok } from '../hooks'
import { fetchTaken } from '../data'
import { ANY_DEPT, DEPTS, SLOTS, addDays, fmtDay, freeSlots, isWeekday, iso, nextAvailable, parseDay, prioritise, type Faculty } from '../logic'
import { localAgent } from './local'
import { buildBody, parseCompletion } from './prompt'
import type { AgentCtx, AgentTurn, ChatMsg, Eq, Proposal, Res, Team } from './types'

export type { AgentCtx, AgentTurn, ChatMsg, Proposal } from './types'

// ------------------------------------------------------------------ context (same RLS-protected queries the pages use)
export async function loadContext(me: { id: string; name: string; dept: string | null }): Promise<AgentCtx> {
  const [equipment, faculty, eqTaken, facTaken, teams, resources, offers] = await Promise.all([
    supabase.from('equipment').select('*').order('category').order('name').then(ok) as Promise<Eq[]>,
    supabase.from('faculty').select('*').order('name').then(ok) as Promise<Faculty[]>,
    fetchTaken('equipment', 45), fetchTaken('faculty', 45),
    supabase.from('team_requests').select('*, team_roles(*)').order('id', { ascending: false }).limit(40).then(ok) as Promise<Team[]>,
    supabase.from('resource_requests').select('*').order('id', { ascending: false }).limit(40).then(ok) as Promise<Res[]>,
    supabase.from('resource_offers').select('request_id').eq('offerer_id', me.id).then(ok) as Promise<{ request_id: number }[]>,
  ])
  return { today: iso(new Date()), me, equipment, faculty, eqTaken, facTaken, teams, resources, myOffers: offers.map(o => o.request_id) }
}

/** compact view sent to the Edge Function (only what the model needs; no emails) */
function slim(c: AgentCtx) {
  const group = (rows: { id: number; day: string; slot: string }[]) => { const o: Record<number, Record<string, string[]>> = {}
    for (const r of rows) ((o[r.id] ??= {})[r.day] ??= []).push(r.slot); return o }
  const upcoming: string[] = []; for (let d = parseDay(c.today), n = 0; n < 21 && upcoming.length < 15; d = addDays(d, 1), n++) if (isWeekday(d)) upcoming.push(`${iso(d)} ${d.toLocaleDateString('en-US', { weekday: 'long' })}`)
  const tm = addDays(parseDay(c.today), 1)
  return { today: `${c.today} ${parseDay(c.today).toLocaleDateString('en-US', { weekday: 'long' })}`, tomorrow: `${iso(tm)} ${tm.toLocaleDateString('en-US', { weekday: 'long' })}`,
    bookable_days_next_3_weeks: upcoming, suggest_from: upcoming.find(u => u.slice(0, 10) >= iso(addDays(parseDay(c.today), 6))) ?? upcoming[upcoming.length - 1], me: { name: c.me.name, dept: c.me.dept },
    slots: SLOTS, departments: DEPTS,
    equipment: c.equipment, booked_equipment_slots: group(c.eqTaken),
    faculty: c.faculty.map(f => ({ id: f.id, name: f.name, designation: f.designation, department: f.department, interests: f.interests, research: f.research })), booked_faculty_slots: group(c.facTaken),
    open_team_roles: c.teams.filter(t => t.creator_id !== c.me.id && !t.team_roles.some(r => r.filled_by === c.me.id)).map(t => ({ title: t.title, by: t.creator_name, description: t.description.slice(0, 200),
      roles: t.team_roles.filter(r => !r.filled_by).map(r => ({ role_id: r.id, dept: r.dept, specialization: r.specialization })) })).filter(t => t.roles.length),
    open_resource_requests: c.resources.filter(r => r.creator_id !== c.me.id && !c.myOffers.includes(r.id)).map(r => ({ request_id: r.id, name: r.name, specs: r.specs, mode: r.mode, requester: r.creator_name })) }
}

// ------------------------------------------------------------------ ask: Claude (Edge Function) first, basic mode as fallback
// Where the AI request goes:
//  1. VITE_OPENROUTER_KEY set  -> straight from the browser to OpenRouter (quick testing only: the key is visible to anyone using the site)
//  2. otherwise                -> the Supabase Edge Function `ai-agent` (key stays server-side)
//  3. if either fails          -> built-in basic mode
const DIRECT_KEY = import.meta.env.VITE_OPENROUTER_KEY as string | undefined
const MODEL = (import.meta.env.VITE_AI_MODEL as string | undefined) || 'google/gemini-2.5-flash'

async function callAI(history: ChatMsg[], ctx: AgentCtx): Promise<{ reply: string; proposal?: unknown; suggestions?: string[] }> {
  if (DIRECT_KEY) {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST',
      headers: { Authorization: `Bearer ${DIRECT_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': window.location.origin, 'X-Title': 'AmritaCollab' },
      body: JSON.stringify(buildBody(MODEL, slim(ctx), history)) })
    const raw = await r.text(); let out: any; try { out = JSON.parse(raw) } catch { throw new Error(`OpenRouter returned non-JSON (${r.status}): ${raw.slice(0, 120)}`) }
    if (!r.ok && !out?.error) throw new Error(`OpenRouter ${r.status}`)
    return parseCompletion(out)
  }
  const { data, error } = await supabase.functions.invoke('ai-agent', { body: { messages: history.slice(-14), context: slim(ctx) } })
  if (error || !data || data.error || typeof data.reply !== 'string') throw new Error(error?.message || data?.error || 'bad response')
  return data
}

export async function askAgent(history: ChatMsg[], thread: string, latest: string, ctx: AgentCtx): Promise<AgentTurn & { mode: 'ai' | 'basic' }> {
  try {
    const data = await callAI(history, ctx)
    return { reply: data.reply || '', proposal: clean(data.proposal), suggestions: data.suggestions, mode: 'ai' }
  } catch (e) { console.warn('[assistant] AI unavailable, using basic mode:', (e as Error)?.message ?? e); return { ...localAgent(thread, latest, ctx), mode: 'basic' } }
}

const str = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const int = (v: unknown) => Math.trunc(Number(v))
/** never trust model output: coerce to the exact shapes the database accepts */
function clean(p: any): Proposal | undefined {
  if (!p || typeof p !== 'object') return undefined
  switch (p.kind) {
    case 'equipment': return { kind: 'equipment', equipment_id: int(p.equipment_id), day: str(p.day, 10), slot: str(p.slot, 11), purpose: str(p.purpose, 400) }
    case 'mentor': return { kind: 'mentor', faculty_id: int(p.faculty_id), title: str(p.title, 120), description: str(p.description, 600), day: str(p.day, 10), slot: str(p.slot, 11) }
    case 'team_create': return { kind: 'team_create', title: str(p.title, 120), description: str(p.description, 600),
      roles: (Array.isArray(p.roles) ? p.roles : []).slice(0, 8).map((r: any) => ({ dept: str(r?.dept, 80), spec: str(r?.spec, 80) })) }
    case 'team_join': return { kind: 'team_join', role_id: int(p.role_id) }
    case 'resource_create': return { kind: 'resource_create', name: str(p.name, 120), specs: str(p.specs, 400) || undefined, mode: p.mode === 'buy' ? 'buy' : 'rent', till_day: str(p.till_day, 10) || undefined }
    case 'resource_offer': return { kind: 'resource_offer', request_id: int(p.request_id) }
  }
}

// ------------------------------------------------------------------ validate + describe (what the confirmation card shows)
export interface Card { title: string; rows: [string, string][]; priority?: { priority: 'high' | 'low'; reason: string }; confirm: string; link: [string, string] }
export type Checked = { card: Card } | { problem: string; suggestions?: string[] }

const freeFor = (taken: AgentCtx['eqTaken'], id: number, day: string, slot: string) => freeSlots(taken.filter(t => t.id === id), day).includes(slot)
const dayOk = (day: string, today: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= today && isWeekday(parseDay(day))

export function check(p: Proposal, c: AgentCtx): Checked {
  const alt = (taken: AgentCtx['eqTaken'], id: number, name: string, from: string) =>
    nextAvailable(taken.filter(t => t.id === id), from < c.today ? c.today : from, 3).map(a => `Book ${name} on ${a.day} at ${a.slot.slice(0, 5)}`)
  switch (p.kind) {
    case 'equipment': {
      const e = c.equipment.find(x => x.id === p.equipment_id); if (!e) return { problem: 'I couldn’t find that equipment. Which one do you want?' }
      if (!p.purpose) return { problem: 'What will you use it for? A short line is required for the request.' }
      if (!dayOk(p.day, c.today) || !SLOTS.includes(p.slot)) return { problem: 'That date/time isn’t bookable (slots are Mon–Fri, future only). Which weekday and time suit you?' }
      if (!freeFor(c.eqTaken, e.id, p.day, p.slot)) return { problem: `${e.name} isn’t free on ${fmtDay(p.day)} at ${p.slot}. Here are the next open slots:`, suggestions: alt(c.eqTaken, e.id, e.name, p.day) }
      const pr = prioritise(p.purpose, p.day)
      return { card: { title: 'Equipment booking request', rows: [['Equipment', e.name], ['Lab', e.location], ['When', `${fmtDay(p.day)} · ${p.slot}`], ['Purpose', p.purpose]], priority: pr, confirm: 'Confirm & book', link: ['/app/equipment?tab=mine', 'View my requests'] } }
    }
    case 'mentor': {
      const f = c.faculty.find(x => x.id === p.faculty_id); if (!f) return { problem: 'I couldn’t find that faculty member.' }
      if (!p.title || !p.description) return { problem: 'Tell me a bit about your project so I can write the request.' }
      if (!dayOk(p.day, c.today) || !SLOTS.includes(p.slot)) return { problem: 'Please give me an upcoming weekday (Mon–Fri) and time for the meeting.' }
      if (!freeFor(c.facTaken, f.id, p.day, p.slot)) return { problem: `${f.name} already has a meeting at that time. Next free slots:`, suggestions: nextAvailable(c.facTaken.filter(t => t.id === f.id), p.day, 3).map(a => `Request ${f.name} on ${a.day} at ${a.slot.slice(0, 5)}`) }
      return { card: { title: 'Mentor request', rows: [['Mentor', `${f.name} — ${f.designation}`], ['Department', f.department], ['Title', p.title], ['Details', p.description], ['Preferred', `${fmtDay(p.day)} · ${p.slot}`]],
        priority: prioritise(p.title + ' ' + p.description, p.day), confirm: 'Confirm & send', link: ['/app/mentors?tab=mine', 'View my requests'] } }
    }
    case 'team_create': {
      if (!p.title || !p.description) return { problem: 'I need a project title and a short description for the team request.' }
      if (!p.roles.length || p.roles.some(r => !r.spec)) return { problem: 'List the people you need (1–8), each with a specialization.' }
      const roles = p.roles.map(r => ({ ...r, dept: DEPTS.includes(r.dept) || r.dept === ANY_DEPT ? r.dept : ANY_DEPT }))
      return { card: { title: 'New team request', rows: [['Project', p.title], ['About', p.description], ...roles.map((r, i): [string, string] => [`Person ${i + 1}`, `${r.spec} · ${r.dept}`])], confirm: 'Confirm & post', link: ['/app/teams?tab=mine', 'View my teams'] } }
    }
    case 'team_join': {
      const t = c.teams.find(x => x.team_roles.some(r => r.id === p.role_id)); const r = t?.team_roles.find(x => x.id === p.role_id)
      if (!t || !r) return { problem: 'That team role no longer exists.' }
      if (r.filled_by) return { problem: 'Someone just took that role.' }
      if (t.creator_id === c.me.id) return { problem: 'That’s your own team request.' }
      if (t.team_roles.some(x => x.filled_by === c.me.id)) return { problem: 'You’ve already joined that team.' }
      if (r.dept !== ANY_DEPT && r.dept !== c.me.dept) return { problem: `That role is only open to ${r.dept} students.` }
      return { card: { title: 'Join a team', rows: [['Team', t.title], ['Created by', `${t.creator_name} · ${t.creator_dept}`], ['Your role', `${r.specialization} · ${r.dept}`]], confirm: 'Confirm & join', link: ['/app/teams?tab=mine', 'View my teams'] } }
    }
    case 'resource_create': {
      if (!p.name) return { problem: 'What resource do you need?' }
      if (p.mode === 'rent' && (!p.till_day || p.till_day < c.today)) return { problem: 'Until which date do you need it? (rent requests need a “till” date)' }
      return { card: { title: `Resource request (${p.mode})`, rows: [['Resource', p.name], ...(p.specs ? [['Specs', p.specs] as [string, string]] : []), ['Mode', p.mode === 'rent' ? `Rent till ${fmtDay(p.till_day!)}` : 'Buy (open for 30 days)']], confirm: 'Confirm & post', link: ['/app/resources?tab=mine', 'View my resources'] } }
    }
    case 'resource_offer': {
      const r = c.resources.find(x => x.id === p.request_id); if (!r) return { problem: 'That request has expired or was deleted.' }
      if (r.creator_id === c.me.id) return { problem: 'That’s your own request.' }
      if (c.myOffers.includes(r.id)) return { problem: 'You’ve already offered this.' }
      return { card: { title: 'Offer a resource', rows: [['Requested', `${r.name} (${r.mode})`], ['By', r.creator_name], ['Effect', 'You and the requester get each other’s email in Inbox']], confirm: 'Confirm: I have it', link: ['/app/resources?tab=mine', 'View my resources'] } }
    }
  }
}

// ------------------------------------------------------------------ execute (only ever called after the student presses Confirm)
// These are the very same writes the pages perform, so every database rule/RLS policy still applies.
export async function execute(p: Proposal): Promise<string> {
  const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message) }
  switch (p.kind) {
    case 'equipment': { const pr = prioritise(p.purpose, p.day)
      fail((await supabase.from('equipment_bookings').insert({ equipment_id: p.equipment_id, purpose: p.purpose, day: p.day, slot: p.slot, priority: pr.priority, score: pr.score, reason: pr.reason })).error)
      return 'Booking request submitted. The lab assistant will review it.' }
    case 'mentor': { const pr = prioritise(p.title + ' ' + p.description, p.day)
      fail((await supabase.from('mentor_requests').insert({ faculty_id: p.faculty_id, title: p.title, description: p.description, day: p.day, slot: p.slot, priority: pr.priority, score: pr.score, reason: pr.reason, attachment_path: null })).error)
      return 'Mentor request sent. You’ll be notified when the faculty responds.' }
    case 'team_create': {
      const t = await supabase.from('team_requests').insert({ title: p.title, description: p.description }).select('id').single(); fail(t.error)
      const r = await supabase.from('team_roles').insert(p.roles.map(x => ({ request_id: t.data!.id, dept: DEPTS.includes(x.dept) || x.dept === ANY_DEPT ? x.dept : ANY_DEPT, specialization: x.spec })))
      if (r.error) { await supabase.from('team_requests').delete().eq('id', t.data!.id); throw new Error(r.error.message) }
      return 'Team request posted.' }
    case 'team_join': fail((await supabase.rpc('accept_team_role', { p_role: p.role_id })).error); return 'You joined the team! Contact details are in your Inbox.'
    case 'resource_create':
      fail((await supabase.from('resource_requests').insert({ name: p.name, specs: p.specs || null, mode: p.mode, till_day: p.mode === 'rent' ? p.till_day : null,
        expires_at: p.mode === 'rent' ? p.till_day : iso(new Date()), image_path: null })).error)   // server trigger recomputes expires_at
      return 'Resource request posted.'
    case 'resource_offer': fail((await supabase.rpc('offer_resource', { p_req: p.request_id })).error); return 'Done — contact details exchanged (see your Inbox).'
  }
}
