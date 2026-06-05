import { useState, useEffect } from 'react'
import { flushSync } from 'react-dom'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import './App.css'
import Music from './Music'
import Notes from './Notes'
import NoteDetail from './NoteDetail'
import NotFound from './NotFound'
import NowPlaying from './NowPlaying'
import TransitionLink from './TransitionLink'

type Theme = 'light' | 'dark'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname])
  return null
}

function HomePage() {
  return (
    <div className="prose">
      <h1>choidorj bayarkhuu</h1>
      <p className="subtitle">undergraduate at ucla studying computer science.</p>
      <p>
        hi i'm choi. this site is for short writings, project notes, and things that are currently on my mind.
      </p>
      <p>
        i like building things that feel good to use. lately, i've been interested in customizing tools and writing little scripts to automate things I probably shouldn't.
      </p>
      <p>
        outside of school, i enjoy traveling, listening to{' '}
        <TransitionLink to="/music">music</TransitionLink>, and playing video games. you can find me on{' '}
        <a href="https://github.com/choidorj" target="_blank" rel="noopener noreferrer">
          github
        </a>
        ,{' '}
        <a
          href="https://www.linkedin.com/in/choidorjbayarkhuu/"
          target="_blank"
          rel="noopener noreferrer"
        >
          linkedin
        </a>
        , or{' '}
        <a href="mailto:chdrj@g.ucla.edu">email</a>.
      </p>
      <NowPlaying />
    </div>
  )
}

type ToggleTheme = () => void

function Layout({ theme, toggleTheme }: { theme: Theme; toggleTheme: ToggleTheme }) {
  const { pathname } = useLocation()
  const isHome = pathname === '/'
  const isNotes = pathname === '/notes' || pathname.startsWith('/notes/')
  const nextLabel = theme === 'dark' ? 'light' : 'dark'

  return (
    <div className="shell">
      <header className="header">
        <TransitionLink to="/" className="header-logo" aria-label="Home">
          choi
        </TransitionLink>
        <nav className="header-nav">
          <TransitionLink to="/" className={isHome ? 'is-active' : ''}>
            home
          </TransitionLink>
          <TransitionLink to="/notes" className={isNotes ? 'is-active' : ''}>
            notes
          </TransitionLink>
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${nextLabel} theme`}
          >
            {theme === 'dark' ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                width="16"
                height="16"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                width="16"
                height="16"
                aria-hidden="true"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </nav>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/notes/:slug" element={<NoteDetail />} />
          <Route path="/music" element={<Music />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <footer className="footer">
        ~ {new Date().getFullYear()} choi
      </footer>
    </div>
  )
}

function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme') as Theme | null
    if (saved) return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme: ToggleTheme = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light'

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const supportsViewTransition =
      typeof document !== 'undefined' && 'startViewTransition' in document

    if (!supportsViewTransition || reduceMotion) {
      setTheme(next)
      return
    }

    document.startViewTransition(() => {
      flushSync(() => setTheme(next))
    })
  }

  return (
    <BrowserRouter>
      <ScrollToTop />
      <Layout theme={theme} toggleTheme={toggleTheme} />
      <Analytics />
      <SpeedInsights />
    </BrowserRouter>
  )
}

export default App
