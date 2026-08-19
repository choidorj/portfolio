/* Runs the WebAssembly engine off the main thread. The search blocks this
   worker while it runs, which is fine: the player cannot move during the
   engine's turn, and stale requests are discarded by id on the other side. */
import { ENGINE_BUILD } from './engine-protocol'
import type { EngineRequest, EngineResponse, EngineState } from './engine-protocol'

interface EmscriptenModule {
  cwrap(name: string, returnType: string | null, argTypes: string[]): (...args: never[]) => unknown
}

type EngineFactory = (options?: { locateFile?: (path: string) => string }) => Promise<EmscriptenModule>

interface EngineApi {
  init(seed: number, ttMb: number): void
  newGame(): void
  setFen(fen: string): number
  play(uci: string): number
  undo(plies: number): number
  search(level: number): string
  state(): string
  version(): number
}

/** Floor on how quickly the engine will answer, in milliseconds. */
const MIN_MOVE_MS = 350

let api: EngineApi | null = null

function post(message: EngineResponse) {
  self.postMessage(message)
}

async function load(): Promise<EngineApi> {
  /* Built artifacts live in public/, outside the bundler's graph. */
  const url = `/engine/chess.js?v=${ENGINE_BUILD}`
  const module = (await import(/* @vite-ignore */ url)) as { default: EngineFactory }
  const wasm = await module.default({
    locateFile: () => `/engine/chess.wasm?v=${ENGINE_BUILD}`,
  })

  const cwrap = wasm.cwrap.bind(wasm)
  return {
    init: cwrap('engine_init', null, ['number', 'number']),
    newGame: cwrap('engine_new_game', null, []),
    setFen: cwrap('engine_set_fen', 'number', ['string']),
    play: cwrap('engine_play_uci', 'number', ['string']),
    undo: cwrap('engine_undo', 'number', ['number']),
    search: cwrap('engine_search', 'string', ['number']),
    state: cwrap('engine_state_json', 'string', []),
    version: cwrap('engine_version', 'number', []),
  } as EngineApi
}

function snapshot(engine: EngineApi): EngineState {
  return JSON.parse(engine.state()) as EngineState
}

self.onmessage = async (event: MessageEvent<EngineRequest>) => {
  const request = event.data

  try {
    if (request.type === 'init') {
      if (!api) {
        api = await load()
        api.init(request.seed >>> 0, 32)
        if (api.version() !== ENGINE_BUILD) {
          post({
            id: request.id,
            type: 'error',
            message: `engine build mismatch: wasm reports ${api.version()}, app expects ${ENGINE_BUILD}`,
          })
          return
        }
      }
      post({ id: request.id, type: 'ready', state: snapshot(api) })
      return
    }

    if (!api) {
      post({ id: request.id, type: 'error', message: 'engine is not loaded yet' })
      return
    }

    switch (request.type) {
      case 'newGame':
        api.newGame()
        post({ id: request.id, type: 'state', state: snapshot(api) })
        break

      case 'setFen':
        if (!api.setFen(request.fen)) {
          post({ id: request.id, type: 'rejected', state: snapshot(api) })
          break
        }
        post({ id: request.id, type: 'state', state: snapshot(api) })
        break

      case 'play':
        if (!api.play(request.uci)) {
          post({ id: request.id, type: 'rejected', state: snapshot(api) })
          break
        }
        post({ id: request.id, type: 'state', state: snapshot(api) })
        break

      case 'undo':
        api.undo(request.plies)
        post({ id: request.id, type: 'state', state: snapshot(api) })
        break

      case 'search': {
        const started = Date.now()
        const move = api.search(request.level)
        const played = move && move !== '0000' && api.play(move) === 1

        /* The weak levels finish in a few milliseconds. Holding the reply back
           briefly keeps the game readable instead of the board snapping. */
        const remaining = MIN_MOVE_MS - (Date.now() - started)
        if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining))

        post({
          id: request.id,
          type: 'move',
          move: played ? move : null,
          state: snapshot(api),
        })
        break
      }
    }
  } catch (error) {
    post({ id: request.id, type: 'error', message: (error as Error).message })
  }
}
