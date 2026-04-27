import { useState, useEffect } from 'react'
import type { MouseEvent } from 'react'
import { flushSync } from 'react-dom'
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import './App.css'
import Spotify from './Spotify'

type Theme = 'light' | 'dark'

const externalLinks = [
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/in/choidorjbayarkhuu/',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
  {
    label: 'GitHub',
    href: 'https://github.com/chdrj',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
      </svg>
    ),
  },
  {
    label: 'Email',
    href: 'mailto:chdrj@g.ucla.edu',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    ),
  },
]

const spotifyIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
  </svg>
)

function AuroraBackground() {
  return (
    <div className="aurora" aria-hidden="true">
      <svg
        className="aurora-ribbon aurora-ribbon--a"
        viewBox="0 0 1200 800"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="aurora-grad-a" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: 'var(--aurora-1)' }} />
            <stop offset="35%" style={{ stopColor: 'var(--aurora-2)' }} />
            <stop offset="70%" style={{ stopColor: 'var(--aurora-4)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--aurora-3)' }} />
          </linearGradient>
        </defs>
        <path
          d="M -200 420 C 100 180, 400 660, 700 380 S 1100 540, 1500 280"
          stroke="url(#aurora-grad-a)"
          strokeWidth="220"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      <svg
        className="aurora-ribbon aurora-ribbon--b"
        viewBox="0 0 1200 800"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="aurora-grad-b" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: 'var(--aurora-3)' }} />
            <stop offset="50%" style={{ stopColor: 'var(--aurora-4)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--aurora-1)' }} />
          </linearGradient>
        </defs>
        <path
          d="M -200 600 C 200 700, 500 200, 800 500 S 1100 300, 1500 620"
          stroke="url(#aurora-grad-b)"
          strokeWidth="180"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      <div className="aurora-grain" />
    </div>
  )
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function HomePage() {
  return (
    <section className="hero-section">
      <div className="hero-content">
        <h1 className="hero-name">Choidorj Bayarkhuu</h1>
        <p className="hero-bio">
          Undergraduate student at UCLA studying Computer Science.
        </p>
      </div>
    </section>
  )
}

type ToggleTheme = (event: MouseEvent<HTMLButtonElement>) => void

function Layout({ theme, toggleTheme }: { theme: Theme; toggleTheme: ToggleTheme }) {
  return (
    <>
      <nav className="navbar">
        <div className="nav-content">
          <Link to="/" className="nav-logo">Choi</Link>
          <div className="nav-icons">
            <Link to="/spotify" className="nav-icon-link">
              {spotifyIcon}
              <span className="nav-tooltip">Spotify</span>
            </Link>
            {externalLinks.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="nav-icon-link"
                target="_blank"
                rel="noopener noreferrer"
              >
                {item.icon}
                <span className="nav-tooltip">{item.label}</span>
              </a>
            ))}
            <button
              className="nav-icon-link theme-toggle"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
            >
              {theme === 'dark' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
              <span className="nav-tooltip">Dark Mode</span>
            </button>
          </div>
        </div>
      </nav>

      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/spotify" element={<Spotify />} />
        </Routes>
      </main>
    </>
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

  const toggleTheme: ToggleTheme = (event) => {
    const next: Theme = theme === 'light' ? 'dark' : 'light'

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const supportsViewTransition = typeof document !== 'undefined' && 'startViewTransition' in document

    if (!supportsViewTransition || reduceMotion) {
      setTheme(next)
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const maxRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    )

    const root = document.documentElement
    root.style.setProperty('--reveal-x', `${x}px`)
    root.style.setProperty('--reveal-y', `${y}px`)
    root.style.setProperty('--reveal-r', `${maxRadius}px`)

    document.startViewTransition(() => {
      flushSync(() => setTheme(next))
    })
  }

  return (
    <BrowserRouter>
      <AuroraBackground />
      <ScrollToTop />
      <Layout theme={theme} toggleTheme={toggleTheme} />
      <Analytics />
    </BrowserRouter>
  )
}

export default App
