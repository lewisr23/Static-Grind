import { useEffect, useRef } from 'react'

/**
 * Animated glitch backdrop for the landing screen.
 * Full-viewport canvas: film grain, a drifting scan band, random RGB
 * block artifacts, and occasional horizontal "tear" displacements.
 * Redraws at ~12fps — cheap, and the stutter reads as intentional.
 */
export default function NoiseBackground() {
  const canvasRef = useRef()

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf
    let last = 0
    let scanY = 0

    function resize() {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // Offscreen noise tile, regenerated each draw and tiled across the screen
    const tile = document.createElement('canvas')
    tile.width = tile.height = 128
    const tctx = tile.getContext('2d')
    const img = tctx.createImageData(128, 128)
    const data = img.data

    function draw(t) {
      raf = requestAnimationFrame(draw)
      if (t - last < 80) return
      last = t

      const w = canvas.width
      const h = canvas.height

      // regenerate grain
      for (let i = 0; i < data.length; i += 4) {
        const v = Math.random() * 255
        data[i] = data[i + 1] = data[i + 2] = v
        data[i + 3] = 255
      }
      tctx.putImageData(img, 0, 0)

      ctx.clearRect(0, 0, w, h)

      // tiled grain
      ctx.globalAlpha = 0.07
      for (let y = 0; y < h; y += 128) {
        for (let x = 0; x < w; x += 128) {
          ctx.drawImage(tile, x, y)
        }
      }

      // drifting scan band
      scanY = (scanY + 7) % (h + 160)
      const grad = ctx.createLinearGradient(0, scanY - 80, 0, scanY + 80)
      grad.addColorStop(0, 'rgba(255,255,255,0)')
      grad.addColorStop(0.5, 'rgba(255,255,255,1)')
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.globalAlpha = 0.05
      ctx.fillStyle = grad
      ctx.fillRect(0, scanY - 80, w, 160)

      // random RGB block artifacts
      if (Math.random() < 0.4) {
        const colors = ['rgba(255,0,60,1)', 'rgba(0,200,255,1)', 'rgba(255,255,255,1)']
        const n = 1 + ((Math.random() * 3) | 0)
        for (let i = 0; i < n; i++) {
          const bw = 30 + Math.random() * 200
          const bh = 3 + Math.random() * 24
          ctx.globalAlpha = 0.05 + Math.random() * 0.1
          ctx.fillStyle = colors[(Math.random() * colors.length) | 0]
          ctx.fillRect(Math.random() * w, Math.random() * h, bw, bh)
        }
      }

      // occasional horizontal tear — smear a slice of what's already drawn
      if (Math.random() < 0.1) {
        const y = Math.random() * h
        const sh = 10 + Math.random() * 50
        const dx = (Math.random() - 0.5) * 140
        ctx.globalAlpha = 0.15
        ctx.drawImage(canvas, 0, y, w, sh, dx, y, w, sh)
      }

      ctx.globalAlpha = 1
    }

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="noise-bg" aria-hidden="true" />
}
