# Caching Architecture Plan

## Overview

The box fetches from Debrid, transcodes via FFmpeg, serves HLS to the TV, and caches to disk.
All cached data is permanent — there are no throwaway/temp sessions.
A `MediaEntry` is a collection of **Ranges**, each representing one FFmpeg run from a specific start position.

---

## Core Concepts

### Range
A single FFmpeg run from a start position, writing segments to its own subdirectory.

```
Range {
  startPos: number       // position in source where FFmpeg started (-ss value)
  head: number           // how far FFmpeg has transcoded so far
  dir: string            // media-cache/{key}_{startPos}/
  process: ChildProcess  // null if complete or paused
  status: 'running' | 'paused' | 'complete' | 'error'
}
```

### MediaEntry
```
MediaEntry {
  key: string            // e.g. tt1190634_s01e01
  probe: ProbeResult
  ranges: Range[]        // sorted by startPos
}
```

A `MediaEntry` is fully cached when its ranges together cover `0..duration` with no gaps.

### Merged M3U8
Constructed dynamically from all ranges, sorted by `startPos`.
Gaps between ranges are represented with `#EXT-X-DISCONTINUITY`.
When a gap is closed (a range's head reaches the next range's startPos), the discontinuity is removed.

### Segment Naming
Use FFmpeg's `-hls_start_number` so segment indices reflect their timeline position:
- Range starting at position P with segment duration D → `-hls_start_number floor(P/D)`
- Segments from different ranges never collide in the same directory (since subdirs are separate anyway)

FFmpeg's own `.m3u8` output is suppressed. The merged m3u8 is maintained by `MediaStore`.

---

## Cache States (per episode)

```
UNCACHED
   ↓  first watch
CACHING (single range 0..H, head growing)
   ↓  seek past H
PARTIAL (range 0..H complete/paused + range P..? growing)
   ↓  background fills H..P
   ↓  and/or more ranges added by further seeks
COMPLETE (ranges together cover 0..duration)
```

---

## Decision Tree

### User starts watching episode E

```
Is E fully cached (ranges cover 0..duration)?
├─ YES → Serve from merged m3u8. Seeks are instant within cached range.
│        Enqueue CacheSession(E+1) if not cached.
│
└─ NO
   ├─ E has a Range covering position 0 (CACHING or PAUSED)?
   │   └─ Serve merged m3u8 from position 0. User watches live as FFmpeg advances.
   │
   └─ E is UNCACHED
       └─ Start Range(startPos=0). Serve merged m3u8. Enqueue E+1 afterwards.
```

### User seeks to position P

```
Is P covered by any existing range (P < range.head for some range)?
├─ YES → Seek in place within video.seekable. No FFmpeg action.
│
└─ NO (gap)
   ├─ Is P close to the nearest range head H? (within ~60s)
   │   └─ Stall and wait for running range to reach P. Resume normally.
   │
   └─ Large gap
       ├─ Pause the currently running Range (kill FFmpeg, remember head=H).
       ├─ Start new Range(startPos=P). Serve merged m3u8 pointing to this range.
       ├─ Enqueue (lower priority): fill gap H..P via Range(startPos=H, targetPos=P).
       └─ Enqueue (higher priority): CacheSession(E+1).
```

### Background scheduler picks up next task

```
Priority order (only one FFmpeg runs at a time):
  1. Active range serving the TV (live user watch)
  2. CacheSession(next episode E+1, E+2...)
  3. Gap-fill range for current episode (H..P)
  4. Resume paused range for current episode (H..end)
```

### Gap closed

```
Range C (H..P) head reaches P
└─ Merge A+C logically: they now form a contiguous block 0..P
   Remove #EXT-X-DISCONTINUITY between them in merged m3u8.
   (Segments stay in separate dirs — no file moves needed.)
```

### Startup recovery for partial caches

On backend startup, `MediaStore` should scan cache directories and restore not only complete entries, but also partially cached entries.

For each partial entry:
- Determine the cached head timecode from its existing playlist/segments.
- Mark it as resumable (`paused`/`partial` state).
- When resumed, start FFmpeg from that head timecode (`-ss <head>`) against the same source URL.
- Continue HLS splitting into a new range directory and merge it into the entry timeline.

This avoids restarting from 0 when a previous caching session was interrupted (app restart, crash, or manual stop).

---

## HLS Serving

The `/api/hls/:key/:filename` route currently serves from a single directory.
It needs to handle:
- `master.m3u8` → return the dynamically constructed merged playlist
- `stream_N_XXXXX.ts` → look up which range owns that segment index, serve from its dir

The merged master.m3u8 contains absolute segment URLs so hls.js fetches each `.ts` from the correct range subdirectory.

---

## Frontend Handling

`#EXT-X-DISCONTINUITY` is supported natively by hls.js.
At a discontinuity, hls.js resets its internal PTS/DTS clock.
The existing `startPositionRef` offset logic on the frontend needs to account for this:
- Track discontinuity points from the playlist
- Map hls.js's internal `currentTime` back to absolute media position correctly

This is the main open question requiring a front-end test before committing to this approach.

---

## Implementation Phases

### Phase 1 — Current state (implemented)
Single-range `MediaEntry`. Seek = clamped to buffered range. No gap handling.

### Phase 2 — Multi-range MediaEntry
- `MediaEntry` holds `Range[]`
- `MediaStore` constructs merged m3u8 dynamically
- Seek past head → start new Range, old one pauses
- HLS route serves segments from correct range dir
- No gap filling yet (gaps just remain as discontinuities)

### Phase 3 — CacheScheduler
- Priority queue for background FFmpeg work
- Auto-cache E+1 after E starts playing
- Gap-fill ranges queued at low priority
- TV-off detection → resume background caching

### Phase 4 — Gap closing
- When a gap-fill range's head reaches the next range's startPos, merge them logically
- Remove discontinuity from merged m3u8
- Mark entry as fully cached when 0..duration is covered
