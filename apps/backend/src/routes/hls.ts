import { promises as fs } from 'fs'
import { join } from 'path'
import type { FastifyInstance } from 'fastify'
import type { MediaStore } from '../media/MediaStore.js'

const KEY_RE = /^[a-zA-Z0-9_]+$/
const FILENAME_RE = /^(stream\.m3u8|stream_\d{5}\.ts)$/

export function registerHlsRoutes(fastify: FastifyInstance, store: MediaStore): void {
  fastify.get<{ Params: { key: string } }>('/api/hls/:key/progress', { logLevel: 'silent' }, async (req, reply) => {
    const { key } = req.params
    if (!KEY_RE.test(key)) return reply.status(400).send()
    const cachedSeconds = await store.getCachedDuration(key)
    return { cachedSeconds }
  })

  fastify.get<{ Params: { '*': string } }>('/api/hls/*', { logLevel: 'silent' }, async (req, reply) => {
    const parts = (req.params as { '*': string })['*'].split('/')
    if (parts.length !== 2) return reply.status(400).send()
    const [key, filename] = parts as [string, string]
    if (!KEY_RE.test(key) || !FILENAME_RE.test(filename)) return reply.status(400).send()

    const entry = store.getEntry(key)
    if (!entry) return reply.status(404).send()

    await store.waitForFile(entry, filename)

    const content = await fs.readFile(join(entry.dir, filename))
    reply.header('Content-Type', filename.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t')
    reply.header('Content-Length', String(content.length))
    reply.header('Cache-Control', 'no-cache')
    return reply.send(content)
  })
}
