import TransitionLink from './TransitionLink'
import { notes } from './notes-data'

export default function Notes() {
  return (
    <div>
      <h1 className="page-title">notes</h1>
      <p className="page-subtitle">scratchpad / writing</p>

      {notes.length === 0 ? (
        <div className="spotify-placeholder">nothing here yet. check back soon.</div>
      ) : (
        <ul className="notes-list">
          {notes.map((note) => (
            <li key={note.slug} className="notes-item">
              <TransitionLink to={`/notes/${note.slug}`} className="notes-link">
                <span className="notes-title">{note.title}</span>
                {note.date && <time className="notes-date">{note.date}</time>}
                {note.description && (
                  <span className="notes-desc">{note.description}</span>
                )}
              </TransitionLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
