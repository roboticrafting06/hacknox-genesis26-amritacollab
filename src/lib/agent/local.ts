// "Basic mode" agent: understands plain requests using the app's own matching logic (no API key / network needed).
// The Claude-powered Edge Function is used when deployed; this keeps the assistant working otherwise.
import { DEPTS, addDays, fmtDay, freeSlots, isWeekday, iso, matchFaculty, normTokens, parseDay, type Taken } from '../logic'
import type { AgentCtx, AgentTurn, Eq, Proposal } from './types'

// ---------------------------------------------------------------- dates & times
const WD = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MON_RE = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*'

export function parseDate(text: string, today: string): string | null {
  const s = text.toLowerCase(); const base = parseDay(today); let m: RegExpMatchArray | null
  if ((m = s.match(/\b\d{4}-\d{2}-\d{2}\b/))) return m[0]
  if (/\bday after tomorrow\b/.test(s)) return iso(addDays(base, 2))
  if (/\b(tomorrow|tmrw|tmr)\b/.test(s)) return iso(addDays(base, 1))
  if (/\btoday\b/.test(s)) return today
  if (/\bnext week\b/.test(s)) return iso(addDays(base, ((8 - base.getDay()) % 7) || 7))
  const fix = (d: Date) => iso(d < base ? new Date(d.getFullYear() + 1, d.getMonth(), d.getDate()) : d)
  if ((m = s.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MON_RE}\\b`)))) return fix(new Date(base.getFullYear(), MON.indexOf(m[2]), +m[1]))
  if ((m = s.match(new RegExp(`\\b${MON_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`)))) return fix(new Date(base.getFullYear(), MON.indexOf(m[1]), +m[2]))
  if ((m = s.match(/\b(\d{1,2})\/(\d{1,2})\b/)) && +m[1] <= 31 && +m[2] <= 12) return fix(new Date(base.getFullYear(), +m[2] - 1, +m[1]))
  if ((m = s.match(/\b(this\s+|next\s+)?(monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thu|friday|fri|saturday|sat|sunday|sun)\b/))) {
    const t = WD.findIndex(w => w.startsWith(m![2].slice(0, 3))); let diff = (t - base.getDay() + 7) % 7
    if (diff === 0 && !(m[1] || '').startsWith('this')) diff = 7
    return iso(addDays(base, diff))
  }
  return null
}

export interface TimePref { hour?: number; part?: 'morning' | 'afternoon' }
export function parseTime(text: string): TimePref {
  const s = text.toLowerCase(); let m: RegExpMatchArray | null
  if ((m = s.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/))) { let h = +m[1] % 12; if (m[3] === 'pm') h += 12; return { hour: h } }
  if ((m = s.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/))) return { hour: +m[1] }
  if ((m = s.match(/\b(?:at|around|by)\s+(\d{1,2})\b(?!\s*(?:st|nd|rd|th|\/))/))) { const h = +m[1]; if (h >= 1 && h <= 23) return { hour: h < 8 ? h + 12 : h } }
  if (/\bmorning\b/.test(s)) return { part: 'morning' }
  if (/\bafternoon\b|\bevening\b/.test(s)) return { part: 'afternoon' }
  return {}
}
const startH = (slot: string) => Number(slot.slice(0, 2))
/** pick from free slots by preference; `exact` tells whether the preference was met */
function pickSlot(free: string[], pref: TimePref): { slot: string; exact: boolean } | null {
  if (!free.length) return null
  if (pref.hour !== undefined) {
    const hit = free.find(s => startH(s) === pref.hour); if (hit) return { slot: hit, exact: true }
    const near = [...free].sort((a, b) => Math.abs(startH(a) - pref.hour!) - Math.abs(startH(b) - pref.hour!))[0]; return { slot: near, exact: false }
  }
  if (pref.part) { const h = free.find(s => pref.part === 'morning' ? startH(s) < 12 : startH(s) >= 14); if (h) return { slot: h, exact: true } }
  return { slot: free[0], exact: !pref.part }
}
/** first weekday (from `from`) that has a slot matching the preference */
function findSlot(taken: Taken[], from: string, pref: TimePref, today: string, horizon = 45) {
  let d = parseDay(from < today ? today : from)
  for (let i = 0; i < horizon; i++, d = addDays(d, 1)) {
    if (!isWeekday(d)) continue
    const p = pickSlot(freeSlots(taken, iso(d)), pref); if (p && (p.exact || pref.hour === undefined)) return { day: iso(d), ...p }
  }
  return null
}
const URGENT = /\b(asap|urgent|urgently|soon|earliest|immediately|right away|as soon as)\b/i
/** with no date given, start ~a week out: the app scores near dates as urgency, which the student never claimed */
const startFrom = (text: string, today: string) => URGENT.test(text) ? today : iso(addDays(parseDay(today), 6))
const when = (day: string, slot: string) => `${fmtDay(day)} at ${slot}`
const book = (name: string, day: string, slot: string) => `Book ${name} on ${day} at ${slot.slice(0, 5)}`

// ---------------------------------------------------------------- equipment
const EQ_HINTS: [RegExp, RegExp][] = [[/\b3-?d\b|print/, /3D/i], [/\bcnc\b|milling|machining/, /CNC|Machining/i], [/robot|\bnao\b|humanoid/, /NAO|Humanoid/i],
  [/camera|imaging|hyperspectral|high.?speed/, /Camera/i], [/tensile|compression|strength|\butm\b|universal testing/, /Universal Testing/i], [/weld|\bfsw\b|friction/, /Friction/i],
  [/\bsls\b|sinter/, /SLS/i], [/acoustic|emission/, /Acoustic/i], [/screen.?print/, /Screen/i]]
const head = (t: string) => t.split(/\b(?:for|because|since)\b/i)[0]
function rankEquipment(text: string, eq: Eq[]) {
  const q = text.toLowerCase(); const qt = new Set(normTokens(text))
  const scored = eq.map(e => { let s = 0
    for (const [re, name] of EQ_HINTS) if (re.test(q) && name.test(e.name)) s += 3
    for (const t of new Set(normTokens(`${e.name} ${e.category}`))) if (qt.has(t) && !['lab', 'machine', 'equipment'].includes(t)) s += 1
    return { e, s } }).filter(x => x.s > 0).sort((a, b) => b.s - a.s)
  return scored.length ? scored.filter(x => x.s >= scored[0].s - 2).map(x => x.e).sort((a, b) => a.id - b.id) : []
}
const NOISE = /\b(today|tomorrow|tmrw|tmr|day after tomorrow|next week|(this|next)\s+\w*day|\d{4}-\d{2}-\d{2}|(at|around|by)\s+\d{1,2}(:\d{2})?\s*(am|pm)?|\d{1,2}(:\d{2})?\s*(am|pm)|morning|afternoon|evening)\b/gi
function purposeFrom(text: string): string | null {
  const t = text.replace(NOISE, ' ')
  const m = t.match(/\b(?:for|because|since)\s+(.{8,})/i) ?? t.match(/\bto\s+(?!book|get|use|reserve|have|borrow|rent|request|do|see|check)(.{8,})/i); if (!m) return null
  const p = m[1].replace(/\s+/g, ' ').trim().replace(/^[,.\s]+|[,.\s]+$/g, ''); return p.length >= 8 ? p : null
}

function equipmentTurn(text: string, latest: string, ctx: AgentCtx): AgentTurn {
  const cands = rankEquipment(head(latest), ctx.equipment).length ? rankEquipment(head(latest), ctx.equipment) : rankEquipment(head(text), ctx.equipment).length ? rankEquipment(head(text), ctx.equipment) : rankEquipment(text, ctx.equipment)
  if (!cands.length) return { reply: 'Which equipment do you need? Tell me what you want to do (e.g. “print a prototype”, “test material strength”, “record fast motion”) or name the machine.',
    suggestions: ['I need a 3D printer', 'I need a high speed camera', 'I need the CNC machine', 'I need the NAO robot'] }
  const purpose = purposeFrom(text)
  if (!purpose) return { reply: `Got it — ${cands[0].name}${cands.length > 1 ? ` (or one of ${cands.length - 1} similar)` : ''}. What will you use it for? A line helps the lab assistant prioritise your request.`,
    suggestions: ['For my final-year project', 'For learning and practice'] }
  const lt = parseTime(latest); const pref = lt.hour !== undefined || lt.part ? lt : parseTime(text); const day = parseDate(latest, ctx.today) ?? parseDate(text, ctx.today)
  if (day) {
    const d = parseDay(day)
    if (day < ctx.today) return { reply: 'That date has already passed — which upcoming weekday works for you?' }
    if (!isWeekday(d)) return { reply: 'Slots run Monday to Friday only. Which weekday would you like?', suggestions: ['Monday morning', 'Next week'] }
  }
  type Option = { e: Eq; day: string; slot: string; exact: boolean }
  const opts: Option[] = []
  for (const e of cands.slice(0, 4)) {
    const t = ctx.eqTaken.filter(x => x.id === e.id)
    const r = day ? (() => { const p = pickSlot(freeSlots(t, day!), pref); return p ? { day: day!, ...p } : null })() : findSlot(t, startFrom(text, ctx.today), pref, ctx.today)
    if (r) opts.push({ e, ...r })
  }
  if (!opts.length) {
    const alt = findSlot(ctx.eqTaken.filter(x => x.id === cands[0].id), day ?? ctx.today, {}, ctx.today)
    return { reply: day ? `${cands[0].name} is fully booked on ${fmtDay(day)}.${alt ? ` The next free slot is ${when(alt.day, alt.slot)}.` : ''}` : `No free slot found for ${cands[0].name} in the next 45 days.`,
      suggestions: alt ? [book(cands[0].name, alt.day, alt.slot)] : undefined }
  }
  opts.sort((a, b) => Number(b.exact) - Number(a.exact) || (a.day + a.slot).localeCompare(b.day + b.slot)); const best = opts[0]
  const note = !best.exact && pref.hour !== undefined ? ` (${String(pref.hour).padStart(2, '0')}:00 isn't free — this is the closest slot)` : ''
  const prop: Proposal = { kind: 'equipment', equipment_id: best.e.id, day: best.day, slot: best.slot, purpose: purpose.slice(0, 400) }
  return { reply: `Best fit: ${best.e.name} (${best.e.location}) on ${when(best.day, best.slot)}${note}. Please confirm below and I'll submit the request.${day || URGENT.test(text) ? '' : ' (No date given, so I picked the earliest free slot from next week — say “tomorrow” or “asap” if you need it sooner.)'}`, proposal: prop,
    suggestions: opts.slice(1, 3).map(o => book(o.e.name, o.day, o.slot)) }
}

// ---------------------------------------------------------------- mentors
function mentorTurn(text: string, latest: string, ctx: AgentCtx): AgentTurn {
  const hits = matchFaculty(ctx.faculty, text)
  if (!hits.length) return { reply: 'I couldn’t find a mentor for that. Tell me the topic in a few keywords (e.g. “ROS2 and robot vision”, “biomedical instrumentation”, “embedded SoC design”).',
    suggestions: ['I need mentorship in ROS2', 'I need guidance in biomedical instrumentation'] }
  const f = hits[0]; const lt = parseTime(latest); const pref = lt.hour !== undefined || lt.part ? lt : parseTime(text); const day = parseDate(latest, ctx.today) ?? parseDate(text, ctx.today)
  if (day && (day < ctx.today || !isWeekday(parseDay(day)))) return { reply: 'Please give me an upcoming weekday (Mon–Fri) for the meeting.' }
  const slot = findSlot(ctx.facTaken.filter(x => x.id === f.id), day ?? startFrom(text, ctx.today), pref, ctx.today)
  if (!slot) return { reply: `${f.name} has no free slot in the next 45 days.` }
  const title = `Mentorship: ${f.hits.slice(0, 4).join(', ')}`.slice(0, 120)
  return { reply: `${f.name} (${f.designation}, ${f.department}) is the best match — ${f.pct}% on ${f.hits.join(', ')}. Earliest meeting: ${when(slot.day, slot.slot)}${day ? '' : ' (say “asap” if you need it sooner)'}. Confirm below to send the request.`,
    proposal: { kind: 'mentor', faculty_id: f.id, title, description: text.replace(/\s+/g, ' ').trim().slice(0, 600), day: slot.day, slot: slot.slot } }
}

// ---------------------------------------------------------------- resources
const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/^[,.\s]+|[,.\s]+$/g, '')
function resourceTurn(text: string, ctx: AgentCtx): AgentTurn {
  const offer = text.match(/\bi\s+(?:have|got|own|can lend|can give)\s+(?:a|an|the|some)?\s*(.+)/i)
  if (offer && !/\b(rent|buy|borrow|need)\b/i.test(text)) {
    const qt = new Set(normTokens(offer[1]))
    const best = ctx.resources.filter(r => r.creator_id !== ctx.me.id && !ctx.myOffers.includes(r.id))
      .map(r => ({ r, s: normTokens(`${r.name} ${r.specs ?? ''}`).filter(t => qt.has(t)).length })).filter(x => x.s > 0).sort((a, b) => b.s - a.s)[0]
    return best ? { reply: `${best.r.creator_name} is looking to ${best.r.mode} “${best.r.name}”. Want me to tell them you have it? Your emails get exchanged.`, proposal: { kind: 'resource_offer', request_id: best.r.id } }
      : { reply: 'No open request matches that right now.' }
  }
  const mode: 'rent' | 'buy' = /\b(buy|purchase)\b/i.test(text) ? 'buy' : 'rent'
  const nm = text.match(/\b(?:rent|borrow|buy|purchase|need|want|looking for|require|get)\s+(?:to\s+(?:rent|borrow|buy)\s+)?(?:a|an|the|some)?\s*(.+?)(?=\s+(?:till|until|by|for|from|on|tomorrow|next|this)\b|[.,;]|$)/i)
  const name = nm ? clean(nm[1]) : ''
  if (!name || name.length < 2) return { reply: 'What resource do you need (e.g. “digital oscilloscope”, “Raspberry Pi 4”)? Say whether you want to rent or buy.', suggestions: ['I want to rent a digital oscilloscope', 'I want to buy a Raspberry Pi'] }
  let till = parseDate(text.split(/\b(?:till|until|by)\b/i).slice(1).join(' ') || '', ctx.today); const defaulted = mode === 'rent' && !till
  if (mode === 'rent' && !till) till = iso(addDays(parseDay(ctx.today), 7))
  const specs = (text.match(/\b(?:specs?|specification|with)\s*[:\-]?\s*(.+)/i)?.[1] ?? '').trim().slice(0, 400)
  return { reply: `I'll post a request to ${mode} “${name}”${mode === 'rent' ? ` until ${fmtDay(till!)}${defaulted ? ' (I picked a week — tell me if you need a different date)' : ''}` : ' (buy requests stay open for 30 days)'}. Confirm below.`,
    proposal: { kind: 'resource_create', name: name.charAt(0).toUpperCase() + name.slice(1, 120), specs: specs || undefined, mode, till_day: mode === 'rent' ? till! : undefined } }
}

// ---------------------------------------------------------------- teams
const DEPT_HINTS: [RegExp, RegExp][] = [[/\bece\b|electronics|pcb|circuit|embedded|iot|vlsi|sensor|signal/, /Electronics and Communication/], [/\bmech|\bcad\b|cnc|thermal|solidworks|fabrication|3d/, /Mechanical/],
  [/\bcse\b|software|web|\bapp\b|python|coding|program|backend|frontend/, /Computer Science/], [/\baids?\b|machine learning|\bml\b|\bai\b|data|deep learning|vision/, /Artificial Intelligence/],
  [/\beee\b|power|electrical|motor/, /Electrical and Electronics/], [/civil|structur/, /Civil/], [/chem/, /Chemical/], [/aero|drone|uav|flight/, /Aerospace/]]
const guessDept = (s: string) => { const q = s.toLowerCase(); for (const [re, d] of DEPT_HINTS) if (re.test(q)) return DEPTS.find(x => d.test(x))!; return DEPTS[0] }
function teamTurn(text: string, ctx: AgentCtx): AgentTurn {
  if (/\bjoin\b/i.test(text)) {
    const qt = new Set(normTokens(text.replace(/\bjoin\b/gi, '')))
    const open = ctx.teams.filter(t => t.creator_id !== ctx.me.id && !t.team_roles.some(r => r.filled_by === ctx.me.id))
      .flatMap(t => t.team_roles.filter(r => !r.filled_by).map(r => ({ t, r, s: normTokens(`${t.title} ${t.description} ${r.specialization}`).filter(x => qt.has(x)).length + (r.dept === ctx.me.dept ? 0.5 : 0) })))
      .filter(x => x.s > 0).sort((a, b) => b.s - a.s)
    return open.length ? { reply: `“${open[0].t.title}” by ${open[0].t.creator_name} needs a ${open[0].r.specialization} (${open[0].r.dept}). Want to take that role?`, proposal: { kind: 'team_join', role_id: open[0].r.id } }
      : { reply: 'I couldn’t find an open team role matching that. Tell me your skills (e.g. “join a team that needs CAD”).' }
  }
  const lst = text.match(/\b(?:need|looking for|want|require)\s+(.+?)(?=\s+(?:for|to work|to build|who|on)\b|$)/i)?.[1]
  const roles = (lst ? lst.split(/,|\band\b|&/i) : []).map(x => clean(clean(x).replace(/^(?:a|an|the|some|\d+)\s+/i, '').replace(/\b(?:teammates?|members?|people|persons?)\b/gi, ''))).filter(x => x.length > 1).slice(0, 8)
  if (!roles.length) return { reply: 'Who do you need on the team? List the skills, e.g. “a PCB designer from ECE and a CAD person from Mechanical”.', suggestions: ['I need a PCB designer and a CAD person for a line-following robot'] }
  const proj = clean(text.match(/\b(?:for|on)\s+(?:a|an|my|our|the)?\s*(.+)$/i)?.[1] ?? '')
  const title = (proj && proj.length > 2 ? proj.charAt(0).toUpperCase() + proj.slice(1) : `Team: ${roles[0]}`).slice(0, 120)
  return { reply: `I'll post a team request “${title}” with ${roles.length} role${roles.length > 1 ? 's' : ''}. I guessed the departments — check them on the card before confirming.`,
    proposal: { kind: 'team_create', title, description: clean(text).slice(0, 600), roles: roles.map(r => ({ dept: guessDept(r), spec: r.slice(0, 80) })) } }
}

// ---------------------------------------------------------------- router
const HELP: AgentTurn = { reply: 'I can book lab equipment, find and request a faculty mentor, post or join team requests, and handle resource rent/buy requests. Just tell me what you need.',
  suggestions: ['Book a 3D printer tomorrow at 10am for my prototype', 'I need mentorship in ROS2', 'I need a PCB designer and a CAD person for my project', 'I want to rent a digital oscilloscope till Friday'] }

const BROWSE = /\b(who all|what all|which all|who are (there|available)|who is available|what are (the |my )?(options|choices)|options|choices|list|show (me )?(all|everything)|all (the )?(faculty|mentors|professors|equipment|machines|teams|resources)|what('s| is)? available|(what|which) (\w+ )?(do you have|is there|are there|is available|are available)|anyone available)\b/i
function browseTurn(intent: Intent | null, ctx: AgentCtx): AgentTurn {
  const top = (x: string, n = 3) => x.split(';').map(y => y.trim()).filter(Boolean).slice(0, n).join(', ')
  if (intent === 'mentor') return { reply: 'Faculty you can request:\n' + ctx.faculty.map(f => `• ${f.name} — ${f.designation}, ${f.department} (${top(f.interests)})`).join('\n') + '\n\nTell me your topic and I’ll pick the best match.' }
  if (intent === 'equipment') return { reply: 'Lab equipment:\n' + ctx.equipment.map(e => `• ${e.name} — ${e.location}`).join('\n') + '\n\nTell me what you want to do and when.' }
  if (intent === 'team') { const open = ctx.teams.filter(t => t.creator_id !== ctx.me.id && t.team_roles.some(r => !r.filled_by))
    return { reply: open.length ? 'Teams with open roles:\n' + open.slice(0, 8).map(t => `• ${t.title} (by ${t.creator_name}) — needs ${t.team_roles.filter(r => !r.filled_by).map(r => r.specialization).join(', ')}`).join('\n') + '\n\nSay “join <team>” to take a role.' : 'No teams have open roles right now. I can post a request for you — who do you need?' } }
  if (intent === 'resource') { const open = ctx.resources.filter(r => r.creator_id !== ctx.me.id)
    return { reply: open.length ? 'Open resource requests:\n' + open.slice(0, 8).map(r => `• ${r.creator_name} wants to ${r.mode} “${r.name}”`).join('\n') + '\n\nSay “I have a <name>” if you can help.' : 'No open resource requests right now.' } }
  return HELP
}

type Intent = 'mentor' | 'team' | 'resource' | 'equipment'
function detect(t: string, ctx: AgentCtx): Intent | null {
  const q = t.toLowerCase()
  if (/\b(mentor|mentorship|guidance|guide me|professor|faculty|supervis|advisor|expert)\w*|who to (approach|ask|contact)|someone (who|to) (knows|can|teach)|who can (help|guide|teach)/.test(q)) return 'mentor'
  if (/\bteam\w*|teammate|collaborator|\bjoin\b|\b(designer|developer|programmer|person|people|members?)\b/.test(q)) return 'team'
  if (/\b(rent|borrow|buy|purchase|resources?|lend)\b|\bi (have|got|own) /.test(q)) return 'resource'
  if (rankEquipment(head(t), ctx.equipment).length || /\b(book|equipment|slots?|labs?|machines?)\b/.test(q)) return 'equipment'
  return null
}

/** thread = the user's messages since the last finished request; latest = the newest message (it wins on dates/times/choices) */
export function localAgent(thread: string, latest: string, ctx: AgentCtx): AgentTurn {
  const iL = detect(latest, ctx), iT = detect(thread, ctx)
  const intent = iL ?? iT; const text = iL && iT && iL !== iT ? latest : thread
  if (BROWSE.test(latest)) return browseTurn(intent, ctx)
  if (intent === 'mentor') return mentorTurn(text, latest, ctx)
  if (intent === 'team') return teamTurn(text, ctx)
  if (intent === 'resource') return resourceTurn(text, ctx)
  if (intent === 'equipment') return equipmentTurn(text, latest, ctx)
  return HELP
}
