import TransitionLink from './TransitionLink'

export default function NotFound() {
  return (
    <div className="notfound">
      <span className="notfound-eyebrow">404 / not found</span>
      <h1 className="page-title">this page does not exist.</h1>
      <p className="notfound-text">
        the url you followed may be broken, or the page may have wandered off.
      </p>
      <p>
        <TransitionLink to="/">← back home</TransitionLink>
      </p>
    </div>
  )
}
