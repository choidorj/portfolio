// Loads every .md file under src/notes/ at build time (Vite's import.meta.glob)
// and parses the YAML-style frontmatter at the top.

export type Note = {
  slug: string
  title: string
  date: string
  displayDate: string
  description: string
  content: string
}

const rawModules = import.meta.glob('./notes/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function parseFrontmatter(src: string): { meta: Record<string, string>; body: string } {
  const match = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { meta: {}, body: src }

  const meta: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    if (key) meta[key] = value
  }

  return { meta, body: match[2] }
}

function formatDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return iso
  const [, year, month, day] = m
  return `${month}-${day}-${year}`
}

export const notes: Note[] = Object.entries(rawModules)
  .map(([path, source]) => {
    const slug = path.split('/').pop()!.replace(/\.md$/, '')
    const { meta, body } = parseFrontmatter(source)
    const date = meta.date ?? ''
    return {
      slug,
      title: meta.title ?? slug,
      date,
      displayDate: formatDate(date),
      description: meta.description ?? '',
      content: body.trimStart(),
    }
  })
  .sort((a, b) => b.date.localeCompare(a.date))

export function getNote(slug: string): Note | undefined {
  return notes.find((n) => n.slug === slug)
}
