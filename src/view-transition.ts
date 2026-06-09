// Run a DOM update inside a View Transition when the API is available, falling
// back to an immediate update when it isn't supported or the user prefers
// reduced motion. Shared by the theme toggle and route transitions.
export function startViewTransition(callback: () => void) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const supports = typeof document !== 'undefined' && 'startViewTransition' in document

  if (!supports || reduceMotion) {
    callback()
    return
  }

  document.startViewTransition(callback)
}
