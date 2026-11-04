# CLLGE demo film

The 28-second "how it works" film on the home page (`public/media/how-it-works.mp4`) is made entirely
in code with [Remotion](https://www.remotion.dev/). Only the rendered MP4 and its poster ship with the
app; this folder is the source.

- **Pictures** — `public/img/` is rendered by the app's own renderer and templates
  (`tests/harness/filmAssets.ts`), so the film shows exactly what CLLGE produces. No stock, no AI.
- **Sound** — `public/sfx/` is synthesized with FFmpeg (clicks, whooshes, a pop, a chime and a quiet
  low pulse). No licensed music.
- **Fonts** — the same OFL fonts as the app.

## Re-render

```bash
# 1. stills, from the repo root, with the app dev server running on port 5175
npx vite --port 5175 &
node video/scripts/make-assets.mjs

# 2. film
cd video
npm install
npx remotion render src/index.ts HowItWorks ../public/media/how-it-works.mp4 --codec h264 --audio-codec aac
# smaller file for the web
ffmpeg -i ../public/media/how-it-works.mp4 -c:v libx264 -preset slow -crf 27 -movflags +faststart -c:a aac -b:a 96k out.mp4
```

In a container without Remotion's own browser, set `REMOTION_BROWSER` to a headless Chrome binary.

## Licence note

Remotion is free for individuals, non-profits and companies of up to three people; larger companies
need a [company licence](https://www.remotion.pro/license) to render. The rest of CLLGE is MIT and does
not depend on Remotion at runtime.
