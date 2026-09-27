import type { PostieAPI } from '@preload'

declare global {
  interface Window { postieAPI: PostieAPI }
}

export const api: PostieAPI = window.postieAPI
