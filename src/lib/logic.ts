// Ported from the Flask version: slots, priority scoring, mentor matching.
export const SLOTS = ['09:00-10:00','10:00-11:00','11:00-12:00','12:00-13:00','14:00-15:00','15:00-16:00','16:00-17:00']
export const DEPTS = ['Mechanical Engineering','Electronics and Communication Engineering','Computer Science and Engineering',
  'Electrical and Electronics Engineering','Artificial Intelligence and Data Science','Civil Engineering','Chemical Engineering','Aerospace Engineering']

export const ANY_DEPT = 'Any department'
export type Taken = { id: number; day: string; slot: string }

export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export const parseDay = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
export const isWeekday = (d: Date) => d.getDay() >= 1 && d.getDay() <= 5
export const fmtDay = (s: string) => parseDay(s).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
export const fmtTime = (s: string) => new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function freeSlots(taken: Taken[], day: string): string[] {
  const t = new Set(taken.filter(x => x.day === day).map(x => x.slot))
  let free = SLOTS.filter(s => !t.has(s))
  if (day === iso(new Date())) { const h = new Date().getHours(); free = free.filter(s => Number(s.slice(0, 2)) > h) }
  return free
}

export function nextAvailable(taken: Taken[], from: string, n = 4, horizon = 60) {
  const out: { day: string; slot: string; label: string }[] = []
  let d = parseDay(from < iso(new Date()) ? iso(new Date()) : from)
  for (let i = 0; i < horizon && out.length < n; i++, d = addDays(d, 1)) {
    if (!isWeekday(d)) continue
    for (const s of freeSlots(taken, iso(d))) { out.push({ day: iso(d), slot: s, label: `${fmtDay(iso(d))} · ${s}` }); if (out.length >= n) break }
  }
  return out
}

const HIGH: Record<string, number> = { thesis: 3, dissertation: 3, deadline: 3, submission: 2, competition: 3, eyrc: 3, hackathon: 2, paper: 2,
  publication: 3, research: 2, final: 2, capstone: 3, urgent: 3, demo: 2, exam: 2, prototype: 2, funded: 2, patent: 2, viva: 2,
  conference: 2, journal: 2, project: 1, review: 1 }
const LOW: Record<string, number> = { practice: -2, learn: -1, learning: -1, curious: -2, fun: -2, hobby: -2, trying: -1, explore: -1,
  casual: -2, personal: -1, just: -1, experiment: -1, testing: -1 }

export function prioritise(text: string, day?: string) {
  let score = 0; const signals: string[] = []
  for (const w of (text || '').toLowerCase().match(/[a-z0-9]+/g) || []) {
    const v = HIGH[w] ?? LOW[w]
    if (v && !signals.includes(w)) { score += v; signals.push(w) }
  }
  if (day) {
    const gap = Math.round((parseDay(day).getTime() - parseDay(iso(new Date())).getTime()) / 864e5)
    if (gap <= 2) { score += 2; signals.push('needed within 2 days') } else if (gap <= 5) { score += 1; signals.push('needed this week') }
  }
  return { priority: (score >= 3 ? 'high' : 'low') as 'high' | 'low', score,
    reason: signals.length ? 'Signals: ' + signals.join(', ') : 'No urgency signals found' }
}

// ---- text matching
const STOP = new Set(`i me my we our need needs want wants help helps mentorship mentor mentoring guidance guide with in on for to the a an and or of about looking someone who can get some any is am would like please advice supervision supervise project projects work working regarding from at by as be it this that learn_to start starting build building make making doing do`.split(' '))
const ALIAS: Record<string, string> = { ros2: 'ros', ros1: 'ros', opencv: 'vision', cv: 'vision', ml: 'learn', ai: 'learn', dl: 'deep', nn: 'neural',
  iot: 'embedded', arduino: 'embedded', raspberry: 'embedded', microcontroller: 'embedded', farm: 'agriculture', agri: 'agriculture',
  medical: 'biomedical', health: 'biomedical', ecg: 'biomedical', eeg: 'biomedical', drone: 'robot', uav: 'robot', slam: 'vision', cad: 'design' }
const stem = (w: string) => { for (const suf of ['ics', 'ic', 'ing', 'ed', 's']) if (w.endsWith(suf) && w.length - suf.length >= 3) return w.slice(0, -suf.length); return w }
const norm1 = (w: string) => { w = ALIAS[w] ?? w; w = stem(w); return ALIAS[w] ?? w }
const RELATED_RAW: Record<string, string[]> = { ros: ['robot', 'vision'], learn: ['deep', 'cnn', 'vision'], deep: ['learn', 'cnn'],
  vision: ['cnn', 'detection'], embedded: ['soc', 'processor'], biomedical: ['instrumentation', 'sensor'], robot: ['manipulator', 'gripper'] }
const RELATED: Record<string, string[]> = Object.fromEntries(Object.entries(RELATED_RAW).map(([k, v]) => [norm1(k), v.map(norm1)]))

export const normPairs = (text: string) =>
  ((text || '').toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => !STOP.has(w)).map(w => [norm1(w), w] as [string, string])
export const normTokens = (text: string) => normPairs(text).map(p => p[0])

export interface Faculty { id: number; user_id: string | null; name: string; designation: string; department: string; qualification: string;
  email: string; interests: string; background: string; research: string }

export function matchFaculty(rows: Faculty[], query: string) {
  const seen = new Set<string>(); const pairs = normPairs(query).filter(([t]) => !seen.has(t) && seen.add(t))
  if (!pairs.length) return []
  const ranked: (Faculty & { score: number; pct: number; hits: string[] })[] = []
  for (const f of rows) {
    const fields: [number, Set<string>][] = [[3, new Set(normTokens(f.interests))], [2, new Set(normTokens(f.research))],
      [1, new Set(normTokens([f.background, f.designation, f.department, f.qualification].join(' ')))]]
    let score = 0; const hits: string[] = []
    for (const [t, orig] of pairs) {
      let best = Math.max(0, ...fields.filter(([, s]) => s.has(t)).map(([w]) => w))
      if (!best) for (const rel of RELATED[t] || []) best = Math.max(best, ...fields.filter(([, s]) => s.has(rel)).map(([w]) => 0.25 * w), 0)
      if (best) { score += best; hits.push(orig) }
    }
    if (score > 0) ranked.push({ ...f, score, pct: Math.min(100, Math.round(100 * score / (2 * pairs.length))), hits })
  }
  return ranked.sort((a, b) => b.score - a.score).slice(0, 3)
}
