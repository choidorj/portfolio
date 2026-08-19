import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Board from './Board'
import { useEngine } from './useEngine'
import { indexToSquare, squareToIndex } from './engine-protocol'
import type { EngineState, SearchInfo, Square } from './engine-protocol'

/* Ratings are measured by playing Stockfish, not guessed. See
   engine/scripts/calibrate.sh and the README. */
const LEVELS = [
  { value: 1, label: 'level 1', rating: '~950' },
  { value: 2, label: 'level 2', rating: '~1250' },
  { value: 3, label: 'level 3', rating: '~1500' },
  { value: 4, label: 'level 4', rating: '~1700' },
  { value: 5, label: 'level 5', rating: '~2050' },
  { value: 6, label: 'level 6', rating: 'full strength' },
]
const DEFAULT_LEVEL = 4
const STORAGE_KEY = 'chess-game'

type Color = 'w' | 'b'

interface SavedGame {
  moves: string[]
  level: number
  color: Color
}

function loadSaved(): SavedGame | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SavedGame
    if (!Array.isArray(parsed.moves) || parsed.moves.length === 0) return null
    if (parsed.color !== 'w' && parsed.color !== 'b') return null
    const level = Math.min(LEVELS.length, Math.max(1, Math.round(parsed.level)))
    return { moves: parsed.moves, color: parsed.color, level }
  } catch {
    return null
  }
}

function formatNodes(nodes: number) {
  if (nodes >= 1_000_000) return `${(nodes / 1_000_000).toFixed(1)}M`
  if (nodes >= 1_000) return `${Math.round(nodes / 1_000)}k`
  return `${nodes}`
}

/* Long variations overflow the single-line info panel; the first few moves are
   the interesting part anyway. */
function formatPv(pv: string, limit = 6) {
  const moves = pv.split(' ').filter(Boolean)
  return moves.length > limit ? `${moves.slice(0, limit).join(' ')} …` : moves.join(' ')
}

function formatScore(info: SearchInfo) {
  if (info.mate) return `mate ${info.score > 0 ? info.score : `-${-info.score}`}`
  const pawns = info.score / 100
  return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(2)}`
}

function outcome(state: EngineState, player: Color) {
  switch (state.result) {
    case 'checkmate':
      return state.winner === player ? 'checkmate — you win.' : 'checkmate — the engine wins.'
    case 'stalemate':
      return 'draw by stalemate.'
    case 'fifty':
      return 'draw by the fifty-move rule.'
    case 'repetition':
      return 'draw by threefold repetition.'
    case 'material':
      return 'draw by insufficient material.'
    default:
      return null
  }
}

export default function Chess() {
  const { state, info, ready, error, newGame, play, undo, search, setInfo } = useEngine()

  /* Read once at mount so the restored settings are the initial render. */
  const [saved] = useState(loadSaved)

  const [level, setLevel] = useState(saved?.level ?? DEFAULT_LEVEL)
  const [player, setPlayer] = useState<Color>(saved?.color ?? 'w')
  const [flipped, setFlipped] = useState(saved?.color === 'b')
  const [selected, setSelected] = useState<Square | null>(null)
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null)
  const [copied, setCopied] = useState(false)

  const searchedRef = useRef<string | null>(null)
  const restoredRef = useRef(false)
  const [restoring, setRestoring] = useState(saved !== null)

  /* Resume the game in progress by replaying it through the engine, so the
     move history, repetition state and SAN list are all rebuilt properly. */
  useEffect(() => {
    if (!ready || !saved || restoredRef.current) return
    restoredRef.current = true

    let cancelled = false
    void (async () => {
      for (const move of saved.moves) {
        if (cancelled) return
        const response = await play(move)
        if (response.type !== 'state') break
      }
      if (!cancelled) setRestoring(false)
    })()

    return () => {
      cancelled = true
    }
  }, [ready, saved, play])

  useEffect(() => {
    if (restoring || !state) return
    if (state.moves.length === 0) {
      localStorage.removeItem(STORAGE_KEY)
      return
    }
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ moves: state.moves, level, color: player } satisfies SavedGame),
    )
  }, [state, level, player, restoring])

  /* "Thinking" is not tracked separately: if it is the engine's turn, a search
     is either running or about to be dispatched by the effect below. */
  const thinking =
    !!state && ready && !restoring && state.result === 'none' && state.turn !== player

  useEffect(() => {
    if (!thinking || !state) return

    const key = `${state.fen}:${state.ply}`
    if (searchedRef.current === key) return
    searchedRef.current = key
    void search(level)
  }, [thinking, state, level, search])

  const interactive =
    !!state && ready && !restoring && state.result === 'none' && state.turn === player

  const targets = useMemo(() => {
    if (!state || selected === null) return new Set<Square>()
    const prefix = indexToSquare(selected)
    const found = new Set<Square>()
    for (const move of state.legal)
      if (move.slice(0, 2) === prefix) found.add(squareToIndex(move.slice(2, 4)))
    return found
  }, [state, selected])

  const submit = useCallback(
    async (uci: string) => {
      setSelected(null)
      setPromotion(null)
      await play(uci)
    },
    [play],
  )

  const attempt = useCallback(
    (from: Square, to: Square) => {
      if (!state) return
      const prefix = indexToSquare(from) + indexToSquare(to)
      const matches = state.legal.filter((move) => move.startsWith(prefix))
      if (matches.length === 0) {
        setSelected(null)
        return
      }
      /* Promotions arrive as four moves sharing the same from/to. */
      if (matches.length > 1 && matches[0].length === 5) {
        setPromotion({ from, to })
        return
      }
      void submit(matches[0])
    },
    [state, submit],
  )

  const handleSelect = useCallback(
    (square: Square) => {
      if (!state || !interactive) return
      if (selected !== null && targets.has(square)) {
        attempt(selected, square)
        return
      }
      const piece = state.board[square]
      const isOwn = piece !== '.' && (piece === piece.toUpperCase()) === (player === 'w')
      setSelected(isOwn ? square : null)
    },
    [state, interactive, selected, targets, attempt, player],
  )

  const startGame = useCallback(
    async (color: Color, nextLevel: number) => {
      searchedRef.current = null
      setSelected(null)
      setPromotion(null)
      setPlayer(color)
      setLevel(nextLevel)
      setFlipped(color === 'b')
      setInfo(null)
      localStorage.removeItem(STORAGE_KEY)
      await newGame()
    },
    [newGame, setInfo],
  )

  const takeBack = useCallback(async () => {
    if (!state || thinking) return
    searchedRef.current = null
    setSelected(null)
    /* Undo the engine's reply as well, so it stays the player's turn. */
    const plies = state.turn === player ? 2 : 1
    await undo(Math.min(plies, state.ply))
  }, [state, thinking, player, undo])

  const copyFen = useCallback(() => {
    if (!state) return
    void navigator.clipboard?.writeText(state.fen).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [state])

  const pairs = useMemo(() => {
    const rows: { number: number; white?: string; black?: string }[] = []
    const san = state?.san ?? []
    for (let i = 0; i < san.length; i += 2)
      rows.push({ number: i / 2 + 1, white: san[i], black: san[i + 1] })
    return rows
  }, [state])

  const lastFrom = state?.last ? squareToIndex(state.last.slice(0, 2)) : null
  const lastTo = state?.last ? squareToIndex(state.last.slice(2, 4)) : null
  const checkSquare = useMemo(() => {
    if (!state?.check) return null
    const king = state.turn === 'w' ? 'K' : 'k'
    const index = state.board.indexOf(king)
    return index === -1 ? null : index
  }, [state])

  const finished = state ? outcome(state, player) : null
  const status = !ready
    ? 'loading the engine…'
    : restoring
      ? 'restoring your game…'
      : finished
        ? finished
        : thinking
          ? 'the engine is thinking…'
          : state?.check
            ? state.turn === player
              ? 'you are in check.'
              : 'check.'
            : state?.turn === player
              ? 'your move.'
              : 'the engine moves next.'

  return (
    <div className="chess">
      <h1 className="page-title">chess</h1>
      <p className="page-subtitle">
        a chess engine i wrote in c, compiled to webassembly. it runs entirely in this tab —
        no server, no network calls after the first load.
      </p>

      {error && <div className="placeholder">{error}</div>}

      <div className="chess-controls">
        <span className="chess-label">play as</span>
        <div className="chess-choice">
          <button
            type="button"
            className={player === 'w' ? 'is-active' : ''}
            onClick={() => startGame('w', level)}
          >
            white
          </button>
          <button
            type="button"
            className={player === 'b' ? 'is-active' : ''}
            onClick={() => startGame('b', level)}
          >
            black
          </button>
        </div>

        <span className="chess-label">strength</span>
        <select
          className="chess-select"
          value={level}
          onChange={(event) => setLevel(Number(event.target.value))}
          aria-label="engine strength"
        >
          {LEVELS.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label} ({entry.rating})
            </option>
          ))}
        </select>
      </div>

      <p className="chess-note">
        the ratings are rough. i measured them by playing the engine against stockfish with its
        strength limiter on, which is only accurate to about a hundred points either way.
      </p>

      <div className="chess-layout">
        <div className="chess-board-column">
          <Board
            board={state?.board ?? '.'.repeat(64)}
            flipped={flipped}
            selected={selected}
            targets={targets}
            lastFrom={lastFrom}
            lastTo={lastTo}
            checkSquare={checkSquare}
            interactive={interactive}
            onSelect={handleSelect}
            onMove={attempt}
          />

          {promotion && state && (
            <div className="chess-promotion">
              <span>promote to</span>
              {['q', 'r', 'b', 'n'].map((piece) => (
                <button
                  key={piece}
                  type="button"
                  onClick={() =>
                    submit(indexToSquare(promotion.from) + indexToSquare(promotion.to) + piece)
                  }
                  aria-label={piece}
                >
                  <img
                    src={`/pieces/${player}${piece.toUpperCase()}.svg`}
                    alt={piece}
                    draggable={false}
                  />
                </button>
              ))}
              <button type="button" className="chess-cancel" onClick={() => setPromotion(null)}>
                cancel
              </button>
            </div>
          )}

          <p className={`chess-status${thinking ? ' is-thinking' : ''}`}>{status}</p>

          {/* The engine's own search output, as it arrives. */}
          <div className="chess-info" aria-live="off">
            {!info ? (
              <span className="chess-info-idle">waiting for the engine to search</span>
            ) : info.book ? (
              <>
                <span className="chess-info-key">book</span> opening line
                <span className="chess-info-pv"> {info.pv}</span>
              </>
            ) : (
              <>
                <span className="chess-info-key">depth</span> {info.depth}
                <span className="chess-info-key"> score</span> {formatScore(info)}
                <span className="chess-info-key"> nodes</span> {formatNodes(info.nodes)}
                <span className="chess-info-key"> nps</span> {formatNodes(info.nps)}
                <span className="chess-info-pv"> {formatPv(info.pv)}</span>
              </>
            )}
          </div>

          <div className="chess-actions">
            <button type="button" onClick={() => startGame(player, level)}>
              new game
            </button>
            <button type="button" onClick={takeBack} disabled={!state?.ply || thinking}>
              take back
            </button>
            <button type="button" onClick={() => setFlipped((value) => !value)}>
              flip
            </button>
            <button type="button" onClick={copyFen}>
              {copied ? 'copied' : 'copy fen'}
            </button>
          </div>
        </div>

        <div className="chess-moves">
          <div className="chess-moves-head">moves</div>
          <ol className="chess-moves-list">
            {pairs.length === 0 && <li className="chess-moves-empty">no moves yet</li>}
            {pairs.map((row) => (
              <li key={row.number}>
                <span className="chess-move-number">{row.number}.</span>
                <span className="chess-move">{row.white}</span>
                <span className="chess-move">{row.black ?? ''}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}
