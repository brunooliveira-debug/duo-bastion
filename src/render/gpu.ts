// GPU detection: dedicated NVIDIA / AMD / Intel Arc cards get the ULTRA level by default.

let cached: string | null = null;
/** WebGL renderer string (unmasked when the browser allows it), '' when unavailable */
export function gpuName(): string {
  if (cached !== null) return cached;
  cached = '';
  try {
    if (typeof document === 'undefined') return cached;
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return cached;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    cached = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { /* privacy settings / no WebGL */ }
  return cached;
}

/** NVIDIA GeForce / RTX / GTX / Quadro, AMD Radeon RX / Pro, Intel Arc — not integrated graphics */
export function isDedicatedGpu(name = gpuName()): boolean {
  if (!name) return false;
  if (/intel.*(uhd|iris|hd graphics)|apple|mali|adreno|powervr|swiftshader|llvmpipe/i.test(name)) return false;
  return /nvidia|geforce|\brtx\b|\bgtx\b|quadro|radeon[^,)]*\b(rx|pro|vii)\b|\barc\b(\(tm\))?\s*a\d/i.test(name);
}
