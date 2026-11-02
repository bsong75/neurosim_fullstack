import { useCallback, useEffect, useState } from 'react'

// Fetches on mount and every `intervalMs` while `active` is true (e.g. a run is still going)
export function usePolling<T>(load: () => Promise<T>, deps: unknown[], intervalMs = 5000) {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string>()
  const [active, setActive] = useState(true)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps)

  useEffect(() => {
    let cancelled = false
    const tick = () =>
      run()
        .then((d) => !cancelled && (setData(d), setError(undefined)))
        .catch((e) => !cancelled && setError(String(e)))
    tick()
    if (!active) return () => { cancelled = true }
    const id = setInterval(tick, intervalMs)
    return () => { cancelled = true; clearInterval(id) }
  }, [run, active, intervalMs])

  return { data, error, setActive }
}
