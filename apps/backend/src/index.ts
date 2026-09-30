import Fastify, { type FastifyBaseLogger } from 'fastify'
import fastifyCors from '@fastify/cors'
import fastifyWebsocket from '@fastify/websocket'
import { StreamResolver } from './debrid/StreamResolver.js'
import { Torrentio } from './sources/Torrentio.js'
import { TMDB } from './metadata/TMDB.js'
import { BridgeServer } from './ws/BridgeServer.js'
import { registerApiRoutes } from './routes/api.js'
import { registerHlsRoutes } from './routes/hls.js'
import { MediaStore } from './media/MediaStore.js'
import baseLogger from './logger.js'

const {
  REAL_DEBRID_TOKEN = '',
  TMDB_API_KEY = '',
  PORT = '4000',
  API_BASE_URL = 'http://localhost:4000',
} = process.env

if (!REAL_DEBRID_TOKEN) throw new Error('REAL_DEBRID_TOKEN is required')
if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY is required')

const fastifyLogger = {
  info: (msg: unknown, ...args: unknown[]) => baseLogger.info(`${String(msg)}${args.length ? ` ${args.map(String).join(' ')}` : ''}`),
  error: (msg: unknown, ...args: unknown[]) => baseLogger.error(`${String(msg)}${args.length ? ` ${args.map(String).join(' ')}` : ''}`),
  warn: (msg: unknown, ...args: unknown[]) => baseLogger.warn(`${String(msg)}${args.length ? ` ${args.map(String).join(' ')}` : ''}`),
  debug: (msg: unknown, ...args: unknown[]) => baseLogger.debug(`${String(msg)}${args.length ? ` ${args.map(String).join(' ')}` : ''}`),
  trace: (msg: unknown, ...args: unknown[]) => baseLogger.verbose(`${String(msg)}${args.length ? ` ${args.map(String).join(' ')}` : ''}`),
  fatal: (msg: unknown, ...args: unknown[]) => baseLogger.error(`${String(msg)}${args.length ? ` ${args.map(String).join(' ')}` : ''}`),
  child: () => fastifyLogger,
}

const fastify = Fastify({
  loggerInstance: fastifyLogger as unknown as FastifyBaseLogger,
})
const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4000',
  'http://127.0.0.1:4000',
])

await fastify.register(fastifyCors, {
  origin: (origin, cb) => {
    if (!origin) {
      cb(null, true)
      return
    }
    if (allowedOrigins.has(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      cb(null, true)
      return
    }
    cb(new Error('Origin not allowed by CORS'), false)
  },
})
await fastify.register(fastifyWebsocket)

const store = new MediaStore()
await store.init()

const resolver = new StreamResolver(new Torrentio(undefined, REAL_DEBRID_TOKEN))
const tmdb = new TMDB(TMDB_API_KEY)

const bridge = new BridgeServer(resolver, tmdb, store, API_BASE_URL)
bridge.register(fastify)
registerApiRoutes(fastify, tmdb, store)
registerHlsRoutes(fastify, store)

await fastify.listen({ port: Number(PORT), host: '0.0.0.0' })
