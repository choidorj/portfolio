import { useParams } from 'react-router-dom'
import TransitionLink from './TransitionLink'
import { Markdown } from './markdown'
import { getNote } from './notes-data'
import NotFound from './NotFound'

export default function NoteDetail() {
  const { slug } = useParams<{ slug: string }>()
  const note = slug ? getNote(slug) : undefined

  if (!note) return <NotFound />

  return (
    <article className="note">
      <p className="note-back">
        <TransitionLink to="/notes">← all notes</TransitionLink>
      </p>

      <h1 className="page-title">{note.title}</h1>
      {note.date && <p className="note-meta"><time>{note.date}</time></p>}
      {note.description && <p className="note-lead">{note.description}</p>}

      <div className="note-body">
        <Markdown source={note.content} />
      </div>
    </article>
  )
}
