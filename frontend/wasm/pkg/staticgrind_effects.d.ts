/* tslint:disable */
/* eslint-disable */

/**
 * Entry point called from `frontend/src/effects/worker.js`.
 *
 * `bytes` is a Uint8ClampedArray (RGBA, length `width * height * 4`). `params`
 * is a Float32Array of 8 values in CPU_KEYS order: kaleidoscope, rowShift,
 * blockGlitch, smear, channelSort, sortVertical, pixelSort, melt.
 *
 * `Clamped<Vec<u8>>` in and out: wasm-bindgen copies the JS array into wasm
 * memory, we mutate the copy, and the return value becomes a fresh
 * Uint8ClampedArray on the JS side. The buffer identity changes, which is why
 * the worker reassigns `bytes` to the return value rather than assuming the
 * original buffer was mutated in place.
 */
export function apply_chain(bytes: Uint8ClampedArray, width: number, height: number, seed: number, params: Float32Array): Uint8ClampedArray;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly apply_chain: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
