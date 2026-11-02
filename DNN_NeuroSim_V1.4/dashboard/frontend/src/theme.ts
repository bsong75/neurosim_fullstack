import { useEffect, useState } from 'react'

// Reference palette (dataviz skill): light and dark are separately stepped, not flipped
const LIGHT = {
  surface: '#fcfcfb',
  text: '#0b0b0b',
  textSecondary: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'],
  sequential: '#2a78d6',
}
const DARK: typeof LIGHT = {
  surface: '#1a1a19',
  text: '#f0efec',
  textSecondary: '#c3c2b7',
  muted: '#898781',
  grid: '#2c2c2a',
  axis: '#383835',
  series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'],
  sequential: '#3987e5',
}

export type Theme = typeof LIGHT

export function useTheme(): Theme {
  const query = '(prefers-color-scheme: dark)'
  const [dark, setDark] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return dark ? DARK : LIGHT
}

// The three periphery groups NeuroSim breaks latency/energy into, in fixed slot order
export const PARTS = [
  { key: 'adc', label: 'ADC / sense amps' },
  { key: 'accum', label: 'Accumulation' },
  { key: 'other', label: 'Other peripheries' },
] as const
