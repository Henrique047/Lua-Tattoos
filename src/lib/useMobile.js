import { useEffect, useState } from 'react'
// true quando a tela é de celular (usado para trocar o layout)
export default function useMobile(px = 700) {
  const [m, setM] = useState(() => window.innerWidth <= px)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${px}px)`), h = () => setM(mq.matches)
    h(); mq.addEventListener('change', h); return () => mq.removeEventListener('change', h)
  }, [px])
  return m
}