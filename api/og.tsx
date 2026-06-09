/** @jsxImportSource react */
import { ImageResponse } from '@vercel/og'

export const config = {
  runtime: 'edge',
}

export default async function handler(request: Request) {
  const { origin } = new URL(request.url)

  const [regular, bold] = await Promise.all([
    fetch(`${origin}/fonts/MonaspaceNeon-Regular.woff`).then((res) => res.arrayBuffer()),
    fetch(`${origin}/fonts/MonaspaceNeon-Bold.woff`).then((res) => res.arrayBuffer()),
  ])

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#282828',
          padding: 80,
          fontFamily: 'Monaspace Neon',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 82, fontWeight: 700, color: '#fbf1c7' }}>
            choidorj bayarkhuu
          </div>
          <div style={{ fontSize: 36, color: '#a89984', marginTop: 18 }}>
            undergraduate at ucla studying computer science.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 30, color: '#83a598' }}>
          <div style={{ width: 18, height: 18, backgroundColor: '#fabd2f', marginRight: 18 }} />
          <div>choidorj.com</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Monaspace Neon', data: regular, weight: 400, style: 'normal' },
        { name: 'Monaspace Neon', data: bold, weight: 700, style: 'normal' },
      ],
      headers: {
        'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      },
    },
  )
}
