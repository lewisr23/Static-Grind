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

It's a static bundle, so any static host works. This one deploys as a Cloudflare Worker
serving static assets, built from the repo by Workers Builds:

| Setting | Value |
| --- | --- |
| Root directory | `/frontend` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Version command | `npx wrangler versions upload` |
| Production branch | `main` |

`frontend/wrangler.jsonc` is what tells `wrangler deploy` this is a static-asset site rather
than a Worker script, and points it at the `dist/` build output. `public/_headers` sets
long-lived caching on the fingerprinted assets plus a few basic security headers, and gets
picked up automatically. Note the webcam source needs HTTPS, which Cloudflare provides by
default.

## The Android app

`frontend/android/` is a Capacitor shell around the same bundle the website
runs. The pipeline needs no porting: Android's WebView is Chrome underneath, so
the WebGL pass, the ES-module worker, the WASM crate, `MediaRecorder` and
WebCodecs all run there unchanged.

What did need work was the three places a WebView is not a browser.

`<a download>` does nothing at all inside a WebView. No file, no error, no
visible result. `navigator.share`, which the web build falls back to for
iOS, isn't implemented there either, because Web Share is a Chrome feature
rather than a WebView one. So the app branch writes the blob to the cache
directory and hands it to the system share sheet instead. `src/platform/native.js`
holds that, along with the status bar and splash. Nothing in it is reachable
from the web build: `isNative()` is false in a browser and the Capacitor
packages are only ever pulled in through dynamic `import()` behind a native
branch, so Vite splits them into chunks the site never downloads. The web
bundle grew 2.5KB.

The webcam source needs `CAMERA` in the manifest before the WebView will grant
`getUserMedia`. The camera is declared `required="false"` so the Play listing
doesn't exclude every device without one. Those still open image and video
files, and the UI already handles the webcam being unavailable.

`androidScheme` is `https`, which serves the WebView from `https://localhost`.
That's a secure context, which `getUserMedia` and WebCodecs both require. It
also broke the accounts check. `accountsAvailable` treated hostname `localhost`
as "a dev machine, the Spring server is probably up", which is true on a laptop
and false on a phone, where localhost is the phone. The app was firing auth
requests at itself on launch. In the app, accounts exist only when
`VITE_API_URL` was set at build time.

```bash
npm run android:debug
```

That builds the web bundle, syncs it into the Android project and assembles a
debug APK, about 4.2MB. It needs the Android SDK (platform 35 and build-tools
35) on top of the JDK 17 Gradle already wants, and `android/local.properties`
pointing at the SDK, which is gitignored so each machine sets its own.

Capacitor 6 scaffolds the project at compile and target SDK 34. That was bumped
to 35, because Play has required target 35 for new apps since August 2025 and a
34 build is rejected at upload. Compiling against 35 needs Android Gradle Plugin
8.6 or newer, so the AGP went 8.2.1 to 8.6.1 and the Gradle wrapper 8.2.1 to
8.7 alongside it. `npm run
android:open` opens the project in Android Studio instead, and `npm run
android:aab` produces the signed-release bundle Play takes.

## The phone layout

Stacked in one column, the picture scrolled off the top while you were turning
the knob that changes it, which for a live tool is the whole point gone. On the
web you could scroll back; in an app there's no URL bar to give the space back.

So on phones the picture stops participating in flow entirely. It's fixed
behind everything, and the controls ride over it in a sheet that scrolls inside
itself, which means the page never scrolls and the picture is never not
visible. The tab strip sticks to the sheet's top edge so switching group
doesn't cost a scroll, and the five transport actions moved into a fixed bottom
bar. They were wrapping to three rows, which cost 236px of the 740 a common
Android phone has.

All of it lives in a `max-width: 700px` block. The three-column desk and the
700–1100 single-column band are untouched.

## Status

Feature-complete on desktop and phone. The Android app builds and runs; it is
not on the Play Store yet.
