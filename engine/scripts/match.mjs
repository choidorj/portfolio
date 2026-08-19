/* Minimal UCI match runner, used to measure playing strength.
 *
 * Game results are adjudicated by a third instance of our own engine via its
 * non-standard `state` command. That is the same rules code the perft suite
 * verifies to depth 6, so it is trustworthy as an arbiter.
 *
 *   node scripts/match.mjs \
 *     --a "./build/chess-uci" --a-opt "Level=4,OwnBook=false" \
 *     --b "stockfish" --b-opt "UCI_LimitStrength=true,UCI_Elo=1700" \
 *     --b-movetime 300 --games 100
 */
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, '')] = argv[i + 1]
  return args
}

const args = parseArgs(process.argv.slice(2))
const GAMES = Number(args.games ?? 100)
const ARBITER = args.arbiter ?? './build/chess-uci'
const MAX_PLIES = Number(args['max-plies'] ?? 400)
const CONCURRENCY = Number(args.concurrency ?? 4)

/* Balanced, well-known openings so neither side gets a book advantage. */
const OPENINGS = [
  '', 'e2e4 e7e5', 'e2e4 c7c5', 'e2e4 e7e6', 'e2e4 c7c6', 'd2d4 d7d5', 'd2d4 g8f6',
  'd2d4 e7e6', 'c2c4 e7e5', 'c2c4 g8f6', 'g1f3 d7d5', 'e2e4 d7d5', 'd2d4 d7d5 c2c4 e7e6',
  'e2e4 e7e5 g1f3 b8c6', 'd2d4 g8f6 c2c4 g7g6', 'e2e4 c7c5 g1f3 d7d6',
]

class Engine {
  constructor(command, options) {
    const parts = command.split(' ')
    this.process = spawn(parts[0], parts.slice(1), { stdio: ['pipe', 'pipe', 'ignore'] })
    this.lines = createInterface({ input: this.process.stdout })
    this.queue = []
    this.lines.on('line', (line) => {
      for (let i = this.queue.length - 1; i >= 0; i--) {
        if (this.queue[i].match(line)) {
          this.queue.splice(i, 1)[0].resolve(line)
          return
        }
      }
    })
    this.options = options
  }

  send(command) {
    this.process.stdin.write(`${command}\n`)
  }

  await(match) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`engine timed out waiting for a reply`)), 60_000)
      this.queue.push({
        match,
        resolve: (line) => {
          clearTimeout(timer)
          resolve(line)
        },
      })
    })
  }

  async handshake() {
    this.send('uci')
    await this.await((line) => line === 'uciok')
    for (const [name, value] of Object.entries(this.options))
      this.send(`setoption name ${name} value ${value}`)
    this.send('isready')
    await this.await((line) => line === 'readyok')
  }

  async bestMove(moves) {
    this.send(`position startpos${moves.length ? ` moves ${moves.join(' ')}` : ''}`)
    this.send(`go${this.go ? ` ${this.go}` : ''}`)
    const line = await this.await((l) => l.startsWith('bestmove'))
    return line.split(/\s+/)[1]
  }

  async state(moves) {
    this.send(`position startpos${moves.length ? ` moves ${moves.join(' ')}` : ''}`)
    this.send('state')
    const line = await this.await((l) => l.startsWith('{'))
    return JSON.parse(line)
  }

  async newGame() {
    this.send('ucinewgame')
    this.send('isready')
    await this.await((line) => line === 'readyok')
  }

  close() {
    this.send('quit')
    setTimeout(() => this.process.kill(), 500)
  }
}

/* Plays one game. `white` and `black` are Engine instances. */
async function playGame(white, black, arbiter, opening) {
  const moves = opening ? opening.split(' ') : []
  await white.newGame()
  await black.newGame()

  for (let ply = moves.length; ply < MAX_PLIES; ply++) {
    const state = await arbiter.state(moves)
    if (state.result !== 'none') {
      if (state.result === 'checkmate') return state.winner === 'w' ? '1-0' : '0-1'
      return '1/2-1/2'
    }

    const side = state.turn === 'w' ? white : black
    const move = await side.bestMove(moves)

    if (!move || move === '(none)' || move === '0000' || !state.legal.includes(move)) {
      /* An engine that cannot produce a legal move forfeits. */
      console.error(`illegal move ${move} at ply ${ply}; legal: ${state.legal.length}`)
      return state.turn === 'w' ? '0-1' : '1-0'
    }
    moves.push(move)
  }
  return '1/2-1/2'
}

function elo(score) {
  if (score <= 0) return -Infinity
  if (score >= 1) return Infinity
  return -400 * Math.log10(1 / score - 1)
}

async function runPair(index, results) {
  const a = new Engine(args.a, parseOptions(args['a-opt']))
  const b = new Engine(args.b, parseOptions(args['b-opt']))
  const arbiter = new Engine(ARBITER, {})
  /* Everything after `go`, e.g. "nodes 15000" or "movetime 300". */
  a.go = args['a-go'] ?? (args['a-movetime'] ? `movetime ${args['a-movetime']}` : '')
  b.go = args['b-go'] ?? (args['b-movetime'] ? `movetime ${args['b-movetime']}` : '')

  await Promise.all([a.handshake(), b.handshake(), arbiter.handshake()])

  for (let game = index; game < GAMES; game += CONCURRENCY) {
    const opening = OPENINGS[game % OPENINGS.length]
    /* Alternate colours so any first-move advantage cancels out. */
    const aIsWhite = game % 2 === 0
    const result = await playGame(aIsWhite ? a : b, aIsWhite ? b : a, arbiter, opening)

    let points
    if (result === '1/2-1/2') points = 0.5
    else if ((result === '1-0') === aIsWhite) points = 1
    else points = 0

    results.push(points)
    const wins = results.filter((p) => p === 1).length
    const losses = results.filter((p) => p === 0).length
    const draws = results.filter((p) => p === 0.5).length
    const score = results.reduce((sum, p) => sum + p, 0) / results.length
    process.stdout.write(
      `\r${results.length}/${GAMES}  +${wins} -${losses} =${draws}  ` +
        `score ${(score * 100).toFixed(1)}%  elo ${elo(score) >= 0 ? '+' : ''}${elo(score).toFixed(0)}   `,
    )
  }

  a.close()
  b.close()
  arbiter.close()
}

function parseOptions(spec) {
  if (!spec) return {}
  return Object.fromEntries(spec.split(',').map((pair) => pair.split('=')))
}

const results = []
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, GAMES) }, (_, i) => runPair(i, results)),
)

const score = results.reduce((sum, p) => sum + p, 0) / results.length
/* Standard error of the mean score, propagated into Elo. */
const variance =
  results.reduce((sum, p) => sum + (p - score) ** 2, 0) / Math.max(1, results.length - 1)
const stderr = Math.sqrt(variance / results.length)
const margin = 1.96 * stderr

console.log(`\n\ngames    ${results.length}`)
console.log(`score    ${(score * 100).toFixed(1)}%  (95% CI ${((score - margin) * 100).toFixed(1)}% .. ${((score + margin) * 100).toFixed(1)}%)`)
console.log(`elo diff ${elo(score) >= 0 ? '+' : ''}${elo(score).toFixed(0)}  (95% CI ${elo(score - margin).toFixed(0)} .. ${elo(score + margin).toFixed(0)})`)
process.exit(0)
