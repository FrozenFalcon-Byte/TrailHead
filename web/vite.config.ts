import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/* Publishes /version.json: an id for the running build plus the latest commit subjects as "what's new". The
   dashboard compares it with the id it loaded with and offers to update when they differ. In dev the id moves
   whenever a source file is saved; a build writes the file next to index.html. */
function changes(): string[] {
  try {
    return execFileSync('git', ['log', '-5', '--pretty=%s'], { encoding: 'utf8', timeout: 2000 }).split('\n').filter(Boolean)
  } catch {
    return []
  }
}
function versionFile(): Plugin {
  let id = Date.now().toString(36)
  const body = () => JSON.stringify({ id, built: new Date(parseInt(id, 36)).toISOString(), changes: changes() })
  return {
    name: 'trailhead-version',
    config: () => ({ define: { __BUILD_ID__: JSON.stringify(id) } }),
    configureServer(server) {
      server.watcher.on('change', (file) => {
        if (file.includes('/src/')) id = Date.now().toString(36)
      })
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(body())
      })
    },
    writeBundle(opts) {
      writeFileSync(resolve(opts.dir ?? 'dist', 'version.json'), body())
    },
  }
}

// The API runs on 127.0.0.1:8000 (`bin/trailhead serve`); the dev server proxies it so cookies and CORS stay simple.
export default defineConfig({
  plugins: [react(), versionFile()],
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.TRAILHEAD_API_URL || 'http://127.0.0.1:8000', changeOrigin: false } },
  },
})
