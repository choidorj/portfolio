import type { MouseEvent } from 'react'
import { flushSync } from 'react-dom'
import { Link, useNavigate, type LinkProps } from 'react-router-dom'

function startViewTransition(callback: () => void) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const supports = typeof document !== 'undefined' && 'startViewTransition' in document

  if (!supports || reduceMotion) {
    callback()
    return
  }

  document.startViewTransition(callback)
}

export default function TransitionLink({ to, onClick, ...rest }: LinkProps) {
  const navigate = useNavigate()

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented) return

    // Respect modifier clicks (open in new tab, etc.)
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return

    e.preventDefault()
    startViewTransition(() => {
      flushSync(() => navigate(to))
    })
  }

  return <Link to={to} onClick={handleClick} {...rest} />
}
