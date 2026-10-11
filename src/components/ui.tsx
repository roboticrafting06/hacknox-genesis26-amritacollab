import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { SLOTS, addDays, fmtDay, freeSlots, isWeekday, iso, type Taken } from '../lib/logic'
import { supabase } from '../lib/supabase'

// ---------- toasts
type T = { id: number; kind: 'ok' | 'error' | 'info'; msg: string }
const ToastCtx = createContext<(msg: string, kind?: T['kind']) => void>(() => {})
export const useToast = () => useContext(ToastCtx)
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<T[]>([])
  const push = useCallback((msg: string, kind: T['kind'] = 'ok') => {
    const id = Date.now() + Math.random(); setList(l => [...l, { id, kind, msg }]); setTimeout(() => setList(l => l.filter(x => x.id !== id)), 4500)
  }, [])
  return <ToastCtx.Provider value={push}>{children}
    <div className="fixed z-50 top-4 right-4 left-4 sm:left-auto sm:w-96 space-y-2 pointer-events-none">
      {list.map(t => <div key={t.id} role="status" className="pointer-events-auto card animate-up flex gap-3 items-start p-3.5 text-sm">
        {t.kind === 'ok' ? <CheckCircle2 className="text-ok shrink-0" size={18} /> : t.kind === 'error' ? <AlertCircle className="text-bad shrink-0" size={18} /> : <Info className="text-brand shrink-0" size={18} />}
        <span className="flex-1">{t.msg}</span>
        <button aria-label="Dismiss" onClick={() => setList(l => l.filter(x => x.id !== t.id))}><X size={14} className="text-mut" /></button></div>)}
    </div></ToastCtx.Provider>
}

// ---------- layout bits
export function PageHeader({ title, sub, icon }: { title: string; sub?: string; icon?: ReactNode }) {
  return <div className="mb-6 animate-up flex items-center gap-4">
    {icon && <div className="size-12 rounded-2xl bg-brand text-white grid place-items-center shadow-card shrink-0">{icon}</div>}
    <div><h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>{sub && <p className="text-mut text-sm mt-0.5">{sub}</p>}</div></div>
}
export function Tabs({ items }: { items: [string, string, ReactNode?][] }) {
  const [sp, setSp] = useSearchParams(); const cur = sp.get('tab') || items[0][0]
  return <div role="tablist" className="inline-flex gap-1 p-1 rounded-2xl bg-soft mb-6 max-w-full overflow-x-auto">
    {items.map(([k, label, icon]) => <button key={k} role="tab" aria-selected={cur === k} onClick={() => setSp({ tab: k })}
      className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap flex items-center gap-2 transition ${cur === k ? 'bg-surface text-brand shadow-card' : 'text-mut hover:text-ink'}`}>{icon}{label}</button>)}</div>
}
export const useTab = (def: string) => useSearchParams()[0].get('tab') || def

const BADGE: Record<string, string> = { pending: 'bg-warn/15 text-warn', accepted: 'bg-ok/15 text-ok', rejected: 'bg-bad/15 text-bad',
  high: 'bg-bad/15 text-bad', low: 'bg-mut/15 text-mut', rent: 'bg-brand/15 text-brand', buy: 'bg-gold/25 text-warn', open: 'bg-warn/15 text-warn', filled: 'bg-ok/15 text-ok' }
export const Badge = ({ k, children }: { k: string; children?: ReactNode }) =>
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${BADGE[k] ?? BADGE.low}`}>{children ?? k}</span>
export const Prio = ({ p }: { p: string | null }) => p ? <Badge k={p}>{p} priority</Badge> : null

export function Empty({ icon, title, hint, to, cta }: { icon: ReactNode; title: string; hint?: string; to?: string; cta?: string }) {
  return <div className="card border-dashed text-center py-12 px-6 animate-up"><div className="mx-auto size-14 rounded-2xl bg-soft text-brand grid place-items-center mb-3">{icon}</div>
    <p className="font-bold">{title}</p>{hint && <p className="text-sm text-mut mt-1">{hint}</p>}
    {to && <Link to={to} className="btn mt-4">{cta}</Link>}</div>
}
export const Skeleton = ({ n = 3 }: { n?: number }) => <div className="space-y-3">{Array.from({ length: n }).map((_, i) =>
  <div key={i} className="skel animate-shimmer h-24 rounded-2xl" />)}</div>
export const ErrorBox = ({ msg }: { msg: string }) => <div className="card p-4 text-bad text-sm flex gap-2"><AlertCircle size={18} />{msg}</div>
export const Note = ({ kind, children }: { kind: 'ok' | 'bad' | 'warn'; children: ReactNode }) =>
  <div className={`rounded-xl px-3.5 py-2.5 text-sm mt-3 ${kind === 'ok' ? 'bg-ok/10 text-ok' : kind === 'bad' ? 'bg-bad/10 text-bad' : 'bg-warn/10 text-warn'}`}>{children}</div>
export const Field = ({ label, children }: { label: string; children: ReactNode }) => <label className="block"><span className="label">{label}</span>{children}</label>

// ---------- slot picker: week strip + slot chips
export function SlotPicker({ kind, id, day, slot, onChange }: { kind: 'equipment' | 'faculty'; id: number | null; day: string; slot: string; onChange: (day: string, slot: string) => void }) {
  const [taken, setTaken] = useState<Taken[] | null>(null)
  useEffect(() => {
    if (!id) return; setTaken(null)
    supabase.rpc(kind === 'equipment' ? 'equipment_taken' : 'faculty_taken', { p_from: iso(new Date()), p_to: iso(addDays(new Date(), 30)) })
      .then(({ data }) => setTaken(((data as Taken[]) ?? []).filter(r => r.id === id)))
  }, [kind, id])
  const days: string[] = []; for (let d = new Date(), n = 0; n < 14; d = addDays(d, 1)) if (isWeekday(d)) { days.push(iso(d)); n++ }
  if (!id) return <p className="text-sm text-mut">Choose what you are booking first.</p>
  if (!taken) return <div className="skel animate-shimmer h-28 rounded-xl" />
  const free = day ? freeSlots(taken, day) : []
  return <div>
    <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
      {days.map(d => { const f = freeSlots(taken, d).length; const dt = new Date(d + 'T00:00'); const on = d === day
        return <button type="button" key={d} disabled={!f} onClick={() => onChange(d, freeSlots(taken, d).includes(slot) ? slot : '')}
          className={`shrink-0 w-[62px] rounded-2xl border py-2 text-center transition ${on ? 'bg-brand text-white border-brand shadow-card' : f ? 'bg-surface border-line hover:border-brand' : 'bg-line/40 border-transparent opacity-50 cursor-not-allowed'}`}>
          <div className="text-[10px] uppercase font-bold opacity-70">{dt.toLocaleDateString('en-IN', { weekday: 'short' })}</div>
          <div className="text-lg font-extrabold leading-tight">{dt.getDate()}</div>
          <div className="text-[10px] font-semibold opacity-80">{f ? `${f} free` : 'full'}</div></button> })}
    </div>
    {day ? <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
      {SLOTS.map(s => { const isFree = free.includes(s); return <button type="button" key={s} disabled={!isFree} onClick={() => onChange(day, s)}
        className={`rounded-xl border px-2 py-2 text-xs font-bold transition ${slot === s ? 'bg-brand text-white border-brand' : isFree ? 'bg-surface border-line hover:border-brand' : 'bg-line/40 text-mut line-through border-transparent cursor-not-allowed'}`}>{s}</button> })}
    </div> : <p className="text-sm text-mut mt-3">Pick a date to see its slots.</p>}
    {day && <p className="text-xs text-mut mt-2">{fmtDay(day)} · {slot ? `selected ${slot}` : 'no slot selected'}</p>}
  </div>
}
