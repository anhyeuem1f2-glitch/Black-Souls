export function validateVerification(value, path = 'verified-runtime.json') {
  if (value?.schema !== 'black-souls-verified-runtime-v1' || value?.verified !== true) throw new Error(`Release verification is missing or unsuccessful: ${path}`);
  if (!/^[0-9a-f]{40}$/i.test(String(value.ref ?? ''))) throw new Error(`Release verification has an invalid commit ref: ${path}`);
  if (!/^[0-9a-f]{64}$/i.test(String(value.entrySha256 ?? ''))) throw new Error(`Release verification has an invalid runtime SHA-256: ${path}`);
  if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(String(value.runtimeVersion ?? ''))) throw new Error(`Release verification has an invalid runtime version: ${path}`);
  if (!Array.isArray(value.sources) || !value.sources.some((source) => source.ok && source.role === 'primary') || !value.sources.some((source) => source.ok && source.role === 'fallback')) {
    throw new Error(`Release verification lacks a successful primary and fallback CDN source: ${path}`);
  }
  return value;
}
