import { useEffect, useRef } from 'react'

/**
 * Animated grain backdrop for the landing screen.
 * Full-viewport canvas of film grain, redrawn at ~12fps — cheap, and the
 * stutter reads as intentional. It used to also draw a drifting scan band,
 * random colour blocks and horizontal tears; those went because they made
 * the page look like every other glitch site. The grain alone carries the
 * static feel.
 */
export default function NoiseBackground() {
  const canvasRef = useRef()

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf
    let last = 0

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
      // A 0-size canvas (mid resize, or a browser reporting a transient
      // viewport of 0 during layout) throws on drawImage below — just skip
      // the frame and pick it up again once there's something to draw into.
      if (w === 0 || h === 0) return

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
