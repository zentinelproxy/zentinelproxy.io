/* tslint:disable */
/* eslint-disable */

/**
 * Convert a configuration string to Sentinel KDL format
 *
 * # Arguments
 * * `config` - The source configuration content
 * * `format` - Optional format hint ("nginx", "haproxy", etc.). Auto-detects if not provided.
 *
 * # Returns
 * A JavaScript object with:
 * - `success`: boolean indicating if conversion succeeded
 * - `kdl`: the generated KDL output (if successful)
 * - `format`: the detected/used source format
 * - `error`: error message (if failed)
 * - `warnings`: array of warnings from conversion
 * - `agents`: array of detected agents
 */
export function convert(config: string, format?: string | null): any;

/**
 * Detect the format of a configuration string
 */
export function detect_format(config: string): any;

/**
 * Get list of supported source formats
 */
export function get_supported_formats(): any;

/**
 * Get the version of the WASM module
 */
export function get_version(): string;

/**
 * Initialize panic hook for better error messages in browser console
 */
export function init_panic_hook(): void;

/**
 * Validate a configuration string without full conversion
 *
 * # Arguments
 * * `config` - The source configuration content
 * * `format` - Optional format hint
 *
 * # Returns
 * A JavaScript object with validation results
 */
export function validate(config: string, format?: string | null): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly convert: (a: number, b: number, c: number, d: number) => number;
  readonly detect_format: (a: number, b: number) => number;
  readonly get_supported_formats: () => number;
  readonly get_version: (a: number) => void;
  readonly validate: (a: number, b: number, c: number, d: number) => number;
  readonly init_panic_hook: () => void;
  readonly __wbindgen_export: (a: number, b: number, c: number) => void;
  readonly __wbindgen_export2: (a: number, b: number) => number;
  readonly __wbindgen_export3: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
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
