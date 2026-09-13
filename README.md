# Billionaire Face Match

English adaptation of the Korean richChecker starter kit, live at <https://saramjh.github.io/richChecker-us/>. Static HTML/CSS/JS, with no build step.

## Run

```sh
python3 -m http.server 8000
```

Open http://localhost:8000. The repository root contains the working app and its local data-generation tools.

## Agreed direction

- English UI with an introduction to Korean gwansang (traditional face reading).
- Compare facial proportions for entertainment; do not claim to predict personality or wealth.
- Dataset: the supplied Forbes Real-Time Billionaires top-100 JSON, keyed by `exportOrder`/`position`.
- The site uses the supplied AI caricature sheet. Photos stay in the browser unless the user explicitly saves or shares a card.
- Original purple/gold styling retained.

## Current state

The site is launched and indexable: `robots.txt` allows crawling, `index.html` has a canonical URL, OG/Twitter preview image, and a real `<title>`, and GA4 (`G-FZ9BXBPXLK`) is wired up alongside AdSense (`ads.txt` verifies publisher `pub-4410729598083068`). Two fixed-position, fixed-size ad units replace auto ads; see the ad notes below before touching them.

The app manifest is available in `data/people.json`. It contains all 100 records and maps the composite image by `exportOrder`, so tied Forbes ranks cannot shift later portraits. Empty portrait cells remain in the manifest for auditability and are excluded from matching.

Matching keeps dominant-axis selection, z-score clamping, and the 3% similarity floor. The UI calls the linear z-score transform a feature score, not a statistical percentile. Image capture retains pre-cropping and opaque face hiding.

## Ad placement notes

Auto ads previously broke the fixed-width card layout by injecting large ads mid-upload-area, so both ad slots are manual, fixed-position `.ad-slot` units (see the CSS comment above `.ad-slot` for why the wrapper uses flex centering instead of `margin:auto` on the `<ins>`).

Pushing every `.adsbygoogle` unit immediately/individually caused two problems, now fixed:

- Per-`<ins>` inline `push()` scripts fired before the page layout had settled, which could make AdSense miscompute the unit's width and distort the surrounding flex layout. Fix: a single deferred `<script>` at the end of `<body>` pushes all ad units once, after the DOM has rendered.
- The second ad slot lives inside `#resultsContainer`, which is `display:none` until a match is computed. Pushing it at page load (while hidden, effectively zero-width) makes AdSense give up on that slot permanently — it does not retry when the container is later shown, so the bottom ad never appeared. Fix: that slot is excluded from the page-load push and is pushed instead from `script.js` right after `resultsContainer` is set to `display:block`.

If ads stop appearing again, check both of these before assuming an AdSense account/policy issue.

## Validation

Chrome checks cover English UI, 390px mobile and 1280px desktop overflow, six feature sections rendered with a synthetic UI fixture, PNG saving, opaque face hiding, and the download fallback when Web Share is unavailable. An actual upload of a non-face image loads the scanner and shows the expected English detection error; the upload panel remains usable. Successful real-person matching still requires the US dataset. Native OS sharing needs device-level verification.

## Refresh the Forbes snapshot

Replace the repaired source JSON, source photos, and 10×10 caricature sheet together. Then run `python3 tools/split_caricature_sheet.py` and regenerate embeddings. `rank` preserves the Forbes rank, while `position` and `exportOrder` provide a unique 1–100 mapping through tied ranks. `title` records the supplied source of wealth. Names including “& family” retain Forbes' original attribution.

## Caricature generation and validation

The current portrait source is `assets/crawled/forbes-real-time-billionaires-top-100-complete-repaired/0d1691a0-dcf1-46ae-83af-1854d589d735.png`. `tools/split_caricature_sheet.py` maps its cells to `exportOrder` 1–100, creates uniform 640×640 tiles with an inset gold border, and rebuilds `data/people.json`. The source sheet remains unchanged. The review gallery is `/tools/caricatures.html`.

With a local server running, use `node tools/precompute.cjs --partial` to validate available images without replacing production embeddings. Run `node tools/precompute.cjs` to build the match data. This requires Playwright; `PLAYWRIGHT_MODULE` may point to an existing installation and `CHROME_PATH` to an installed Chrome executable. Each usable portrait must contain exactly one detectable face and six finite proportions. Blank cells are marked `blank-or-undetected` and excluded from embeddings. Results are recorded in `data/caricature-validation.json`.

`tools/precompute_from_photos.cjs` uses the local-only repaired `images/` directory for feature extraction. It resolves each file from the source JSON's `imageFile` field and `exportOrder`, while preserving caricature paths for every public image. The photo directory is ignored by Git and excluded from deployment. People without a usable source photo fall back to their caricature, recorded by `featureSource` in the embeddings.

The current dataset contains 100 display caricatures and 100 match records. All caricatures pass face detection. Matching uses 99 real-person source-photo feature vectors; John Mars uses a clearly labeled caricature fallback because the available verified Forbes photograph is a full side profile. Exact results are recorded in `data/caricature-validation.json` and `data/photo-analysis-validation.json`.
