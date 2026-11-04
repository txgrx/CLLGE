# SCRL web client — static findings (2026-11-04)

Method: the `reverse-engineer-anything` (REA) skill workflow, applied by hand.
Running the REA CLI (`npx rea-agents`) was not permitted in the cloud session,
so the publicly served HTML/JS of `app.scrl.com` was downloaded and inspected
statically with text search. **No SCRL code was executed, logged into, or
copied into CLLGE.** Only ideas and behaviour-level facts are recorded here.

Legend: **O** = observed in served files · **I** = inference · **U** = unknown.

## Target identity
- **O** Product: *SCRL: Photo Collage Maker*, seller Appostrophe AB (App Store id1289057196,
  Android `com.appostrophe.scrl`). Web client at `https://app.scrl.com`.

## Two separate web applications
| Path | What it is | Evidence |
|---|---|---|
| `/` , `/login`, `/app/more`, `/app/more/subscription` | Next.js (App Router) marketing + account portal | **O** `/_next/static/chunks/...`, React Server Components payload |
| `/app/` | Standalone Vite + React SPA titled **"SCRL Frame Creator"** | **O** `<title>SCRL Frame Creator</title>`, `/app/assets/index-*.js` |

- **O** Account API: `/api/v1/me/sign-in`, `/sign-up`, `/otp/email/sign-in`, `/otp/email/sign-up`,
  `/email-change`, `/account-deletion`, `/session/refresh`, `/session/sign-out`, `/device-id`,
  `/me/location`, `/me/predicted-ltv`. → **I** passwordless e-mail OTP login; per-user lifetime-value
  prediction used for monetisation.
- **O** Google Tag Manager on the portal.

## "SCRL Frame Creator" (`/app/`)
- **O** Canvas engine: **Konva** (react-konva style scene graph). No WebCodecs, MediaRecorder,
  ffmpeg, MP4/WebM mime types, ZIP or Web Share markers in the bundle.
  → **I** the web tool exports still images only (`toBlob`/`toDataURL`, `image/png`); video is
  not produced in the browser.
- **O** Size presets: Story 1080×1920, Portrait 1080×1350, Square 1080×1080, Landscape 1080×565,
  plus "Custom size" and "Set canvas size to fit the current selection".
- **O** Layer kinds: `IMAGE` (an *image slot* to be filled by the user), `OVERLAY` (a decorative
  image with a URL), `GROUP`. Inspector fields X/Y/W/H/R, lock ratio, align, corner radius,
  padding, background colour.
- **O** Masks: "Crop mask", "Radius mask", invert, copy/paste mask between layers.
- **O** Asset limit: images over **2000 px** are scaled down to **1920 px** on export.
- **O** Lifecycle: "Published / Not published", tags, thumbnails ("Custom thumbnail"), duplicate
  frame, minimap, undo/redo, keyboard shortcuts; data stored server-side
  (`/bicuehe9ci/api/projects`, `/upload-file`).
- **I** This is SCRL's **internal authoring tool for the template ("frame") catalogue**, not the
  consumer carousel editor. That matches the guide's caveat that web/mobile parity is unproven.

## Unknowns
- **U** The consumer editor and its video export live in the native iOS/Android apps; analysing
  an APK/IPA needs REA engines (JADX/Ghidra) that are not available here.
- **U** Clip length limits, audio policy across seams, exact export codecs.

## What CLLGE takes from this (design, not code)
- Default page 1080×1350 confirmed; add Story/Square/Landscape presets.
- Template model = slots (user content) + overlays (decoration) + groups, with crop/radius masks.
  This matches guide §3 ("a frame is not a slot") and goes in the milestone 4 roadmap.
- Our differentiator still holds: **in-browser mixed export (JPEG + MP4 with audio)**, which the
  SCRL web tool does not do.
