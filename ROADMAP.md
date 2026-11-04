# Roadmap

Milestones follow the product guide (§11). Each item lists what must work to close it.

## Done in v0.1

- **M0 · Video feasibility** — capability probe (decode / encode H.264 / encode AAC or Opus / share files),
  a fixed scene plus a clip with a tone exported to MP4 locally. *Verified in desktop Chromium.*
- **M1 · Photo carousel** — canvas, pages (add at end / remove last, undoable), zoom, photos, background,
  text, shapes, layers, preview, ordered files. *3- and 20-page panoramas rebuild with no missing or
  repeated columns (e2e).*
- **M2 · Mixed carousel** — clip timing, selectable audio per page, timed preview, MP4 per page, progress,
  cancel and retry that keeps finished pages. *The guide's Vejer case exports exactly JPG–MP4–JPG: 1080×1350,
  180 frames, 6 s, audible tone/silence, frame-accurate trim (e2e).*

## Next

### M0 follow-up · real devices
- [ ] Run the e2e flow by hand on Safari/iPhone and Chrome/Android; record per device what reads, encodes, saves and shares.
- [ ] Post a real carousel and confirm order, crop, motion and sound in Instagram's preview.
- [ ] Measure time to first preview, export time and peak memory for a 20-page project with large photos and several clips.

### M3 · Durable project
- [ ] Portable project file (`project.json` + `media/` in a ZIP): export and import on another device.
- [ ] Recovery screen after a forced close; keep the last valid revision.
- [ ] Storage quota handling during import (clear message, nothing half-saved).
- [ ] Re-link a missing original.

### M4 · First public release
- [ ] Three original templates (travel postcard across pages 1–2, contact strip, chronicle with a central clip) as editable data.
- [ ] Template slots vs. decorative frames kept separate (cf. SCRL Frame Creator: image slots, overlays, groups, crop/radius masks).
- [ ] "Review seam" mode with a draggable seam position on screen.
- [ ] Installable PWA with offline editing and export (test in airplane mode).
- [ ] Bundle split: load Mediabunny only when a clip is imported or exported.
- [ ] Accessibility pass (keyboard-only editing, screen reader labels on the stage).
- [ ] Bundled fonts with licences.

### M5 · Second version
- [ ] Panorama sweep: one MP4 that pans across the whole design (`x(k) = (N−1)·W·k/(F−1)`), with pauses and one audio track.
- [ ] Local auto-layout with editorial rhythm, saved seed, lockable pages.
- [ ] Shareable templates without the user's photos.
- [ ] Advanced photo tools (exposure, colour, filters), multitrack audio mix.
- [ ] Arbitrary page reordering (move the scene vs. reorder cut pieces, with a seam preview).
