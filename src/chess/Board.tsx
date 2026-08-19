import { useRef, useState } from 'react'
import { indexToSquare } from './engine-protocol'
import type { Square } from './engine-protocol'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const PIECE_NAMES: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}

interface BoardProps {
  /** 64 characters in reading order, a8 first. Uppercase = white. */
  board: string
  flipped: boolean
  selected: Square | null
  targets: Set<Square>
  lastFrom: Square | null
  lastTo: Square | null
  checkSquare: Square | null
  interactive: boolean
  onSelect: (square: Square) => void
  onMove: (from: Square, to: Square) => void
}

interface DragState {
  from: Square
  x: number
  y: number
  moved: boolean
}

function pieceAsset(piece: string) {
  const color = piece === piece.toUpperCase() ? 'w' : 'b'
  return `/pieces/${color}${piece.toUpperCase()}.svg`
}

function describe(piece: string) {
  const color = piece === piece.toUpperCase() ? 'white' : 'black'
  return `${color} ${PIECE_NAMES[piece.toLowerCase()]}`
}

export default function Board({
  board,
  flipped,
  selected,
  targets,
  lastFrom,
  lastTo,
  checkSquare,
  interactive,
  onSelect,
  onMove,
}: BoardProps) {
  const boardRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)

  /* Display order differs from engine order when the board is flipped. */
  const toEngine = (slot: number) => (flipped ? 63 - slot : slot)

  const squareAt = (clientX: number, clientY: number): Square | null => {
    const rect = boardRef.current?.getBoundingClientRect()
    if (!rect) return null
    const file = Math.floor(((clientX - rect.left) / rect.width) * 8)
    const rank = Math.floor(((clientY - rect.top) / rect.height) * 8)
    if (file < 0 || file > 7 || rank < 0 || rank > 7) return null
    return toEngine(rank * 8 + file)
  }

  const handlePointerDown = (event: React.PointerEvent, square: Square) => {
    if (!interactive || event.button !== 0) return
    if (board[square] === '.' && selected === null) return
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* No active pointer to capture; clicking still works without it. */
    }
    setDrag({ from: square, x: event.clientX, y: event.clientY, moved: false })
  }

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!drag) return
    const moved =
      drag.moved || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 6
    setDrag({ ...drag, x: event.clientX, y: event.clientY, moved })
  }

  const handlePointerUp = (event: React.PointerEvent, square: Square) => {
    if (!drag) return
    const dropped = squareAt(event.clientX, event.clientY)
    const wasDrag = drag.moved
    setDrag(null)

    /* A tap selects; a drag that lands somewhere else is a move attempt. */
    if (!wasDrag) {
      onSelect(square)
      return
    }
    if (dropped !== null && dropped !== drag.from) onMove(drag.from, dropped)
  }

  const dragPiece = drag?.moved ? board[drag.from] : null

  return (
    <div className="board-wrap">
      <div className="board-ranks" aria-hidden="true">
        {Array.from({ length: 8 }, (_, row) => (
          <span key={row}>{flipped ? row + 1 : 8 - row}</span>
        ))}
      </div>

      <div
        className="board"
        ref={boardRef}
        role="grid"
        aria-label="chess board"
        onPointerMove={handlePointerMove}
      >
        {Array.from({ length: 64 }, (_, slot) => {
          const square = toEngine(slot)
          const piece = board[square]
          const isDark = (Math.floor(square / 8) + (square % 8)) % 2 === 1
          const name = indexToSquare(square)

          const classes = ['square', isDark ? 'is-dark' : 'is-light']
          if (square === selected) classes.push('is-selected')
          if (square === lastFrom || square === lastTo) classes.push('is-last')
          if (square === checkSquare) classes.push('is-check')
          if (targets.has(square)) classes.push(piece === '.' ? 'is-target' : 'is-capture')

          return (
            <button
              key={square}
              type="button"
              className={classes.join(' ')}
              disabled={!interactive}
              aria-label={piece === '.' ? name : `${describe(piece)} on ${name}`}
              onPointerDown={(event) => handlePointerDown(event, square)}
              onPointerUp={(event) => handlePointerUp(event, square)}
              /* Touch scrolling cancels the pointer stream; fall back to tapping. */
              onPointerCancel={() => setDrag(null)}
              onClick={() => !drag && onSelect(square)}
            >
              {piece !== '.' && (
                <img
                  src={pieceAsset(piece)}
                  alt=""
                  draggable={false}
                  style={drag?.moved && drag.from === square ? { opacity: 0.25 } : undefined}
                />
              )}
            </button>
          )
        })}
      </div>

      <div className="board-files" aria-hidden="true">
        {(flipped ? [...FILES].reverse() : FILES).map((file) => (
          <span key={file}>{file}</span>
        ))}
      </div>

      {dragPiece && dragPiece !== '.' && (
        <img
          className="board-drag"
          src={pieceAsset(dragPiece)}
          alt=""
          draggable={false}
          style={{ left: drag!.x, top: drag!.y }}
        />
      )}
    </div>
  )
}
