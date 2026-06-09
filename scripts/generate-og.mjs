// Renders the static social preview card to public/og.png.
// Dev-only: run with `npm run gen:og`. Not part of the deployed build.
import { readFileSync, writeFileSync } from 'node:fs'
import { createElement as h } from 'react'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'

const fontRegular = readFileSync(new URL('../public/fonts/MonaspaceNeon-Regular.woff', import.meta.url))
const fontBold = readFileSync(new URL('../public/fonts/MonaspaceNeon-Bold.woff', import.meta.url))

const markup = h(
  'div',
  {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      backgroundColor: '#282828',
      padding: 80,
      fontFamily: 'Monaspace Neon',
    },
  },
  h(
    'div',
    { style: { display: 'flex', flexDirection: 'column' } },
    h('div', { style: { fontSize: 82, fontWeight: 700, color: '#fbf1c7' } }, 'choidorj bayarkhuu'),
    h(
      'div',
      { style: { fontSize: 36, color: '#a89984', marginTop: 18 } },
      'undergraduate at ucla studying computer science.',
    ),
  ),
  h(
    'div',
    { style: { display: 'flex', alignItems: 'center', fontSize: 30, color: '#83a598' } },
    h('div', { style: { width: 18, height: 18, backgroundColor: '#fabd2f', marginRight: 18 } }),
    h('div', null, 'choidorj.com'),
  ),
)

const svg = await satori(markup, {
  width: 1200,
  height: 630,
  fonts: [
    { name: 'Monaspace Neon', data: fontRegular, weight: 400, style: 'normal' },
    { name: 'Monaspace Neon', data: fontBold, weight: 700, style: 'normal' },
  ],
})

const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng()
writeFileSync(new URL('../public/og.png', import.meta.url), png)
console.log(`Wrote public/og.png (${png.length} bytes)`)
