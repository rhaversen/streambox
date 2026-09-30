# Caching Architecture Plan V2

## Core Principle

**Download once, use forever.** Every video segment is downloaded exactly once and saved in its original quality with all audio tracks and subtitles. HLS segments are generated on-demand from the saved source files.

---

## Architecture Overview

### Two-Layer System

```
Permanent Layer:  source_{startPos}.mkv files (copy-only, preserves everything)
Transient Layer:  HLS segments (transcoded on-demand, can be regenerated anytime)
```

**Source files** are canonical — they contain the original video/audio/subtitle streams with no quality loss.  
**HLS segments** are ephemeral — generated for playback, can be deleted after session and re-rendered instantly from source.

### Dual-Output FFmpeg

The key technique that makes this efficient:

```bash
ffmpeg -i URL \
  -map 0 -c copy source_0.mkv \                    # Output 1: save everything
  -map 0:v:0 -c:v libx264 -f hls stream.m3u8      # Output 2: transcode for playback
```

**Single download, two outputs simultaneously.** User watches immediately while source is saved in background.

---

## User Experience Flows

### First Watch (Content Not Downloaded)

```
User clicks PLAY:

1. Start dual-output FFmpeg from URL:
   - Downloads and writes source_0.mkv (preserves all tracks)
   - Generates HLS segments for immediate playback

2. User watches within 3-5 seconds (current behavior maintained)

3. Progress tracked in real-time via FFmpeg -progress output

4. When download completes → source_0.mkv is ready for instant re-watch
```

### Re-Watch (Source Exists)

```
source.mkv already downloaded:

1. Start HLS-only FFmpeg from local file:
   ffmpeg -i source.mkv -ss 0 -f hls stream.m3u8

2. Playback starts in <1s (local I/O only, no network wait)

3. Any seek is instant (local file, frame-accurate)
```

### Seek During First Watch

#### Case 1: Seek Within Downloaded Range (P ≤ H)

```
User seeks to position P, download head is at H, P ≤ H:

1. source_0.mkv already contains position P
2. Stop current HLS generation
3. Start new HLS generation from local file:
   ffmpeg -i source_0.mkv -ss P -f hls stream.m3u8
4. Instant seek (local file)
```

#### Case 2: Seek Past Download Head (P > H)

```
User seeks to position P, download head is at H, P > H:

1. Pause current dual-output FFmpeg
   - source_0.mkv is saved (0..H complete)
   - Remember head position H

2. Start new dual-output FFmpeg at position P:
   ffmpeg -ss P -i URL \
     -c copy source_P.mkv \
     -c:v libx264 -f hls stream_P.m3u8

3. User watches from P immediately

4. Gap (H..P) is left for background filling
```

---

## Source Range Model

### Range Structure

```ts
interface SourceRange {
	startPos: number; // -ss value passed to FFmpeg
	head: number; // how far downloaded (from -progress output)
	file: string; // source_{startPos}.mkv
	process: ChildProcess | null;
	status: "downloading" | "paused" | "complete" | "error";
	mode: "dual" | "copy-only"; // dual = active playback, copy-only = background
}
```

### MediaEntry Structure

```ts
interface MediaEntry {
	key: string; // e.g. tt1190634_s01e01
	probe: ProbeResult;
	sourceUrl: string; // stored for resuming paused ranges
	sourceRanges: SourceRange[]; // sorted by startPos
	merged: boolean; // true when source.mkv exists (all gaps filled)
	activeRange: SourceRange | null; // the one currently serving HLS to user
}
```

### Range Modes

**Dual-output mode** (`mode: 'dual'`):

- Used during active playback
- Outputs both source file AND HLS segments
- User watches in real-time as it downloads
- Only one dual-output range active at a time

**Copy-only mode** (`mode: 'copy-only'`):

- Used for background gap-filling
- Outputs only source file
- No HLS generation (not being watched)
- Runs at lower priority when system is idle

---

## Cache States

### Per Episode

```
UNCACHED
  ↓ user starts watching
DOWNLOADING (single range 0..H, dual-output)
  ↓ user seeks past H
PARTIAL (range 0..H paused + range P..? downloading, gaps present)
  ↓ background fills H..P
  ↓ and/or more ranges added by further seeks
COMPLETE (all gaps filled, source.mkv merged)
```

### Source Directory Structure

```
media-cache/
  tt1234567_s01e01/
    source_0.mkv          ← started from 0, head at 3420s (paused)
    source_3420.mkv       ← seeked to 3420s, downloading
    source.mkv            ← merged final file (appears when complete)
    probe.json            ← duration, codec info
    hls/
      r0/                 ← HLS segments for range 0
        stream.m3u8
        stream_00000.ts
        ...
      r3420/              ← HLS segments for range 3420
        stream.m3u8
        stream_00570.ts
        ...
```

---

## HLS Serving

### Merged Master Playlist

When user requests `/api/hls/{key}/master.m3u8`, generate dynamically:

```m3u8
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6

# Segments from source_0.mkv (0..3420s)
#EXTINF:6.000000,
/api/hls/{key}/r0/stream_00000.ts
#EXTINF:6.000000,
/api/hls/{key}/r0/stream_00001.ts
...
#EXTINF:6.000000,
/api/hls/{key}/r0/stream_00570.ts

#EXT-X-DISCONTINUITY

# Segments from source_3420.mkv (3420s..end)
#EXTINF:6.000000,
/api/hls/{key}/r3420/stream_00570.ts
#EXTINF:6.000000,
/api/hls/{key}/r3420/stream_00571.ts
...

#EXT-X-ENDLIST  ← only if merged = true
```

### Segment Routing

Route pattern: `/api/hls/{key}/r{startPos}/{filename}`

```ts
// Parse URL: /api/hls/tt1234567_s01e01/r3420/stream_00570.ts
const key = "tt1234567_s01e01";
const startPos = 3420;
const filename = "stream_00570.ts";

// Find range with matching startPos
const range = entry.sourceRanges.find((r) => r.startPos === startPos);
const filePath = join(range.file.replace(".mkv", ""), "hls", filename);
```

---

## Background Operations

### Gap Filling

When a seek creates a gap (e.g., 0..H cached, user jumped to P):

```
Priority queue adds:
  1. Continue downloading from P (high priority, user is watching)
  2. Fill gap H..P (lower priority, background)
  3. Cache next episode E+1 (lowest priority)
```

Gap-fill uses **copy-only mode**:

```bash
ffmpeg -ss H -i URL -c copy source_H.mkv
# No HLS output, just saving source
```

### Range Merging

When all gaps are filled (ranges cover 0..duration with no gaps):

```bash
# Create concat list
echo "file 'source_0.mkv'" > filelist.txt
echo "file 'source_H.mkv'" >> filelist.txt
echo "file 'source_P.mkv'" >> filelist.txt

# Merge with copy (fast, no re-encoding)
ffmpeg -f concat -safe 0 -i filelist.txt -c copy source.mkv

# Delete partial files
rm source_0.mkv source_H.mkv source_P.mkv

# Set merged = true
```

**Note:** `-ss` on copy mode snaps to nearest keyframe, so adjacent ranges may overlap by a few seconds. FFmpeg's concat demuxer handles duplicate timestamps gracefully.

### Auto-Cache Next Episode

After user starts watching episode E:

1. Look up next episode E+1 from metadata
2. Enqueue background download: dual-output from 0 (or copy-only if no immediate playback expected)
3. When user finishes E and starts E+1, it's already cached → instant playback

---

## Implementation Phases

### Phase 1: Dual-Output Foundation

**Goal:** Download source files during playback, enable instant re-watch

**Changes:**

- Update `MediaStore.start()` to output both source.mkv and HLS
- Store `sourceUrl` in `probe.json` for later resume
- Update `init()` to restore entries with incomplete source files
- Track download progress via FFmpeg `-progress` output

**User benefit:** Re-watching is instant, source quality preserved

### Phase 2: Multi-Range Support

**Goal:** Enable seeking past download head

**Changes:**

- Add `SourceRange` model to `MediaEntry`
- Implement pause/resume for ranges
- Add `buildMergedPlaylist()` for merged M3U8
- Update HLS route to serve from range subdirectories
- Add `SEEK` message to WebSocket protocol

**User benefit:** Can seek freely during first watch

### Phase 3: Background Intelligence

**Goal:** Fill gaps and pre-fetch smartly

**Changes:**

- Create `CacheScheduler` class with priority queue
- Implement gap-fill with copy-only mode
- Implement auto-cache next episode
- Add idle detection (TV off → low-priority background work)

**User benefit:** Gaps filled automatically, next episode ready instantly

### Phase 4: Source Merging & Cleanup

**Goal:** Consolidate completed downloads, manage disk space

**Changes:**

- Implement range merging via FFmpeg concat
- Add HLS segment cleanup after session ends
- Add disk space monitoring and cleanup policies

**User benefit:** Efficient disk usage, cleaner cache structure

---

## Key Decisions & Rationale

### Why Copy-Only for Source?

- Preserves all audio tracks and subtitle streams
- No quality loss from transcoding
- Allows future re-encoding with different settings
- Instant seeking on local files

### Why Dual-Output Instead of Sequential?

- Single download (no bandwidth waste)
- Instant playback start (no wait for buffer)
- Source saved in background while watching
- Simpler than coordinating two FFmpeg processes

### Why Keep HLS Segments Transient?

- Can regenerate quickly from source (local I/O)
- Saves disk space (movie source = 6GB, HLS segments = 4GB)
- Allows different transcoding profiles per device
- Only need to keep source files permanently

### Why Multi-Range Instead of Restart-From-Zero?

- User freedom to seek during first watch
- No wasted bandwidth re-downloading already-cached content
- Gaps filled in background without blocking playback
- Matches mental model: "download what I need, fill gaps later"

### Why FFmpeg Concat Instead of Custom Muxer?

- Fast (copy mode, no re-encoding)
- Handles PTS/DTS edge cases correctly
- Widely tested and reliable
- Keyframe overlap automatically handled

---

## Frontend Considerations

### Progress Indication

Two progress bars or indicators:

- **Playhead:** current watch position
- **Download progress:** how much source is cached

Show cached ranges visually (e.g., darker regions on seek bar).

### Discontinuity Handling

`#EXT-X-DISCONTINUITY` is natively supported by hls.js. At discontinuities, hls.js resets its internal PTS clock.

Track discontinuity positions from playlist and map `video.currentTime` to absolute media position:

```ts
// Example mapping logic
function getAbsolutePosition(
	hlsTime: number,
	discontinuities: number[],
): number {
	let offset = 0;
	for (const disc of discontinuities) {
		if (hlsTime > disc) offset = disc;
	}
	return offset + hlsTime;
}
```

### Seek Clamping

When source is incomplete and user seeks past download head:

- Show loading indicator
- Optionally: clamp seek to downloaded range with notification
- Or: allow seek and start new range (current plan)

---

## Performance Characteristics

### First Watch

- **Startup:** 3-5 seconds (unchanged from current)
- **Seeking within cached:** Instant (<1s)
- **Seeking past head:** 3-5 seconds (same as new playback)

### Re-Watch

- **Startup:** <1 second (local file)
- **Any seek:** <1 second (local file, frame-accurate)

### Disk Usage

- **Source file:** ~4-8 GB per movie, ~2-4 GB per TV episode
- **HLS segments:** ~3-5 GB while watching (can be deleted after)
- **Net permanent:** Only source files (can re-render HLS anytime)

### Network Usage

- **First watch:** Full file size (6-8 GB typical movie)
- **Re-watch:** 0 bytes
- **Seek during first watch:** Only the gap (if any)

---

## Risk Mitigation

### FFmpeg Reading Growing Files

**Risk:** HLS render fails when reading incomplete source file  
**Mitigation:** FFmpeg handles this naturally — waits and retries for local files

### Keyframe Alignment at Merges

**Risk:** Discontinuity at merge points due to `-ss` keyframe snapping  
**Mitigation:** Concat demuxer drops duplicate timestamps, overlap is imperceptible

### Disk Space Exhaustion

**Risk:** Filling up disk with large files  
**Mitigation:** Phase 4 adds monitoring, cleanup policies, user-configurable limits

### hls.js Discontinuity Mapping

**Risk:** `video.currentTime` doesn't match absolute position across gaps  
**Mitigation:** Track discontinuities, map correctly in frontend, or merge source ASAP

---

## Success Metrics

- ✅ Instant re-watch (<1s startup)
- ✅ No redundant downloads (bandwidth = file size)
- ✅ Free seeking during first watch
- ✅ Background gaps filled without user intervention
- ✅ Next episode ready when user finishes current episode
- ✅ Source quality preserved (all tracks, no transcoding loss)
