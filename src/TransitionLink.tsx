import type { MouseEvent } from 'react'
import { flushSync } from 'react-dom'
import { Link, useNavigate, type LinkProps } from 'react-router-dom'
import { startViewTransition } from './view-transition'

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
