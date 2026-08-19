/* Messages exchanged with the WebAssembly engine worker.
   The engine owns every chess rule; the UI only renders EngineState. */

/* Bump when public/engine/chess.{js,wasm} is rebuilt, so the immutable cache
   headers on those files never serve a stale build. Must match
   ENGINE_VERSION in engine/src/wasm_api.c. */
export const ENGINE_BUILD = 1

export type Square = number // 0 = a8, 63 = h1, matching EngineState.board

export type Result = 'none' | 'checkmate' | 'stalemate' | 'fifty' | 'repetition' | 'material'

export interface EngineState {
  fen: string
  /** 64 characters in reading order (a8 first). Uppercase = white, '.' = empty. */
  board: string
  turn: 'w' | 'b'
  check: boolean
  result: Result
  winner: 'w' | 'b' | null
  halfmove: number
  fullmove: number
  ply: number
  last: string | null
  legal: string[]
  san: string[]
  moves: string[]
}

export interface SearchInfo {
  depth: number
  /** Centipawns from the engine's point of view, or moves-to-mate when `mate`. */
  score: number
  mate: boolean
  nodes: number
  nps: number
  time: number
  pv: string
  /** Set when the move came straight from the opening book, with no search. */
  book?: boolean
}

export type EngineRequest =
  | { id: number; type: 'init'; seed: number }
  | { id: number; type: 'newGame' }
  | { id: number; type: 'setFen'; fen: string }
  | { id: number; type: 'play'; uci: string }
  | { id: number; type: 'undo'; plies: number }
  | { id: number; type: 'search'; level: number }

/** A request without its id. Distributes over the union, unlike a bare Omit. */
export type EngineCommand = EngineRequest extends infer T
  ? T extends { id: number }
    ? Omit<T, 'id'>
    : never
  : never

export type EngineResponse =
  | { id: number; type: 'ready'; state: EngineState }
  | { id: number; type: 'state'; state: EngineState }
  | { id: number; type: 'move'; move: string | null; state: EngineState }
  | { id: number; type: 'rejected'; state: EngineState }
  | { id: number; type: 'error'; message: string }
  | ({ type: 'info' } & SearchInfo)

/** Squares are indexed a8..h1; UCI names them from White's side. */
export function squareToIndex(name: string): Square {
  const file = name.charCodeAt(0) - 97
  const rank = name.charCodeAt(1) - 49
  return (7 - rank) * 8 + file
}

export function indexToSquare(index: Square): string {
  return String.fromCharCode(97 + (index % 8), 49 + (7 - Math.floor(index / 8)))
}
