/* Exercises the compiled WebAssembly API the way the worker does, without a
   browser. Run with `make wasmtest`. */
import createEngine from '../build/chess-node.mjs'

const infos = []
globalThis.self = { postMessage: (msg) => infos.push(msg) }

let failures = 0
const check = (label, condition, detail = '') => {
  if (condition) return
  failures++
  console.log(`FAIL ${label}${detail ? `  (${detail})` : ''}`)
}

const mod = await createEngine()

const api = {
  init: mod.cwrap('engine_init', null, ['number', 'number']),
  newGame: mod.cwrap('engine_new_game', null, []),
  setFen: mod.cwrap('engine_set_fen', 'number', ['string']),
  play: mod.cwrap('engine_play_uci', 'number', ['string']),
  undo: mod.cwrap('engine_undo', 'number', ['number']),
  search: mod.cwrap('engine_search', 'string', ['number']),
  state: mod.cwrap('engine_state_json', 'string', []),
  version: mod.cwrap('engine_version', 'number', []),
}

api.init(12345, 16)
check('version is exposed', api.version() === 1, `got ${api.version()}`)

let state = JSON.parse(api.state())
check('start position fen', state.fen.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq'))
check('start has 20 legal moves', state.legal.length === 20, `got ${state.legal.length}`)
check('board string is 64 chars', state.board.length === 64)
check('board a8 is a black rook', state.board[0] === 'r', `got ${state.board[0]}`)
check('board h1 is a white rook', state.board[63] === 'R', `got ${state.board[63]}`)
check('white to move', state.turn === 'w')
check('no result yet', state.result === 'none')

check('legal move accepted', api.play('e2e4') === 1)
check('illegal move refused', api.play('e2e5') === 0)
check('nonsense move refused', api.play('zzzz') === 0)
check('garbage refused', api.play('') === 0)

state = JSON.parse(api.state())
check('turn flipped', state.turn === 'b')
check('san recorded', state.san.length === 1 && state.san[0] === 'e4', `got ${state.san}`)
check('last move reported', state.last === 'e2e4')

check('undo works', api.undo(1) === 1)
state = JSON.parse(api.state())
check('undo restored the position', state.ply === 0 && state.turn === 'w')

/* Fool's mate: the engine must see the game is over. */
api.newGame()
for (const move of ['f2f3', 'e7e5', 'g2g4', 'd8h4']) check(`play ${move}`, api.play(move) === 1)
state = JSON.parse(api.state())
check('checkmate detected', state.result === 'checkmate', `got ${state.result}`)
check('black wins', state.winner === 'b')
check('no legal moves at mate', state.legal.length === 0)
check('engine returns no move when mated', api.search(3) === '0000', `got ${api.search(3)}`)

/* Stalemate. */
check('stalemate fen accepted', api.setFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1') === 1)
state = JSON.parse(api.state())
check('stalemate detected', state.result === 'stalemate', `got ${state.result}`)

check('bad fen refused', api.setFen('not a fen') === 0)

/* Mate in one: the search has to find it, and report a mate score. */
infos.length = 0
check('mate-in-1 fen accepted', api.setFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1') === 1)
const best = api.search(6)
check('finds mate in one', best === 'a1a8', `got ${best}`)
check('info messages streamed', infos.length > 0, `got ${infos.length}`)
check('info reports mate', infos.some((i) => i.mate && i.score === 1), JSON.stringify(infos.at(-1)))
check('info has a pv', infos.at(-1).pv.startsWith('a1a8'))

/* Every level must return a legal move from a normal position. */
api.newGame()
api.play('e2e4')
api.play('e7e5')
const legalNow = new Set(JSON.parse(api.state()).legal)
for (let level = 1; level <= 6; level++) {
  const move = api.search(level)
  check(`level ${level} returns a legal move`, legalNow.has(move), `got ${move}`)
}

/* Promotion handling, including underpromotion. */
check('promotion fen accepted', api.setFen('8/P6k/8/8/8/8/7K/8 w - - 0 1') === 1)
check('queen promotion', api.play('a7a8q') === 1)
check('promoted piece on a8', JSON.parse(api.state()).board[0] === 'Q')
api.undo(1)
check('knight underpromotion', api.play('a7a8n') === 1)
check('underpromoted piece on a8', JSON.parse(api.state()).board[0] === 'N')

/* Castling and en passant survive the round trip. */
check('castling fen accepted', api.setFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1') === 1)
check('white castles kingside', api.play('e1g1') === 1)
let board = JSON.parse(api.state()).board
check('king on g1', board[62] === 'K', `got ${board[62]}`)
check('rook on f1', board[61] === 'R', `got ${board[61]}`)

check('ep fen accepted', api.setFen('8/8/8/3pP3/8/8/8/4K2k w - d6 0 1') === 1)
check('en passant capture legal', api.play('e5d6') === 1)
board = JSON.parse(api.state()).board
check('captured pawn removed', board[8 * 3 + 3] === '.', `got ${board[8 * 3 + 3]}`)

console.log(failures ? `WASM SMOKE FAILED (${failures})` : 'WASM SMOKE PASSED')
process.exit(failures ? 1 : 0)
