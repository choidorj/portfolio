// Minimal markdown -> JSX renderer.
// Supports the subset I actually use here: h2/h3, paragraphs, unordered lists,
// fenced code blocks, inline code, links, bold, italic.
// Renders straight to React nodes (no dangerouslySetInnerHTML).

import type { ReactNode } from 'react'

type Block =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'code'; lang: string; code: string }

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim() === '') {
      i++
      continue
    }

    // Fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing fence
      blocks.push({ type: 'code', lang, code: codeLines.join('\n') })
      continue
    }

    // Headings (only h2/h3 — h1 is reserved for the note title)
    const h3 = line.match(/^### (.+)$/)
    if (h3) {
      blocks.push({ type: 'heading', level: 3, text: h3[1] })
      i++
      continue
    }
    const h2 = line.match(/^## (.+)$/)
    if (h2) {
      blocks.push({ type: 'heading', level: 2, text: h2[1] })
      i++
      continue
    }

    // Unordered list
    if (line.startsWith('- ')) {
      const items: string[] = []
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(lines[i].slice(2))
        i++
      }
      blocks.push({ type: 'list', items })
      continue
    }

    // Paragraph — collect consecutive non-special lines
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('## ') &&
      !lines[i].startsWith('### ') &&
      !lines[i].startsWith('- ') &&
      !lines[i].startsWith('```')
    ) {
      paraLines.push(lines[i])
      i++
    }
    blocks.push({ type: 'paragraph', text: paraLines.join(' ') })
  }

  return blocks
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let buffer = ''
  let i = 0

  const flush = () => {
    if (buffer) {
      nodes.push(buffer)
      buffer = ''
    }
  }

  while (i < text.length) {
    // **bold**
    if (text.startsWith('**', i)) {
      const end = text.indexOf('**', i + 2)
      if (end !== -1) {
        flush()
        nodes.push(<strong key={nodes.length}>{text.slice(i + 2, end)}</strong>)
        i = end + 2
        continue
      }
    }

    // *italic*
    if (text[i] === '*') {
      const end = text.indexOf('*', i + 1)
      if (end !== -1) {
        flush()
        nodes.push(<em key={nodes.length}>{text.slice(i + 1, end)}</em>)
        i = end + 1
        continue
      }
    }

    // `inline code`
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1)
      if (end !== -1) {
        flush()
        nodes.push(<code key={nodes.length}>{text.slice(i + 1, end)}</code>)
        i = end + 1
        continue
      }
    }

    // [text](url)
    if (text[i] === '[') {
      const close = text.indexOf(']', i + 1)
      if (close !== -1 && text[close + 1] === '(') {
        const urlEnd = text.indexOf(')', close + 2)
        if (urlEnd !== -1) {
          const linkText = text.slice(i + 1, close)
          const url = text.slice(close + 2, urlEnd)
          const isExternal = /^https?:\/\//.test(url)
          flush()
          nodes.push(
            <a
              key={nodes.length}
              href={url}
              {...(isExternal && { target: '_blank', rel: 'noopener noreferrer' })}
            >
              {linkText}
            </a>,
          )
          i = urlEnd + 1
          continue
        }
      }
    }

    buffer += text[i]
    i++
  }

  flush()
  return nodes
}

export function Markdown({ source }: { source: string }) {
  const blocks = parseBlocks(source)
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'heading':
            return block.level === 2 ? (
              <h2 key={i}>{renderInline(block.text)}</h2>
            ) : (
              <h3 key={i}>{renderInline(block.text)}</h3>
            )
          case 'paragraph':
            return <p key={i}>{renderInline(block.text)}</p>
          case 'list':
            return (
              <ul key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ul>
            )
          case 'code':
            return (
              <pre key={i} data-lang={block.lang || undefined}>
                <code>{block.code}</code>
              </pre>
            )
        }
      })}
    </>
  )
}
