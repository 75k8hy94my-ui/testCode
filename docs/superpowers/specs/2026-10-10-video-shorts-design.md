# Video Shorts Player Design

## Goal

Add a separate short-form, vertical-swipe player for saved direct-link videos, while improving timestamp markers in the ordinary video player. Preserve the existing Reader boundary and protected-media access rules.

## User-facing behavior

### Ordinary video player

- Timestamp registration selects one of three icons: water splash, upward triangle, or toilet. It no longer asks for a free-form name.
- Each saved marker appears as a small icon bubble at its position on the seek bar. Selecting a marker seeks directly to that time.
- Left and right arrow keys seek backward and forward by 10 seconds.
- Keep existing ordinary-play behavior and counters independent from Shorts activity.

### Shorts route and layout

- Add a distinct route, `video-shorts.html`, for direct-linked saved videos. Do not embed the ordinary player or alter its navigation model.
- On desktop, show a back button at the upper left and render the player in a portrait phone-like frame within the existing app shell. Widen the frame when a landscape clip is active.
- On phones, omit the back button. A rightward swipe that starts at the left screen edge returns to the previous page. Horizontal swipes elsewhere do not seek or change seconds; vertical swipes navigate clips.
- Do not show the “縦スワイプ 8/126” counter, video title, or video details.
- The right-side like control is a generated heart image only. It is white when inactive and pale red when active. For landscape video on phones, show a rotation icon below the heart; tapping it switches the video and controls to landscape. Return to portrait when the clip ends.
- Double-tapping the active video opens `video-player.html?id=<id>` at the same absolute media time.
- Holding the video pauses playback only while held; release resumes if it had been playing. Holding the seek-bar area pauses playback and enables scrubbing. Show a small frame preview above the thumb using the source aspect ratio and a current/total time label such as `0:11 / 0:23`. The seek bar remains thin and keeps its normal color during seeking; time labels do not appear elsewhere on the bar.
- Preload upcoming media sufficiently to make vertical swipes feel immediate, while keeping media elements and decoded resources bounded and disposing them on route exit or VPN access loss.

### Shorts queue generation

- Read dimensions and duration from the direct video metadata. Portrait means `videoHeight > videoWidth`; landscape means `videoWidth > videoHeight`. Square videos are not portrait and fall into the overflow handling described below.
- Videos of 25 minutes or longer are excluded from the short-clip tiers. They are included at the very end as full-video entries.
- Build short clips for videos under 25 minutes as follows:
  1. **Tier 1:** Each timestamp marker on an otherwise eligible direct video starts a 30-second clip. This also admits landscape and square videos when they have markers. If another marker occurs within 30 seconds of a starting marker, combine the markers into that clip and end 10 seconds after the last marker. Ignore subsequent markers that fall within 10 seconds after that endpoint. Clamp clip ends to the actual duration. Each marker is consumed by at most one generated clip.
  2. **Tier 1, tag clips:** A portrait video with one or more tags and no timestamp markers receives one randomly chosen 30-second clip per queue generation. If shorter than 30 seconds, use the entire video.
  3. **Tier 2:** A portrait video with no tags and a custom title receives one randomly chosen 30-second clip. A blank stored title is the default title; the displayed service/ID fallback is not considered custom.
  4. **Tier 3:** Every remaining portrait video receives one randomly chosen 30-second clip, once per queue generation. This makes the random segment a per-video assignment, not a repeated selection on each playback.
  5. **Overflow:** After all short clips, play eligible unqueued landscape/square videos under 25 minutes as full-video entries. Play videos 25 minutes or longer last, also as full-video entries.
- Do not add non-direct URLs (embedded/site pages) to this route.
- Within the eligible queue, liked videos move ahead of unliked videos on the next generation, without making an otherwise excluded video eligible. Among unliked Tier 1 entries, the Shorts play-count bucket of 0–10 plays comes before the bucket above 10. Within each tier and play-count bucket, videos with fewer early swipes come first; random order breaks ties. Tiers retain their stated order, with the liked eligible entries promoted to the front. Persist the generated queue so clients do not independently reshuffle it.
- Increment the Shorts play count when a queue entry starts, including entries swiped away within 5 seconds. Separately increment an early-swipe count when a user leaves an entry within 5 seconds. Do not increment the ordinary `openCount` from Shorts playback. Apply likes, play counts, and early-swipe counts when generating the next queue, not by reordering a queue already in progress.
- Queue reset clears the saved sequence and random clip assignments, then creates a new sequence from the beginning. Reset conditions are the profile-page “再生順をリセット” action and detection of a newly added video. The reset control is not shown in the player.

## Protected state and synchronization

- The route shell may render before VPN approval, but must not read or expose videos, metadata, markers, queue state, or progress until `MangaReaderMediaAccess.canReadProtectedData()` is true. `pending`, `checking`, and `blocked` grant no access. If access is lost, stop and unload active media, discard protected DOM and in-memory state, and show the existing VPN gate.
- Keep video definitions and per-video stats/likes in the existing Vault-backed `mangaReaderVideos` and `mangaReaderVideoMeta` model. Keep `mangaReaderVideoMarkers` as the canonical marker map, add it to the Vault payload so markers are shared, and validate marker icon types while retaining a one-time read path for old `{seconds,label}` entries (map unknown/legacy labels to the upward-triangle icon). New writes use only icon identifiers and seconds.
- Add a normalized Vault-backed `mangaReaderVideoShortsState` containing schema version, generated queue entries (video id, start/end, entry type and generation), current entry index, absolute media time, known video IDs, generation timestamp, and revision/update time. Store the exact generated queue so sync resumes the same ordering and clip assignment across devices.
- Store per-video Shorts likes, Shorts play counts, and early-swipe counts in `mangaReaderVideoMeta`; never conflate Shorts count with ordinary `openCount`.
- Persist queue position and current time as playback advances with throttling plus immediate saves on pause, swipe, page hide, and route exit. Use existing Vault pending-sync behavior; do not sync while VPN access is unavailable. Do not apply a stale local snapshot over a newer synced state. If simultaneous devices update the same queue, use the most recently updated valid revision and persist the active queue as one atomic state object.
- Treat queue and metrics as protected synchronized state: no reads, display, writes, or sync in guest/offline-access mode unless the existing guest mode explicitly grants local guest access. The current app's guest media gate grants local-only access; guest changes remain local and are never uploaded.
- Reset or clear in-memory queue/player resources on logout, lock, and protected access loss according to the existing Vault cleanup lifecycle; persisted data remains intact when VPN status merely changes.

## Architecture and implementation boundaries

- Keep `manga.html` responsible for the video list and `video-player.html` responsible for ordinary playback. The new route owns its own queue, player elements, listeners, timers, observers, and preloads.
- Reuse the existing media gate, Vault payload/session, and video normalization APIs. Extend their canonical state handling rather than introducing a parallel local-only registry or bypassing conflict/revision handling.
- The profile reset action belongs in the rendered profile settings content and invokes a Shorts queue-generation reset through shared state; it must be unavailable until protected state can be read, except a clear guest-local equivalent if the guest surface can access that data.
- Add focused tests for queue generation, marker migration/normalization, Vault payload round-trip and clearing, queue sync revision handling, VPN gate lifecycle, ordinary marker controls, and route UI behavior. Exercise the new player and marker flow in a real browser.

## Explicit exclusions

- No new permission for non-direct site or iframe videos.
- Likes cannot broaden eligibility to landscape or 25-minute videos; they only change ordering for entries already eligible under the queue rules.
- Do not alter Reader architecture, bookshelf runtime, or ordinary-play counters based on Shorts activity.
- Do not add a reset button to the Shorts player.

## Review notes

- Architectural choices to verify in the implementation plan: exact metadata merge/conflict strategy for simultaneous Vault clients; browser-safe preview-frame extraction for cross-origin media; and the profile-to-queue reset interaction without initializing the video route.
- The spec intentionally makes random assignments durable in the synced queue, because regenerating them independently on each device would contradict synchronized playback position.
