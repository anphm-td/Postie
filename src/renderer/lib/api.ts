// ============================================================================
//  Postie POS - Renderer API wrapper
// ----------------------------------------------------------------------------
//  Thin typed wrapper around window.postieAPI (exposed by the preload script).
//  Importing code uses `api.users.login(...)` instead of touching the global
//  directly, so the surface is easy to mock in tests and to audit.
// ============================================================================

import type { PostieAPI } from '../../../electron/preload'

declare global {
  interface Window { postieAPI: PostieAPI }
}

export const api: PostieAPI = window.postieAPI
