import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function localSupabaseBridge(target, anonKey) {
  return {
    name: 'local-supabase-bridge',
    configureServer(server) {
      server.middlewares.use('/bridge', async (req, res) => {
        try {
          const targetUrl = new URL(req.url || '/', `${target.replace(/\/$/, '')}/`)
          const headers = new Headers()

          for (const [name, value] of Object.entries(req.headers)) {
            if (!value || ['host', 'connection', 'content-length', 'accept-encoding', 'origin', 'referer', 'apikey', 'authorization', 'x-local-token'].includes(name)) continue
            headers.set(name, Array.isArray(value) ? value.join(', ') : value)
          }

          headers.set('apikey', anonKey)
          headers.set('authorization', req.headers['x-local-token'] || 'Bearer ' + anonKey)

          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          const body = chunks.length ? Buffer.concat(chunks) : undefined
          const upstream = await fetch(targetUrl, {
            method: req.method,
            headers,
            body: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : body,
          })


          res.statusCode = upstream.status
          res.statusMessage = upstream.statusText
          res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8')

          const contentRange = upstream.headers.get('content-range')
          if (contentRange) res.setHeader('Content-Range', contentRange)

          res.end(Buffer.from(await upstream.arrayBuffer()))
        } catch (error) {
          console.error('[local-supabase-bridge]', error)
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ message: error instanceof Error ? error.message : 'Local bridge failed' }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [localSupabaseBridge(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY), react()],
    base: './',
    server: {
      allowedHosts: ['lvh.me'],
    },
  }
})




