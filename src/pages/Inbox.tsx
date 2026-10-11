import { useEffect } from 'react'
import { Inbox as InboxIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ok, useQuery } from '../lib/hooks'
import { fmtTime } from '../lib/logic'
import { Empty, ErrorBox, PageHeader, Skeleton } from '../components/ui'

export default function InboxPage() {
  const { data, loading, error } = useQuery(async () => ok(await supabase.from('notifications').select('*').order('id', { ascending: false }).limit(100)) as any[], [])
  useEffect(() => { if (data?.some(n => !n.read)) supabase.from('notifications').update({ read: true }).eq('read', false).then(() => window.dispatchEvent(new Event('inbox-read'))) }, [data])
  return <div><PageHeader title="Inbox" sub="Decisions and contact details, delivered live." icon={<InboxIcon />} />
    {error && <ErrorBox msg={error} />}{loading ? <Skeleton /> : !data?.length ? <Empty icon={<InboxIcon />} title="Nothing here yet" hint="Contact details and decisions will show up here." /> :
      <div className="space-y-3">{data.map(m => <div key={m.id} className="card p-4 animate-up">
        <div className="flex justify-between gap-3 flex-wrap"><b>{m.subject}</b><span className="text-xs text-mut">{fmtTime(m.created_at)}</span></div>
        <pre className="whitespace-pre-wrap font-sans text-sm text-mut mt-2">{m.body}</pre></div>)}</div>}</div>
}
