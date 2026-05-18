import Fastify from 'fastify'
import fastifyCors from '@fastify/cors'
import fastifyWebsocket from '@fastify/websocket'
import { StreamResolver } from './debrid/StreamResolver.js'
import { Torrentio } from './sources/Torrentio.js'
import { StreamRanker } from './sources/StreamRanker.js'
import { TMDB } from './metadata/TMDB.js'
import { BridgeServer } from './ws/BridgeServer.js'
import { registerApiRoutes } from './routes/api.js'
import { registerHlsRoutes, initHlsDir } from './routes/hls.js'

const {
  REAL_DEBRID_TOKEN = '',
  TMDB_API_KEY = '',
  PORT = '4000',
} = process.env

if (!REAL_DEBRID_TOKEN) throw new Error('REAL_DEBRID_TOKEN is required')
if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY is required')

const fastify = Fastify({ logger: true })
await fastify.register(fastifyCors, { origin: true })
await fastify.register(fastifyWebsocket)

const resolver = new StreamResolver(new Torrentio(undefined, REAL_DEBRID_TOKEN), new StreamRanker())
const tmdb = new TMDB(TMDB_API_KEY)

const bridge = new BridgeServer(resolver, tmdb)
bridge.register(fastify)
registerApiRoutes(fastify, tmdb)
registerHlsRoutes(fastify)
await initHlsDir()

await fastify.listen({ port: Number(PORT), host: '0.0.0.0' })
