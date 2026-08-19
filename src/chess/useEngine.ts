import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  EngineCommand,
  EngineRequest,
  EngineResponse,
  EngineState,
  SearchInfo,
} from './engine-protocol'

type Pending = (response: EngineResponse) => void

/** Owns the engine worker and turns its messages into React state. */
export function useEngine() {
  const workerRef = useRef<Worker | null>(null)
  const pendingRef = useRef(new Map<number, Pending>())
  const idRef = useRef(0)

  const [state, setState] = useState<EngineState | null>(null)
  const [info, setInfo] = useState<SearchInfo | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    const pending = pendingRef.current

    worker.onmessage = (event: MessageEvent<EngineResponse>) => {
      const message = event.data

      if (message.type === 'info') {
        setInfo(message)
        return
      }
      if (message.type === 'error') {
        setError(message.message)
      } else {
        setState(message.state)
        if (message.type === 'ready') setReady(true)
      }

      const resolve = pending.get(message.id)
      if (resolve) {
        pending.delete(message.id)
        resolve(message)
      }
    }

    worker.onerror = () => setError('the engine worker failed to start')

    const id = ++idRef.current
    worker.postMessage({
      id,
      type: 'init',
      seed: Math.floor(Math.random() * 0xffffffff),
    } satisfies EngineRequest)

    return () => {
      worker.terminate()
      pending.clear()
      workerRef.current = null
      setReady(false)
    }
  }, [])

  const request = useCallback((message: EngineCommand): Promise<EngineResponse> => {
    const worker = workerRef.current
    if (!worker) return Promise.resolve({ id: -1, type: 'error', message: 'engine not running' })

    const id = ++idRef.current
    return new Promise((resolve) => {
      pendingRef.current.set(id, resolve)
      worker.postMessage({ ...message, id } as EngineRequest)
    })
  }, [])

  const newGame = useCallback(() => {
    setInfo(null)
    return request({ type: 'newGame' })
  }, [request])

  const play = useCallback((uci: string) => request({ type: 'play', uci }), [request])
  const undo = useCallback((plies: number) => request({ type: 'undo', plies }), [request])
  const search = useCallback((level: number) => request({ type: 'search', level }), [request])

  return { state, info, ready, error, newGame, play, undo, search, setInfo }
}
