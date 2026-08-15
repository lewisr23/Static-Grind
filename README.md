# Static Grind

A free, browser-based glitch art generator. Upload an image or video (or use your webcam), apply real-time glitch effects, and export the result as PNG, WebM, or MP4 — all processed client-side, no upload required.

## What it does

Static Grind gives you a live canvas to mangle images and video with classic glitch/VHS-style effects — chroma shift, scanlines, pixel sorting, block corruption, wave warp, hue shift, feedback loops, and more — and see the result update in real time as you tweak the parameters.

Its niche next to paid tools like Photomosh: free, minimal, and built to be fun to play with rather than a technical/pro tool.

## How it's built

React + Vite frontend, and that's the whole app — everything runs entirely in the browser, no server round-trip for any of the actual image or video processing.

The rendering pipeline is a hybrid of two canvases working together:
- A hidden **WebGL canvas** for GPU-accelerated effects: chroma shift, wave warp, noise, interlace, displace, bit crush, hue shift, color grading, feedback/ping-pong framebuffers, scanlines.
- A visible **2D canvas** for CPU-side destructive effects: pixel sorting, block glitch, smear, melt, kaleidoscope.

Video export uses `MediaRecorder` and `mp4-muxer`/WebCodecs; webcam input comes in via `getUserMedia`.

## Status

Feature-complete for an MVP. Mobile layout and deployment are still pending.

## Running it locally

```
cd frontend
npm install
npm run dev
```
