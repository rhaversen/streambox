# Streambox

A modern streaming platform that transcodes and caches media content for instant playback.

## Features

- 🎬 Stream movies and TV shows via Real-Debrid
- ⚡ HLS adaptive streaming with hls.js
- 💾 Persistent segment caching for instant re-watch
- 🔍 TMDB metadata integration
- 🎮 TV remote-friendly UI
- 📡 WebSocket real-time updates

## Architecture

Streambox uses a monorepo structure with three packages:

```
streambox/
├── apps/
│   ├── backend/       # Fastify API server
│   └── ui/            # React frontend
└── packages/
    └── shared-types/  # Shared TypeScript types
```

### Backend Services

- **MediaStore**: Manages FFmpeg transcoding and HLS segment caching
- **StreamResolver**: Finds optimal streams via Torrentio + Real-Debrid
- **TMDB**: Fetches metadata (titles, posters, episode info)
- **BridgeServer**: WebSocket server for real-time player updates

### Future Architecture (V3)

The codebase is being refactored to a clean service-oriented architecture:

- **HLSStreamingService**: Handle playback transcoding (instant re-watch)
- **SourceArchiveService**: Preserve original quality in background
- **MediaCoordinator**: Thin orchestration layer

See [docs/CACHING_PLAN_V3.md](docs/CACHING_PLAN_V3.md) for details.

## Setup

### Prerequisites

- Node.js 20+
- pnpm 9+
- FFmpeg (bundled via ffmpeg-static)
- Real-Debrid account
- TMDB API key

### Installation

1. Clone the repository:
```bash
git clone https://github.com/rhaversen/streambox.git
cd streambox
```

2. Install dependencies:
```bash
pnpm install
```

3. Configure environment variables:
```bash
cd apps/backend
cp .env.example .env
```

Edit `.env` with your credentials:
```env
REAL_DEBRID_TOKEN=your_token_here
TMDB_API_KEY=your_api_key_here
PORT=4000
API_BASE_URL=http://localhost:4000
```

4. Start development servers:
```bash
# From repo root
pnpm dev
```

This starts:
- Backend API on http://localhost:4000
- Frontend UI on http://localhost:5173

## Environment Variables

### Backend (`apps/backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REAL_DEBRID_TOKEN` | ✅ | - | Your Real-Debrid API token |
| `TMDB_API_KEY` | ✅ | - | Your TMDB API key |
| `PORT` | ❌ | `4000` | Backend server port |
| `API_BASE_URL` | ❌ | `http://localhost:4000` | Base URL for HLS streams |

### Frontend (`apps/ui`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_WS_URL` | ❌ | `ws://localhost:4000/ws` | WebSocket endpoint URL |

## API Endpoints

### Media Metadata

- `GET /api/trending/movies` - Trending movies
- `GET /api/trending/series` - Trending TV series
- `GET /api/search?q=query` - Search movies/shows
- `GET /api/detail/:imdbId` - Get show/movie details

### Streaming

- `GET /api/hls/:key/stream.m3u8` - HLS master playlist
- `GET /api/hls/:key/stream_00000.ts` - HLS segments
- `GET /api/hls/:key/progress` - Download progress
- `GET /api/downloads/:imdbId` - Download status for all episodes

### Real-time

- `WS /ws` - WebSocket for player updates

## Development

### Type Checking

```bash
pnpm typecheck
```

### Building

```bash
pnpm build
```

### Project Structure

```
apps/backend/src/
├── index.ts              # Server entry point
├── logger.ts             # Logging utility
├── debrid/
│   └── StreamResolver.ts # Stream resolution
├── media/
│   ├── MediaStore.ts     # HLS transcoding & caching
│   ├── constants.ts      # Configuration
│   ├── ffmpeg.ts         # FFmpeg utilities
│   ├── types.ts          # Type definitions
│   └── validation.ts     # Input validation
├── metadata/
│   └── TMDB.ts          # TMDB API client
├── routes/
│   ├── api.ts           # REST endpoints
│   └── hls.ts           # HLS streaming
├── sources/
│   └── Torrentio.ts     # Torrentio addon
└── ws/
    └── BridgeServer.ts  # WebSocket server

apps/ui/src/
├── main.tsx             # App entry point
├── App.tsx              # Router setup
├── components/          # Reusable components
├── hooks/
│   └── usePlayer.ts     # Player logic
├── screens/             # Route screens
├── store/
│   └── playerStore.ts   # Zustand store
└── ws/
    └── bridge.ts        # WebSocket client
```

## Cache Management

Media cache is stored in `apps/backend/media-cache/`:

```
media-cache/
└── tt1234567_s01e01/      # Cache key (imdbId + season/episode)
    ├── probe.json          # Media metadata
    ├── stream.m3u8         # HLS manifest
    ├── stream_00000.ts     # HLS segment 0
    ├── stream_00001.ts     # HLS segment 1
    └── ...
```

### Cache Behavior

- ✅ Segments persist permanently (instant re-watch)
- ✅ Completed downloads restore on restart
- ⚠️ No automatic cleanup (manual deletion required)
- 📊 Typical size: 3-5GB per movie, 1-3GB per TV episode

## Troubleshooting

### FFmpeg Errors

If transcoding fails, check:
- Source URL is accessible
- Real-Debrid token is valid
- Network connection is stable

### Playback Issues

If video won't play:
1. Check browser console for errors
2. Verify HLS manifest is accessible: `http://localhost:4000/api/hls/{key}/stream.m3u8`
3. Check FFmpeg process is running (backend logs)

### TypeScript Errors

After pulling changes:
```bash
pnpm install
pnpm typecheck
```

## Contributing

1. Create a feature branch
2. Make changes
3. Run `pnpm typecheck` to validate
4. Submit pull request

## License

MIT

## Credits

- FFmpeg for transcoding
- hls.js for adaptive streaming
- Torrentio for stream discovery
- Real-Debrid for premium streaming
- TMDB for metadata
