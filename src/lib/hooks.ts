import { useCallback, useEffect, useState } from 'react'

export function useQuery<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const run = useCallback(async () => {
    setLoading(true)
    try { setData(await fn()); setError(null) } catch (e: any) { setError(e?.message ?? 'Something went wrong') }
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => { run() }, [run])
  return { data, loading, error, reload: run }
}
/** unwrap a supabase response or throw */
export function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}
