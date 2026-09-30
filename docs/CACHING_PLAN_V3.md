# Caching Architecture Plan V3 (Simplified)

## Core Principle

**Separation of concerns.** Each service does one thing well, without needing to know about the others. The player just asks "play this", and each layer handles its own responsibility.

---

## Architecture: Three Independent Services

### 1. HLS Streaming Service (Playback)

**Responsibility:** Serve HLS segments for immediate playback

**Interface:**

```typescript
playStream(key: string, url: string, probe: ProbeResult)
  → Returns: HLS endpoint ready for player

getPlaybackProgress(key: string)
  → Returns: { cachedSeconds, totalDuration, status }
```

**Behavior:**

```
On first play:
  - Check: Do HLS segments exist in cache?
  - If YES: Serve cached segments (instant playback <1s)
  - If NO: Start FFmpeg transcode from URL → HLS (3-5s startup)
  - HLS segments persist permanently in cache/hls/{key}/

On re-watch:
  - Segments exist → instant playback
  - No regeneration needed

On seek past cached range (during live transcode):
  - Stop current FFmpeg
  - Start new FFmpeg from seek position
  - Segments continue appending to same directory
  - Player gets gap, but can seek freely
```

**Storage:**

```
cache/hls/
  tt1234567_s01e01/
    stream.m3u8          ← master playlist (appended as transcoding progresses)
    segment_00000.ts
    segment_00001.ts
    ...
```

**Key Points:**

- ✅ No knowledge of source files
- ✅ No range tracking
- ✅ No discontinuities (single continuous stream)
- ✅ Simple: generate once, serve forever

---

### 2. Source Archive Service (Preservation)

**Responsibility:** Download and store original quality files in background

**Interface:**

```typescript
archiveSource(key: string, url: string)
  → Starts background download, returns immediately

getArchiveStatus(key: string)
  → Returns: { exists, downloading, progress, size }
```

**Behavior:**

```
Triggered after playback starts (user is watching HLS):
  - Check: Does source.mkv exist?
  - If YES: Do nothing (already archived)
  - If NO: Start background FFmpeg:
      ffmpeg -i URL -c copy -map 0 cache/sources/{key}/source.mkv

Progress tracking:
  - Parse FFmpeg stderr for time codes
  - Update progress in memory (no complex state)
  - On complete: Mark as archived

Completely independent of playback:
  - Can pause/cancel without affecting HLS
  - Can resume from network interruption
  - Player never waits for this
```

**Storage:**

```
cache/sources/
  tt1234567_s01e01/
    source.mkv          ← original quality, all tracks preserved
    metadata.json       ← probe info, download date, file size
```

**Key Points:**

- ✅ No knowledge of HLS segments
- ✅ No knowledge of player state
- ✅ Runs entirely in background
- ✅ Can fail without affecting playback

---

### 3. Media Coordinator (Orchestration)

**Responsibility:** Coordinate between services without containing business logic

**Interface:**

```typescript
play(key: string, imdbId: string, season?, episode?)
  → Coordinates HLS + Archive services

seek(key: string, position: number)
  → Tells HLS service to restart from position
```

**Behavior:**

```
On play request:
  1. Resolve URL via Torrentio + StreamResolver
  2. Probe media (duration, codecs)
  3. Call HLS.playStream(key, url, probe)
     → Player starts watching immediately
  4. Call SourceArchive.archiveSource(key, url)
     → Background download begins
  5. Return HLS endpoint to player

On seek (during live transcode):
  1. Call HLS.seekTo(key, position)
     → HLS service handles restart
  2. No involvement of Source Archive

On status query:
  1. Aggregate HLS.getPlaybackProgress() + SourceArchive.getStatus()
  2. Return combined view to frontend
```

**Key Points:**

- ✅ Thin orchestration layer
- ✅ No state management
- ✅ Just delegates to specialized services
- ✅ Easy to test and maintain

---

## User Experience Flows

### First Watch (Nothing Cached)

```
User clicks PLAY:

1. Coordinator resolves URL → starts HLS transcode
2. Player receives HLS endpoint
3. Playback starts in 3-5 seconds (transcoding from URL)
4. Source download begins in background (invisible to user)

User watches normally:
5. HLS segments accumulate in cache
6. Source file grows in parallel

User finishes episode:
7. HLS segments complete
8. Source archive completes (or continues in background)
```

**Network cost:** ~8GB (HLS stream) + ~6GB (source) = ~14GB

- Can be optimized: Only archive if user watches >50% (indicates interest)

### Re-Watch (HLS Cached)

```
User clicks PLAY:

1. HLS service finds cached segments
2. Playback starts in <1 second (local file serving)
3. No network activity
4. No source download (already archived)

User can seek freely:
5. All seeks are instant (segments cached)
```

**Network cost:** 0 bytes

### Re-Watch from Source (HLS Deleted but Source Exists)

```
User clicks PLAY:

1. HLS service finds no segments, but Source Archive has source.mkv
2. Start FFmpeg: source.mkv → HLS segments
3. Playback starts in 1-2 seconds (local transcode, fast)
4. Segments generated once, cached for future

Future re-watches:
5. Use cached segments (instant)
```

**Network cost:** 0 bytes  
**Disk cost:** Temporary HLS regeneration (can clean later)

---

## Implementation: Simple & Incremental

### Phase 1: Persistent HLS Cache (Minimal Changes)

**Goal:** Instant re-watch with current architecture

**Changes to MediaStore.ts:**

1. Remove any segment cleanup logic
2. In `init()`, check for existing segments → mark as complete
3. On seek during live stream: restart FFmpeg from seek position, append to same directory

**Estimated LOC:** ~30 lines changed/added  
**User Benefit:** Re-watching is instant  
**Complexity:** Minimal

### Phase 2: Source Archive Service (New Module)

**Goal:** Preserve original quality in background

**New File: `src/media/SourceArchive.ts`**

```typescript
export class SourceArchive {
	private downloads = new Map<string, DownloadState>();

	async archive(key: string, url: string): Promise<void> {
		// Spawn FFmpeg -c copy in background
		// Track progress via stderr
		// Write to cache/sources/{key}/source.mkv
	}

	getStatus(key: string): ArchiveStatus {
		// Return exists, progress, size
	}

	async existsFor(key: string): Promise<boolean> {
		// Check if source.mkv exists
	}
}
```

**Changes to index.ts:**

```typescript
const sourceArchive = new SourceArchive();

// After starting HLS playback:
if (!(await sourceArchive.existsFor(key))) {
	sourceArchive.archive(key, url); // Fire and forget
}
```

**Estimated LOC:** ~150 lines new, ~10 lines changed  
**User Benefit:** Source preserved for archival  
**Complexity:** Low (completely isolated)

### Phase 3: Smart Cleanup & Management

**Goal:** Manage disk space intelligently

**Features:**

- Auto-cleanup HLS segments for unwatched shows after 30 days
- Keep source files for "completed" shows (watched to end)
- Regenerate HLS from source if deleted but source exists
- Admin API to trigger cleanup, see storage stats

**Estimated LOC:** ~100 lines new  
**Complexity:** Low (background jobs)

---

## Storage Strategy

### What Gets Cached When

| Scenario                | HLS Segments              | Source File       | Disk Usage    |
| ----------------------- | ------------------------- | ----------------- | ------------- |
| First watch             | ✅ Generated              | ✅ Downloading    | ~14GB peak    |
| After first watch       | ✅ Keep                   | ✅ Keep           | ~10GB steady  |
| Re-watch                | ✅ Serve cached           | ✅ Already exists | 0 bytes added |
| After 30 days unwatched | ❌ Can delete             | ✅ Keep           | ~6GB          |
| Re-watch after cleanup  | ✅ Regenerate from source | ✅ Serve          | ~10GB again   |

### Disk Space Example (10 episodes of 45min TV)

```
HLS segments: 10 × 3GB = 30GB
Source files: 10 × 4GB = 40GB
Total: 70GB

After 30 days (keep only sources):
Source files: 40GB
HLS regenerated on-demand
```

### Cost-Benefit

**Bandwidth:**

- First watch: 1x (source via copy) + 1x (HLS via transcode) = 2x file size
- Can optimize: Only archive if watch >50% complete

**Disk:**

- Temporary peak: ~2x file size during first watch
- Steady state: ~1.5x file size (can cleanup HLS after time)

**Complexity:**

- Low: Two independent services
- No inter-dependencies
- Clean interfaces

**User Experience:**

- ✅ Instant re-watch
- ✅ Free seeking
- ✅ Source quality preserved
- ✅ No waiting for downloads

---

## Key Design Decisions

### Why Separate Services?

**HLS Service** focuses on playback performance:

- Fast startup
- Reliable seeking
- Simple caching

**Source Archive** focuses on preservation:

- Complete quality retention
- Background operation
- Optional feature

Neither needs to know about the other. Coordinator connects them.

### Why Not Dual-Output?

Dual-output (simultaneous HLS + source from URL) seems efficient but:

- Adds complexity to single service (violates separation of concerns)
- Disk I/O overhead during critical playback phase
- Harder to pause/resume source download independently
- If HLS crashes, source download also crashes

Separate processes = better isolation and reliability.

### Why Keep Both HLS and Source?

**HLS segments:**

- Instant playback (no regeneration delay)
- Small files, fast serving
- Already transcoded to compatible format

**Source files:**

- Archival quality
- Can regenerate HLS with different settings
- Enables future features (download to device, share, etc.)

Trade disk space for flexibility. Can add policies later (auto-cleanup HLS after N days).

### Why No Range Tracking?

Not needed because:

- HLS segments are complete atomic units
- Seeking just restarts FFmpeg from new position
- Gaps in segment numbers are fine (player skips)
- No complex state to manage

If user seeks during first watch:

1. Current FFmpeg writes segments 0-50
2. User seeks ahead → stop FFmpeg
3. New FFmpeg starts at seek pos → writes segments 200-end
4. Segments 51-199 missing? Player skips gap, shows buffering briefly
5. Background job can fill later if desired (optional optimization)

---

## Service Interfaces (TypeScript)

### HLS Streaming Service

```typescript
export interface HLSStreamingService {
	// Start or resume HLS stream
	playStream(key: string, url: string, probe: ProbeResult): Promise<void>;

	// Restart stream from specific position (for seeking)
	seekTo(key: string, positionSeconds: number): Promise<void>;

	// Stop current stream
	stop(key: string): void;

	// Get playback progress
	getProgress(key: string): PlaybackProgress;

	// Check if cached
	isCached(key: string): Promise<boolean>;
}

interface PlaybackProgress {
	status: "idle" | "transcoding" | "complete" | "error";
	cachedSeconds: number;
	totalDuration: number;
}
```

### Source Archive Service

```typescript
export interface SourceArchiveService {
	// Start background archive (non-blocking)
	archive(key: string, url: string): void;

	// Check archive status
	getStatus(key: string): ArchiveStatus;

	// Check if source exists
	exists(key: string): Promise<boolean>;

	// Pause ongoing download
	pause(key: string): void;

	// Resume paused download
	resume(key: string): void;

	// Cancel and delete
	cancel(key: string): Promise<void>;
}

interface ArchiveStatus {
	exists: boolean;
	downloading: boolean;
	progress: number; // 0-1
	sizeBytes: number;
	error?: string;
}
```

### Media Coordinator

```typescript
export interface MediaCoordinator {
	// Main entry point for playback
	play(request: PlayRequest): Promise<PlayResponse>;

	// Handle seeking during playback
	seek(key: string, positionSeconds: number): Promise<void>;

	// Get comprehensive status
	getStatus(key: string): MediaStatus;
}

interface PlayRequest {
	imdbId: string;
	season?: number;
	episode?: number;
	startPosition?: number;
}

interface PlayResponse {
	hlsUrl: string;
	duration: number;
	status: MediaStatus;
}

interface MediaStatus {
	playback: PlaybackProgress;
	archive: ArchiveStatus;
}
```

---

## Migration Path

### From Current Implementation

**Current:** Single `MediaStore` class does everything

**Step 1:** Extract HLS logic

```typescript
// Before: MediaStore does HLS
// After: HLSStreamingService does HLS
//        MediaStore delegates to HLSStreamingService
```

**Step 2:** Add SourceArchive

```typescript
// MediaStore now coordinates:
//   - HLSStreamingService (playback)
//   - SourceArchiveService (preservation)
```

**Step 3:** Rename MediaStore → MediaCoordinator

```typescript
// Clear naming: Coordinator orchestrates, doesn't contain logic
```

Each step is independently testable and deployable.

---

## Testing Strategy

### HLS Streaming Service Tests

```typescript
test("serves cached segments immediately");
test("starts transcode if not cached");
test("handles seek during live transcode");
test("reports accurate progress");
test("handles FFmpeg crashes gracefully");
```

### Source Archive Service Tests

```typescript
test("downloads source in background");
test("can pause and resume");
test("handles network interruptions");
test("verifies file integrity");
test("reports accurate progress");
```

### Coordinator Tests

```typescript
test("starts playback and archive in parallel");
test("returns HLS URL immediately");
test("aggregates status from both services");
test("handles service failures independently");
```

**Key:** Each service can be tested in isolation with mocks.

---

## Monitoring & Observability

### Metrics to Track

**HLS Service:**

- Cache hit rate (served from cache vs. transcoded)
- Transcode startup time (should be <5s)
- Segment serve latency
- FFmpeg crash rate

**Source Archive:**

- Active downloads count
- Download success rate
- Average download time
- Storage used

**Coordinator:**

- Play requests per hour
- End-to-end latency (request → playback start)
- Error rates by service

### Logs

```typescript
[HLS] Starting transcode: tt1234567_s01e01 (codec=h264, dur=2700s)
[HLS] Cache hit: tt1234567_s01e01 (instant playback)
[HLS] Seek requested: tt1234567_s01e01 (1850s → restart)

[Archive] Starting download: tt1234567_s01e01
[Archive] Progress: tt1234567_s01e01 (45%)
[Archive] Complete: tt1234567_s01e01 (4.2GB)

[Coordinator] Play request: tt1234567 s01e01
[Coordinator] HLS ready in 1.2s
[Coordinator] Archive started
```

---

## Comparison: V2 vs V3

| Aspect                    | V2 (Complex)                 | V3 (Simple)              |
| ------------------------- | ---------------------------- | ------------------------ |
| **Services**              | 1 monolithic                 | 3 separated              |
| **Range tracking**        | Multi-range system           | None needed              |
| **Discontinuities**       | Multiple per video           | None                     |
| **State complexity**      | High (ranges, gaps, merging) | Low (simple status)      |
| **HLS generation**        | Dual-output from URL         | Single transcode         |
| **Source download**       | Interleaved with HLS         | Background, independent  |
| **Seek during 1st watch** | Complex range switching      | Simple FFmpeg restart    |
| **Lines of code**         | ~500-800                     | ~300-400                 |
| **Testability**           | Hard (coupled state)         | Easy (isolated services) |
| **Failure isolation**     | One crash affects all        | Services independent     |
| **Maintenance**           | High (many edge cases)       | Low (clear boundaries)   |

---

## Success Metrics

✅ **Instant re-watch:** <1s startup when cached  
✅ **Source preserved:** Original quality saved for 100% of watched content  
✅ **Clean architecture:** Each service <200 LOC, clear interfaces  
✅ **Independent services:** Can deploy/test each separately  
✅ **Bandwidth efficient:** 2x download acceptable for quality preservation  
✅ **Disk space managed:** Cleanup policies prevent unbounded growth  
✅ **Reliable:** Service failures isolated, don't cascade

---

## Future Enhancements (Low Priority)

1. **Smart archiving:** Only archive if watched >50% (saves bandwidth)
2. **Compression:** Compress source files with brotli/zstd (save 20-30% disk)
3. **Gap filling:** Background job to fill segment gaps after seeking
4. **Preemptive caching:** Download next episode when current reaches 80%
5. **Quality profiles:** User chooses HLS quality (720p/1080p/4K)
6. **Source sharing:** Export source files to NAS/external drive

None of these require architectural changes - they're additions to existing services.

---

## Conclusion

**V3 achieves the goals of V2 with dramatically less complexity:**

- ✅ Source quality preserved
- ✅ Instant re-watch
- ✅ Clean separation of concerns
- ✅ Each component does one thing well
- ✅ No complex state management
- ✅ Easy to understand and maintain

**Player perspective:**

```typescript
// Player doesn't know about ranges, sources, or downloads:
await coordinator.play({ imdbId: "tt1234567", season: 1, episode: 1 });
// → Gets HLS URL, starts watching
// Everything else happens transparently
```

**Developer perspective:**

```typescript
// Clear, testable interfaces:
hlsService.playStream(...)   // Handles playback
sourceArchive.archive(...)   // Handles preservation
coordinator.play(...)        // Coordinates both
// Each can be developed, tested, deployed independently
```

This is the **90% of features for 5% of complexity** approach you requested.
