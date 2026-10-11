import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Check, ExternalLink, Flame, Send, Sparkles, X, Zap } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { askAgent, check, execute, loadContext, type Card, type ChatMsg, type Proposal } from '../lib/agent'
import { useToast } from './ui'

type CardState = 'pending' | 'done' | 'cancelled' | 'replaced'
interface Msg { id: number; role: 'user' | 'assistant'; text: string; suggestions?: string[]; link?: [string, string]; greeting?: boolean; card?: { proposal: Proposal; view: Card; state: CardState } }

const STARTERS = ['Book a 3D printer tomorrow at 10am for my gripper prototype', 'I need mentorship in ROS2 and robot vision', 'I need a PCB designer and a CAD person for my project', 'I want to rent a digital oscilloscope till Friday']
const GREETING: Msg = { id: 0, role: 'assistant', greeting: true, suggestions: STARTERS,
  text: 'Hi! Tell me what you need — equipment, a mentor, teammates or a resource — and I’ll suggest the best option. Nothing is booked until you press Confirm.' }

/** used only if the model sent a card without any explanation */
const describe = (c: Card) => `Here’s what I’d suggest: ${c.rows[0][1]}${c.rows[1] ? ` (${c.rows[1][1]})` : ''}. Press Confirm if it looks right, or tell me what to change.`

/** what the model gets to see of each message (cards are described so it knows their status) */
const toHistory = (msgs: Msg[]): ChatMsg[] => msgs.filter(m => !m.greeting).map(m => ({ role: m.role,
  content: m.text + (m.card ? `\n[Confirmation card shown — ${m.card.view.title}: ${m.card.view.rows.map(r => r.join(': ')).join('; ')} — status: ${m.card.state}]` : '') }))

export default function AIAssistant() {
  const { profile } = useAuth(); const toast = useToast(); const nav = useNavigate(); const loc = useLocation()
  const [open, setOpen] = useState(false); const [msgs, setMsgs] = useState<Msg[]>([GREETING]); const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false); const [mode, setMode] = useState<'ai' | 'basic' | null>(null)
  const thread = useRef<string[]>([]); const idc = useRef(1); const end = useRef<HTMLDivElement>(null); const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [msgs, busy, open])
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50) }, [open])
  if (!profile) return null
  const id = () => idc.current++
  const patchCard = (mid: number, state: CardState) => setMsgs(m => m.map(x => x.id === mid && x.card ? { ...x, card: { ...x.card, state } } : x))
  const say = (m: Omit<Msg, 'id' | 'role'>) => setMsgs(l => [...l, { id: id(), role: 'assistant', ...m }])

  const send = async (raw: string) => {
    const text = raw.trim(); if (!text || busy) return
    setInput(''); setBusy(true)
    const withUser = [...msgs, { id: id(), role: 'user' as const, text }]
    setMsgs(withUser.map(m => m.card?.state === 'pending' ? { ...m, card: { ...m.card, state: 'replaced' as CardState } } : m)); thread.current.push(text)
    try {
      const ctx = await loadContext({ id: profile.id, name: profile.name, dept: profile.dept })
      const turn = await askAgent(toHistory(withUser), thread.current.join('\n'), text, ctx); setMode(turn.mode)
      if (turn.proposal) {
        const r = check(turn.proposal, ctx)
        if ('card' in r) say({ text: turn.reply || describe(r.card), suggestions: turn.suggestions, card: { proposal: turn.proposal, view: r.card, state: 'pending' } })
        else say({ text: r.problem, suggestions: r.suggestions })
      } else say({ text: turn.reply || 'Could you tell me a bit more about what you need?', suggestions: turn.suggestions })
    } catch (e: any) { say({ text: `Sorry, something went wrong: ${e?.message ?? 'unknown error'}. Please try again.` }) }
    setBusy(false)
  }

  const confirm = async (m: Msg) => {
    if (!m.card || busy) return; setBusy(true)
    try {
      const done = await execute(m.card.proposal); patchCard(m.id, 'done'); thread.current = []
      toast(done); say({ text: `✅ ${done}`, link: m.card.view.link })
    } catch (e: any) { toast(e?.message ?? 'Could not complete that', 'error'); say({ text: `I couldn’t complete that: ${e?.message ?? 'unknown error'}. Want me to look for another option?` }) }
    setBusy(false)
  }
  const cancel = (m: Msg) => { patchCard(m.id, 'cancelled'); thread.current = []; say({ text: 'No problem, I’ve cancelled that. What else do you need?' }) }
  const go = (to: string) => { if (loc.pathname + loc.search === to) window.location.reload(); else { nav(to); setOpen(false) } }
  const onSubmit = (e: FormEvent) => { e.preventDefault(); send(input) }

  if (!open) return <button onClick={() => setOpen(true)} aria-label="Open AI assistant"
    className="fixed z-40 right-4 sm:right-6 bottom-24 lg:bottom-6 btn rounded-full h-14 pl-4 pr-5 shadow-card"><Sparkles size={20} />Ask AI</button>

  return <div role="dialog" aria-label="AI assistant" className="fixed z-40 right-3 sm:right-6 bottom-24 lg:bottom-6 w-[calc(100vw-1.5rem)] sm:w-[400px] h-[min(600px,calc(100vh-7rem))] card flex flex-col overflow-hidden animate-up">
    <div className="flex items-center gap-3 px-4 py-3 border-b border-line bg-soft/60">
      <span className="size-9 rounded-xl bg-brand text-white grid place-items-center shrink-0"><Sparkles size={18} /></span>
      <div className="flex-1 min-w-0"><p className="font-bold leading-tight">AmritaCollab Assistant</p>
        <p className="text-xs text-mut">{mode === 'ai' ? 'AI mode' : mode === 'basic' ? 'Basic mode · keyword understanding' : 'Equipment · Mentors · Teams · Resources'}</p></div>
      <button onClick={() => setOpen(false)} aria-label="Close assistant" className="p-1.5 rounded-lg text-mut hover:bg-soft hover:text-brand"><X size={18} /></button></div>

    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
      {msgs.map(m => <div key={m.id} className={`flex flex-col gap-2 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
        <div className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm ${m.role === 'user' ? 'bg-brand text-white rounded-br-md' : 'bg-soft rounded-bl-md'}`}>{m.text}</div>

        {m.card && <div className={`w-full rounded-2xl border bg-surface p-3.5 text-sm ${m.card.state === 'pending' ? 'border-brand/50 shadow-card' : 'border-line opacity-70'}`}>
          <p className="font-bold">{m.card.view.title}</p>
          <dl className="mt-2 space-y-1.5">{m.card.view.rows.map(([k, v], i) => <div key={i} className="grid grid-cols-[84px_1fr] gap-2"><dt className="text-xs font-bold uppercase tracking-wide text-mut pt-0.5">{k}</dt><dd className="min-w-0 break-words">{v}</dd></div>)}</dl>
          {m.card.view.priority && <div className={`mt-3 flex items-start gap-2 text-xs rounded-xl px-3 py-2 ${m.card.view.priority.priority === 'high' ? 'bg-bad/10 text-bad' : 'bg-soft text-mut'}`}>
            {m.card.view.priority.priority === 'high' ? <Flame size={14} className="mt-0.5 shrink-0" /> : <Zap size={14} className="mt-0.5 shrink-0" />}
            <span><b className="capitalize">{m.card.view.priority.priority} priority</b> · {m.card.view.priority.reason}</span></div>}
          {m.card.state === 'pending' ? <div className="mt-3 flex gap-2">
            <button className="btn btn-ok flex-1" disabled={busy} onClick={() => confirm(m)}><Check size={16} />{m.card.view.confirm}</button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => cancel(m)}>Cancel</button></div>
            : <p className="mt-3 text-xs font-semibold text-mut">{m.card.state === 'done' ? '✓ Confirmed' : m.card.state === 'cancelled' ? 'Cancelled' : 'Replaced by a newer suggestion'}</p>}
        </div>}

        {m.link && <button className="chip" onClick={() => go(m.link![0])}><ExternalLink size={12} />{m.link[1]}</button>}
        {m.suggestions && m.suggestions.length > 0 && <div className="flex flex-wrap gap-1.5 max-w-full">{m.suggestions.map(s =>
          <button key={s} disabled={busy} onClick={() => send(s)} className="chip text-left whitespace-normal hover:brightness-95 disabled:opacity-50">{s}</button>)}</div>}
      </div>)}
      {busy && <div className="flex gap-1 px-3.5 py-3 bg-soft rounded-2xl rounded-bl-md w-fit" aria-label="Thinking">{[0, 1, 2].map(i => <span key={i} className="size-1.5 rounded-full bg-mut animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />)}</div>}
      <div ref={end} /></div>

    <form onSubmit={onSubmit} className="flex gap-2 p-3 border-t border-line">
      <input ref={inputRef} className="input" value={input} onChange={e => setInput(e.target.value)} maxLength={500} placeholder="e.g. I need a 3D printer tomorrow morning…" aria-label="Message the assistant" />
      <button className="btn px-3.5" disabled={busy || !input.trim()} aria-label="Send"><Send size={16} /></button></form>
  </div>
}
