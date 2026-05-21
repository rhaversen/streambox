# Streaming Audit — Streambox

Scope: `apps/backend/src/routes/hls.ts`, `apps/backend/src/media/MediaStore.ts`, `apps/backend/src/ws/BridgeServer.ts`, `apps/backend/src/debrid/StreamResolver.ts`, `apps/backend/src/sources/Torrentio.ts`, `apps/backend/src/metadata/TMDB.ts`, `apps/backend/src/index.ts`, and `apps/ui/src/hooks/usePlayer.ts`.

Environment assumptions: single-user, single-machine Electron app with one local backend and one local UI client.

---

## Operating Decisions (Keep As-Is)

These are intentional product/architecture choices and are not tracked as defects:

1. HLS cache is permanent until user deletion.
2. No automatic stream failover to alternate candidates.
3. Browser-side cache remains disabled for manifest and segments (`Cache-Control: no-cache`); backend storage is the authoritative cache.
4. WebSocket playback payload is trusted in local-only deployment; no runtime schema validation.
5. No explicit ffmpeg shutdown interception on process exit.
6. TMDB caching is deferred.
7. Audio policy remains unchanged for now.

---

## Current Findings

### 1. CORS policy should remain localhost-only

Backend must only accept local origins in this deployment model.

**Status:** Implemented. `index.ts` now allows localhost/127.0.0.1 origins and rejects others.

---

### 2. HLS segment responses should stream from disk

HLS `.ts` and `.m3u8` responses should avoid full in-memory buffering.

**Status:** Implemented. `/api/hls/*` now streams with `createReadStream` and file-size based `Content-Length`.

---

### 3. Segment target duration should be tuned for local VOD

Local on-demand playback benefits from a larger segment duration than low-latency live defaults.

**Status:** Implemented. ffmpeg now uses `-hls_time 6`.

---

### 4. Player should use larger forward buffer and worker parsing

Because backend delivery is local and fast, the player can maintain a larger forward buffer and offload parsing to hls.js worker.

**Status:** Implemented. `usePlayer.ts` now sets `enableWorker: true`, `maxBufferLength: 60`, and `maxMaxBufferLength: 120`.

---

## Summary Table

| # | Location | Priority | Item | Status |
| --- | --- | --- | --- | --- |
| 1 | `index.ts` | High | Restrict CORS to local origins | Implemented |
| 2 | `routes/hls.ts` | High | Stream HLS files from disk | Implemented |
| 3 | `MediaStore.ts` | Medium | Use 6s HLS segment duration | Implemented |
| 4 | `usePlayer.ts` | Medium | Enable worker + raise forward buffers | Implemented |
