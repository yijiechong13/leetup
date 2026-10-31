import { createServer, preview } from 'vite'
import { startApiServer } from '../server/api.mjs'

const api = await startApiServer()
let site
try {
  site = process.argv[2] === 'preview' ? await preview() : await createServer()
  if (process.argv[2] !== 'preview') await site.listen()
  site.printUrls()
} catch (error) {
  api.close()
  throw error
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    void Promise.resolve(site.close()).finally(() => api.close(() => process.exit(0)))
  })
}
