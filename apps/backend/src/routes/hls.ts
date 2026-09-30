import { createReadStream, promises as fs } from 'fs'
import { join } from 'path'
import type { FastifyInstance } from 'fastify'
import type { MediaStore } from '../media/MediaStore.js'
import { isValidKey, isValidFilename } from '../media/validation.js'

export function registerHlsRoutes(fastify: FastifyInstance, store: MediaStore): void {
  fastify.get<{ Params: { key: string } }>('/api/hls/:key/progress', { logLevel: 'silent' }, async (req, reply) => {
    const { key } = req.params
    if (!isValidKey(key)) return reply.status(400).send()
    const cachedSeconds = await store.getCachedDuration(key)
    return { cachedSeconds }
  })

  fastify.get<{ Params: { '*': string } }>('/api/hls/*', { logLevel: 'silent' }, async (req, reply) => {
    const parts = (req.params as { '*': string })['*'].split('/')
    if (parts.length !== 2) return reply.status(400).send()
    const [key, filename] = parts as [string, string]
    if (!isValidKey(key) || !isValidFilename(filename)) return reply.status(400).send()

    const entry = store.getEntry(key)
    if (!entry) return reply.status(404).send()

    await store.waitForFile(entry, filename)

    const filePath = join(entry.dir, filename)
    const stat = await fs.stat(filePath)
    const content = createReadStream(filePath)
    reply.header('Content-Type', filename.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t')
    reply.header('Content-Length', String(stat.size))
    reply.header('Cache-Control', 'no-cache')
    return reply.send(content)
  })
}
