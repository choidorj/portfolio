/* End-to-end check in real Chrome: loads /chess, waits for the WebAssembly
 * engine, plays a move, and asserts the engine replies. Reports any console
 * error or uncaught exception.
 *
 *   node engine/tests/browser-smoke.mjs [url]
 */
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const URL_UNDER_TEST = process.argv[2] ?? 'http://localhost:4173/chess'
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9222 + Math.floor(Math.random() * 500)

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'chess-smoke-'))}`,
    '--window-size=780,1400',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function findTarget() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const targets = await response.json()
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page.webSocketDebuggerUrl
    } catch {
      /* Chrome is still starting. */
    }
    await sleep(150)
  }
  throw new Error('could not reach the Chrome debugging endpoint')
}

const socketUrl = await findTarget()
const socket = new WebSocket(socketUrl)
await new Promise((resolve, reject) => {
  socket.onopen = resolve
  socket.onerror = () => reject(new Error('devtools websocket failed'))
})

let nextId = 0
const pending = new Map()
const consoleErrors = []
const consoleAll = []

socket.onmessage = (event) => {
  const message = JSON.parse(event.data)

  if (message.id !== undefined && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(message.error.message))
    else resolve(message.result)
    return
  }

  if (message.method === 'Runtime.consoleAPICalled') {
    const text = (message.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ')
    consoleAll.push(`${message.params.type}: ${text}`)
    if (message.params.type === 'error') consoleErrors.push(text)
  }
  if (message.method === 'Runtime.exceptionThrown') {
    const details = message.params.exceptionDetails
    consoleErrors.push(details.exception?.description ?? details.text)
  }
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    const entry = message.params.entry
    /* Vercel's analytics scripts only exist on Vercel, so they 404 locally. */
    if (entry.url?.includes('/_vercel/')) return
    consoleErrors.push(`${entry.source}: ${entry.text}${entry.url ? ` <${entry.url}>` : ''}`)
  }
}

function send(method, params = {}) {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}

async function waitFor(label, expression, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return true
    await sleep(200)
  }
  throw new Error(`timed out waiting for ${label}`)
}

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures++
}

try {
  await send('Runtime.enable')
  await send('Log.enable')
  await send('Page.enable')
  await send('Page.navigate', { url: URL_UNDER_TEST })

  await waitFor('the page to render', 'document.querySelectorAll(".square").length === 64')
  check('board rendered 64 squares', true)

  /* Pieces only appear once the engine has reported its first state. */
  await waitFor('the engine to load', 'document.querySelectorAll(".square img").length === 32')
  check('engine loaded and placed 32 pieces', true)

  const status = await evaluate('document.querySelector(".chess-status").textContent')
  check('status is ready for the player', status.includes('your move'), status)

  /* Every square must be the same size and actually square, and the rank
     labels must line up with the rows they name. */
  const geometry = await evaluate(`
    (() => {
      const rects = [...document.querySelectorAll('.square')].map((s) => s.getBoundingClientRect());
      const widths = new Set(rects.map((r) => Math.round(r.width)));
      const heights = new Set(rects.map((r) => Math.round(r.height)));
      const labels = [...document.querySelectorAll('.board-ranks span')].map((s) => {
        const r = s.getBoundingClientRect();
        return Math.round(r.top + r.height / 2);
      });
      const rowCentres = [];
      for (let row = 0; row < 8; row++) {
        const r = rects[row * 8];
        rowCentres.push(Math.round(r.top + r.height / 2));
      }
      return {
        widths: [...widths],
        heights: [...heights],
        maxLabelOffset: Math.max(...labels.map((y, i) => Math.abs(y - rowCentres[i]))),
      };
    })()`)

  check('all squares share one width', geometry.widths.length === 1, JSON.stringify(geometry.widths))
  check('all squares share one height', geometry.heights.length === 1, JSON.stringify(geometry.heights))
  check(
    'squares are square',
    Math.abs(geometry.widths[0] - geometry.heights[0]) <= 1,
    `${geometry.widths[0]}x${geometry.heights[0]}`,
  )
  check(
    'rank labels line up with their rows',
    geometry.maxLabelOffset <= 2,
    `worst offset ${geometry.maxLabelOffset}px`,
  )

  /* Play 1. e4 by clicking e2 then e4. */
  const clickSquare = (name) => `
    (() => {
      const squares = [...document.querySelectorAll('.square')];
      const target = squares.find((s) => (s.getAttribute('aria-label') || '').endsWith(' ${name}')
        || s.getAttribute('aria-label') === '${name}');
      if (!target) return false;
      target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
      target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
      target.click();
      return true;
    })()`

  check('selected the e2 pawn', await evaluate(clickSquare('e2')))
  await waitFor('legal targets to show', 'document.querySelectorAll(".is-target").length > 0')
  check('legal destinations highlighted', true)

  check('clicked e4', await evaluate(clickSquare('e4')))

  await waitFor(
    'the engine to reply',
    'document.querySelectorAll(".chess-moves-list li").length >= 1 && ' +
      'document.querySelectorAll(".chess-move")[1]?.textContent?.length > 0',
  )

  const moves = await evaluate(
    '[...document.querySelectorAll(".chess-move")].map((e) => e.textContent).filter(Boolean)',
  )
  check('player move recorded as e4', moves[0] === 'e4', JSON.stringify(moves))
  check('engine replied with a move', !!moves[1], JSON.stringify(moves))

  const info = await evaluate('document.querySelector(".chess-info").textContent')
  check(
    'engine reported what it did',
    info.includes('depth') || info.includes('book'),
    info.slice(0, 90),
  )

  await send('Page.captureScreenshot', { format: 'png' }).then(async (shot) => {
    const { writeFile } = await import('node:fs/promises')
    await writeFile('/tmp/chess-e2e.png', Buffer.from(shot.data, 'base64'))
  })

  /* The game survives a reload, because it is replayed through the engine. */
  const savedMoves = await evaluate('JSON.parse(localStorage.getItem("chess-game")).moves.length')
  check('game was persisted', savedMoves === 2, `${savedMoves} moves stored`)

  await send('Page.navigate', { url: URL_UNDER_TEST })
  await waitFor('the restored game', 'document.querySelectorAll(".chess-move").length >= 2')
  const restored = await evaluate(
    '[...document.querySelectorAll(".chess-move")].map((e) => e.textContent).filter(Boolean)',
  )
  check('reload restored both moves', restored.length === 2, JSON.stringify(restored))

  /* Take back should undo the engine's reply too, so it stays the player's turn. */
  await evaluate(
    `[...document.querySelectorAll('.chess-actions button')].find((b) => b.textContent === 'take back').click()`,
  )
  await waitFor('the take back', 'document.querySelectorAll(".chess-move").length === 0')
  const afterUndo = await evaluate('document.querySelector(".chess-status").textContent')
  check('take back returns the move to the player', afterUndo.includes('your move'), afterUndo)

  /* Narrow viewport: the board must stay square and fit the screen. */
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  })
  await sleep(400)
  const mobile = await evaluate(`
    (() => {
      const board = document.querySelector('.board').getBoundingClientRect();
      return { width: Math.round(board.width), height: Math.round(board.height),
               overflow: document.documentElement.scrollWidth > window.innerWidth };
    })()`)
  check('board is square on mobile', Math.abs(mobile.width - mobile.height) <= 1, JSON.stringify(mobile))
  check('no horizontal overflow on mobile', !mobile.overflow, JSON.stringify(mobile))

  await send('Page.captureScreenshot', { format: 'png' }).then(async (shot) => {
    const { writeFile } = await import('node:fs/promises')
    await writeFile('/tmp/chess-mobile.png', Buffer.from(shot.data, 'base64'))
  })

  check('no console errors', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 400))
} catch (error) {
  failures++
  console.log(`FAIL ${error.message}`)
  if (consoleErrors.length) console.log(`console errors:\n  ${consoleErrors.join('\n  ')}`)
  else if (consoleAll.length) console.log(`console output:\n  ${consoleAll.slice(-8).join('\n  ')}`)
} finally {
  socket.close()
  chrome.kill()
}

console.log(failures ? `BROWSER SMOKE FAILED (${failures})` : 'BROWSER SMOKE PASSED')
process.exit(failures ? 1 : 0)
