import Fastify from 'fastify'
import fastifyCors from '@fastify/cors'
import fastifyWebsocket from '@fastify/websocket'
import { StreamResolver } from './debrid/StreamResolver.js'
import { Torrentio } from './sources/Torrentio.js'
import { TMDB } from './metadata/TMDB.js'
import { BridgeServer } from './ws/BridgeServer.js'
import { registerApiRoutes } from './routes/api.js'
import { registerHlsRoutes } from './routes/hls.js'
import { MediaStore } from './media/MediaStore.js'

const {
  REAL_DEBRID_TOKEN = '',
  TMDB_API_KEY = '',
  PORT = '4000',
} = process.env

if (!REAL_DEBRID_TOKEN) throw new Error('REAL_DEBRID_TOKEN is required')
if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY is required')

const fastify = Fastify({
  logger: {
    transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
    level: 'info',
  },
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

const bridge = new BridgeServer(resolver, tmdb, store)
bridge.register(fastify)
registerApiRoutes(fastify, tmdb)
registerHlsRoutes(fastify, store)

await fastify.listen({ port: Number(PORT), host: '0.0.0.0' })
