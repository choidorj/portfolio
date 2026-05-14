import TransitionLink from './TransitionLink'

export default function NotFound() {
  return (
    <section className="notfound-section">
      <div className="notfound-content">
        <span className="hero-eyebrow">404 &middot; NOT FOUND</span>
        <h1 className="notfound-title">This page drifted into the aurora.</h1>
        <p className="notfound-text">
          The URL you followed may be broken, or the page may have wandered off. Let&rsquo;s get you back.
        </p>
        <TransitionLink to="/" className="notfound-cta">
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
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          <span>back home</span>
        </TransitionLink>
      </div>
    </section>
  )
}
