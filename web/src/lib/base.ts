/** Where the API lives. Empty in development (Vite proxies /api); set VITE_API_URL when the API is hosted elsewhere. */
export const BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '')
