# Streaming Audit — Streambox

Scope: `apps/backend/src/routes/hls.ts`, `apps/backend/src/media/MediaStore.ts`, `apps/backend/src/ws/BridgeServer.ts`, `apps/backend/src/debrid/StreamResolver.ts`, `apps/backend/src/sources/Torrentio.ts`, `apps/backend/src/metadata/TMDB.ts`, `apps/backend/src/index.ts`, and `apps/ui/src/hooks/usePlayer.ts`.

Environment assumptions: single-user, single-machine Electron app with one local backend and one local UI client.

---

## Critical Issues

### 1. HLS is configured as unbounded EVENT output

`MediaStore` starts ffmpeg with:

- `-hls_playlist_type event`
- `-hls_list_size 0`

This keeps appending segments for the entire playback and never trims the playlist window. For long titles, segment file count and disk usage grow continuously.

**Fix:** For on-demand playback, emit VOD playlists (`-hls_playlist_type vod`) once the source is fully available, or run a sliding live-style window with `-hls_list_size <N>` and `-hls_flags delete_segments`.

---

### 2. Playback pipeline has no source failover after selection

`StreamResolver` returns a single candidate and `BridgeServer` attempts playback only for that chosen URL. If ffmpeg fails on that source (network flap, dead host, throttled endpoint), there is no automatic retry against the next-ranked candidate.

**Fix:** Resolve and keep a ranked candidate list, then attempt sequential fallback when startup/transcode fails.

---

## Significant Issues

### 3. HLS segment endpoint reads full files into memory

`/api/hls/*` does `fs.readFile` and sends a full `Buffer` for each `.ts` segment. This allocates per-request buffers unnecessarily.

**Fix:** Stream files (`createReadStream`) or use static file serving to avoid full in-memory buffering.

---

### 4. Audio is always forced to stereo

ffmpeg args include `-ac 2`, which downmixes all multichannel sources to stereo.

**Fix:** Remove hardcoded channel downmix and preserve source channel layout where possible.

---

### 5. Segment duration is short for on-demand workloads

HLS uses `-hls_time 4`. For local VOD playback, this still produces many files and extra filesystem churn versus a larger segment duration.

**Fix:** Use a VOD-oriented segment duration (commonly around 6 seconds) unless a lower target is required.

---

### 6. WebSocket playback payload is trusted without runtime validation

`BridgeServer` casts `JSON.parse(...)` directly to `BridgeMessage`, and `imdbId/season/episode` flow into provider URL construction. There is no runtime schema guard.

**Fix:** Validate incoming payloads (e.g., imdb pattern, integer checks for season/episode) before using them in resolution/provider requests.

---

## Minor Issues

### 7. No shutdown hook for active transcoding cleanup

Server startup creates and reuses media-cache entries, but there is no process shutdown handling to terminate active ffmpeg children and perform cleanup policy decisions on exit.

**Fix:** Add `SIGINT`/`SIGTERM` handlers that stop active jobs and run explicit cache cleanup/retention logic.

---

### 8. Cache headers are not differentiated by artifact type

Manifest and segments are both served with `Cache-Control: no-cache`. Segment files are immutable once written and can be cached aggressively.

**Fix:** Keep manifest conservative (`no-cache`) and return long-lived immutable caching for completed `.ts` segments.

---

### 9. TMDB requests are uncached

Trending, search, and detail lookups are executed directly on each request with no in-memory TTL layer.

**Fix:** Add bounded in-memory caching (per endpoint/key) with practical TTLs to reduce repeated external API load.

---

### 10. CORS policy reflects arbitrary origins

Backend registers CORS with `origin: true`, reflecting request origins.

**Fix:** Restrict origins to local app endpoints (e.g., localhost/electron app origin).

---

### 11. hls.js worker is disabled

Player config sets `enableWorker: false`. This keeps parsing/demux work on the main thread.

**Fix:** If Electron CSP allows blob workers, enable hls.js worker mode for better UI responsiveness.

---

## Summary Table

| # | Location | Severity | Issue |
|---|---|---|---|
| 1 | `MediaStore.ts` | **Critical** | EVENT playlist + unbounded list size causes unbounded segment growth |
| 2 | `StreamResolver.ts` / `BridgeServer.ts` | **Critical** | No source fallback after selected stream fails |
| 3 | `routes/hls.ts` | **Significant** | Segment responses are fully buffered in memory |
| 4 | `MediaStore.ts` | **Significant** | Audio is forced to stereo downmix |
| 5 | `MediaStore.ts` | **Significant** | Short segment duration increases file churn for VOD |
| 6 | `BridgeServer.ts` / `Torrentio.ts` | **Significant** | No runtime validation of WebSocket playback payload |
| 7 | `index.ts` | Minor | No process shutdown handling for active transcodes |
| 8 | `routes/hls.ts` | Minor | Manifest and segments share same no-cache policy |
| 9 | `metadata/TMDB.ts` | Minor | No API response caching |
| 10 | `index.ts` | Minor | CORS reflects arbitrary origins |
| 11 | `usePlayer.ts` | Minor | hls.js worker mode disabled |
