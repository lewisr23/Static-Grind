/**
 * The handful of places the Android build has to behave differently from the
 * web build.
 *
 * Everything here is written so the web bundle is unaffected: `isNative()` is
 * false in a browser, the Capacitor packages are only ever reached through
 * dynamic `import()` inside a native branch, and so Vite splits them into
 * chunks the website downloads none of.
 */

// Capacitor injects this global into the WebView before any app code runs.
// Checking the global rather than importing @capacitor/core keeps this file
// free of a static dependency the web build would otherwise have to bundle.
export function isNative() {
  return typeof window !== 'undefined'
    && window.Capacitor?.isNativePlatform?.() === true
}

/*
 * Marks the document as the Android app so CSS can target it.
 *
 * The phone sheet layout is for the app only. The website's phone layout is
 * whatever it was before the app existed and stays that way, so nothing done
 * for the app can reach staticgrind.com.
 *
 * Runs at module scope rather than inside a component: Capacitor injects its
 * global before any app code, and this has to land before first paint or the
 * app would flash the website's layout on every launch.
 */
if (isNative()) {
  document.documentElement.classList.add('native-app')
}

/**
 * FileReader gives back a `data:<mime>;base64,<payload>` URL; Filesystem wants
 * the payload on its own. Chunking a big Uint8Array through String.fromCharCode
 * by hand is the usual alternative and blows the call stack on a long video, so
 * this goes through FileReader instead and just slices the prefix off.
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(blob)
  })
}

/**
 * Saves a generated blob from inside the Android app.
 *
 * `<a download>` — the web build's fallback — does nothing at all in an Android
 * WebView: no file, no error, no visible result. `navigator.share` isn't there
 * to catch it either, because Web Share is a Chrome feature rather than a
 * WebView one, so the web path's share-first branch never fires here.
 *
 * So the file goes to the gallery, through the MediaSaver plugin in
 * android/app/src/main/java. Hitting Snap is a save: the picture belongs in the
 * same place as everything else the phone's camera makes, with no sheet asking
 * where to put it first.
 *
 * Two hops rather than one, because Filesystem only speaks base64 and the
 * plugin only speaks files: the bytes land in the cache directory, the plugin
 * streams that copy into the gallery, and the cache copy goes. Cache is right
 * for a staging post — Android can reclaim it whenever it likes, and by then
 * the real file is somewhere else.
 *
 * Returns true when it handled the save, false to let the caller fall through
 * to the web path.
 */
export async function saveFileNative(blob, filename, mimeType) {
  if (!isNative()) return false

  const [{ Filesystem, Directory }, { registerPlugin }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/core'),
  ])

  const MediaSaver = registerPlugin('MediaSaver')

  const data = await blobToBase64(blob)
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data,
    directory: Directory.Cache,
  })

  try {
    await MediaSaver.save({ uri, filename, mimeType })
  } finally {
    // Best effort: a leftover cache file is tidied by Android eventually, and
    // failing the save over the cleanup would be the wrong way round.
    await Filesystem.deleteFile({ path: filename, directory: Directory.Cache })
      .catch(() => {})
  }

  return true
}

/**
 * Status bar and splash, called once on boot. Both no-op on the web.
 *
 * The splash is configured with launchAutoHide false so the WebView gets to
 * finish its first paint behind it — auto-hiding on a timer instead means a
 * flash of unstyled black on a slow device.
 */
export async function initNativeShell() {
  if (!isNative()) return

  const [{ StatusBar, Style }, { SplashScreen }] = await Promise.all([
    import('@capacitor/status-bar'),
    import('@capacitor/splash-screen'),
  ])

  try {
    // The app is black with light text throughout, so the status bar icons
    // have to be the light set or they vanish into the header.
    await StatusBar.setStyle({ style: Style.Dark })
    await StatusBar.setBackgroundColor({ color: '#000000' })
  } catch {
    // Not fatal, and it genuinely fails on some OEM skins. A slightly wrong
    // status bar is not worth blocking startup over.
  }

  await SplashScreen.hide()
}
