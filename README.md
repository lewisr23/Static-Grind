# Static Grind

**[Live demo →](https://staticgrind.com)**

A free, browser-based glitch art tool. Drop in an image or video (or use your webcam), mangle it with real-time effects, and export the result as PNG, WebM or MP4. Everything runs client-side, nothing gets uploaded anywhere.

## What it does

Static Grind gives you a live canvas to grind images and video through classic glitch/VHS effects: chroma shift, scanlines, pixel sorting, block corruption, wave warp, hue shift, feedback loops, and more. Results update as you turn the knobs.

Its niche next to paid tools like Photomosh: free, minimal, and built to be fun to play with.

## How it's built

React and Vite. 

The pipeline runs in three stages. A hidden WebGL canvas runs the GPU effects in one fragment shader pass: chroma shift, wave warp, noise, interlace, displace, bit crush, hue shift, colour grading, feedback through ping-pong framebuffers, scanlines, vignette, saturation. A Web Worker runs the destructive effects that reorder pixels non-locally, which a fragment shader can't do: pixel sorting (horizontal, vertical, per-channel), block glitch, row shift, smear, melt, kaleidoscope. The result lands on the visible 2D canvas, which is what gets exported.

Video export uses MediaRecorder for WebM and WebCodecs plus mp4-muxer for MP4. Webcam input comes in through getUserMedia.

### Why the effects run in a worker

The pixel sorts are O(n log n) over every bright run in the frame. On a 2048px still that's tens of milliseconds, long enough to visibly stall the UI and drop video frames while you're trying to dial a knob in.

The frame's bytes go to the worker as a transferable, so neither side ever copies the buffer. The policy is one job in flight, newest wins. If a frame arrives while the worker's busy it gets dropped and the caller retries on the next tick, so stale frames get shed instead of piling into a backlog you'd see as lag. If workers aren't available it falls back to running on the main thread, so the tool loses some smoothness rather than breaking outright.

### Designing the knob response

Most of the work here wasn't making the effects run, it was making each knob feel like it's doing something across its whole travel. Several effects originally had big dead zones.

The pixel sorts thresholded on raw brightness (1 minus intensity), so on a dark photo nothing happened until about 90%, then everything happened at once. They now derive their threshold from the frame's own luma histogram, so the knob means "sort this share of the image" and behaves the same on any source.

Bit crush interpolated linearly from 255 levels, spending the whole first half of its travel between 255 and 128 levels, a difference no eye can see. It's exponential in bit depth now.

Block glitch, smear and melt gated both the event rate and the event size on the same linear factor, which attenuated the low end twice over. The rate now runs on a square root curve with a floor on event size.

Feedback had the same problem for a different reason. It works by blending each frame with the last one, and a linear knob mapped straight onto that blend weight, but the trail length you actually see is roughly 1 divided by (1 minus the blend), which barely moves for most of the range and then spikes hard in the last few percent. The knob went from doing nothing to doing a lot inside the last 10% of its travel. It's mapped onto the trail's half life in frames now instead of the raw blend weight, which is the number that actually scales the way you'd expect turning a knob to feel like it scales.

All the pixel-denominated shader parameters are authored against a 1000px-wide reference frame and scaled to the real canvas, so a 12px chroma shift looks the same on a phone snap as it does on a 4000px photo.

`scripts/curve-check.mjs` measures all this. It runs each effect across its full travel on a normal frame and a deliberately dark one, and reports how far the output moved from the source:

```bash
npm run curve-check
```

A healthy knob climbs steadily from its first few percent. A knob that reads `0.0` until `0.9` and then jumps to `40` is the bug this catches.

### Determinism

The destructive pass is seeded now instead of using `Math.random`. That's what lets a still hold steady while you dial a knob in. Before, every nudge reshuffled the block and tear placement, so there was no way to settle on a look. Reseed rerolls the placement without touching the knobs. Moving sources advance the seed each frame so the corruption stays alive.

The PRNG is xorshift32. The same three shifts with wrapping u32 arithmetic give you the same stream in any language, so a port of this pass can be checked against the JS output byte for byte.

### The Rust/WASM backend

`wasm/` is a Rust crate, a line-for-line port of `cpu.js`, run through `wasm-bindgen` and loaded from the worker. It exists because the destructive pass is the real bottleneck here. On an 800x600 frame with every Corrupt knob engaged, the JS path runs about 45 to 80ms; the WASM path runs about 18ms once warmed up. Both run off the main thread either way.

Porting the RNG made this checkable instead of just eyeballing it. Both backends take the same seed, and the RNG stream, sort keys and rounding all had to match exactly for the outputs to agree. They didn't at first: the Rust pixel sort truncated a luma value to an integer before comparing it against the threshold, where the JS compares the float directly, so pixels sitting right on the cutoff landed on different sides in each language. Fixed by comparing as floats in Rust too, then checked in-browser across 27 cases (three frame sizes, three seeds, params ranging from all off to all on), diffed byte for byte between the two backends with zero mismatches.

If WASM fails to load or throws, the worker falls back to the JS version silently. A build without the crate compiled is still a complete, working app. WASM is a speed upgrade underneath it, nothing more.

Rebuild it after changing `wasm/src/lib.rs`:

```bash
npm run build:wasm
```

Run that from `frontend/`. It needs Rust plus the `wasm32-unknown-unknown` target and `wasm-bindgen-cli`, version matched to the `wasm-bindgen` crate in `wasm/Cargo.toml`. On Windows the default MSVC linker needs Visual Studio's Build Tools. The GNU toolchain is a much smaller install and works fine: `rustup default stable-x86_64-pc-windows-gnu`, plus a real MinGW-w64 toolchain on `PATH` for `dlltool`, `gcc` and `ar` (`rust-mingw` on its own only ships import libraries, not the tools themselves).

`frontend/wasm/pkg/` (the compiled glue plus the `.wasm` binary, about 60KB) is committed, so cloning the repo and running `npm run build` works without Rust installed at all. Cloudflare Pages never needs to see a Rust toolchain.

## Running it locally

```bash
cd frontend
npm install
npm run dev
```

## Deploying

It's a static bundle, so any static host works. This one deploys on Cloudflare Pages. Connect the repo and set:

| Setting | Value |
| --- | --- |
| Root directory | `frontend` |
| Build command | `npm run build` |
| Build output directory | `dist` |

`public/_headers` sets long-lived caching on the fingerprinted assets plus a few basic security headers, and gets picked up automatically. Note the webcam source needs HTTPS, which Pages provides by default.

## Status

Feature-complete. Mobile layout is still rough.
