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

The site is launched and technically crawlable: `robots.txt` allows crawling, `index.html` has a canonical URL, OG/Twitter preview image, a real `<title>`, and a sitemap. GA4 (`G-4DYFKSNFBG`) is wired up alongside AdSense (`ads.txt` verifies publisher `pub-4410729598083068`). Search-engine indexing is external state and should be verified in Search Console rather than assumed from repository configuration.

The app manifest is available in `data/people.json`. It contains all 100 records and maps the composite image by `exportOrder`, so tied Forbes ranks cannot shift later portraits. Empty portrait cells remain in the manifest for auditability and are excluded from matching.

Overall matching ranks the three closest people by six-feature z-score distance. The dominant feature remains as a separate explainability layer that names the closest person on that one feature. Matching keeps z-score clamping and the 3% similarity floor; every visible/share similarity is the same rounded integer display score while ranking continues to use raw distance. The UI calls the linear z-score transform a feature score, not a statistical percentile. Image capture retains pre-cropping and opaque face hiding.

## Ad placement notes

The acquisition funnel intentionally has no in-flow ad slot before analysis. A single manual `.ad-slot` lives inside `#resultsContainer` after the result/share controls so monetization does not interrupt photo selection.

Because `#resultsContainer` is `display:none` on page load, its AdSense unit must not be pushed until results become visible. `renderResults()` sets the container to `display:block` and then initializes that unit. Keep this ordering if the result layout changes.

## First-screen conversion contract

A search or referral visitor should understand the result before choosing a photo: result promise first, one primary photo CTA, then trust details. The empty upload panel stays compact at 220px and expands to the 400px photo preview only after a file is chosen. `photo_picker_opened` and `upload_started` include `source` so the primary CTA and upload-panel entry points can be compared.

## Matching regression contract

`node tools/matching_contract.mjs` verifies self-match #1, sorted unique Top 3 results, integer similarity display, and Top-1/Top-3 retention under ±0.05σ perturbations of every feature for the full dataset. This protects the feature-vector/matching math contract; it is not a claim about image-level rotation or lighting robustness.


## Design language contract

- The established purple/gold face-reading and trading-card theme remains the product identity.
- On-screen type uses semantic `--type-*` roles instead of one-off sizes. The minimum display role is 12px (`--type-micro`); H1 uses `--type-hero`, while body copy and controls use body roles.
- Decorative serif type is reserved for display/result identity; body copy, explanations, and controls use the body stack.
- `--gold-dim` is border/decor only. Readable text uses contrast-safe gold/text roles.
- Primary photo/save actions stay at least 48px high, secondary controls stay 40–44px or larger, and mobile content does not apply nested width shrinkage.
- Korean and Global stylesheets stay structurally identical except for locale-appropriate font stacks. `node tools/design_contract.mjs` enforces typography roles, font roles, readable color usage, target sizing, mobile width, and radar-label minimum size in CI.

## Runtime and funnel telemetry contract

- The new photo's `load` listener is installed before changing `src`, so MediaPipe starts only after that exact source has real pixel dimensions; the already-loaded placeholder cannot be mistaken for the selected photo. Selected pixels are snapshotted before any asynchronous model/module wait.
- The file input is cleared immediately after capturing the `File`, so selecting the same file again still emits `change`. Upload analyses and transition cleanup are serialized, while face detection has a bounded two-attempt retry recorded as `detection_attempts`.
- The primary similarity is rendered directly from the computed value instead of depending on a count-up animation, and loading cleanup has a timeout fallback if GSAP completion is throttled.
- Result ads initialize asynchronously only after the core result is rendered; AdSense layout/network failures are isolated and cannot turn a successful analysis into an error.
- analysis_complete is emitted only after the result UI renders successfully, and one attempt cannot emit both analysis_complete and analysis_error.
- Analysis telemetry includes source, entry_ref, warm/cold model/data flags, file/image size, and per-stage timings.
- Same-origin acquisition is classified into the legacy rich-tester page, Korean/English acquisition pages, and cross-edition traffic; external referrer URLs are not forwarded as event parameters.
- node tools/runtime_contract.mjs enforces the exact-source image gate, same-file retry, serialized uploads, bounded detection retry, first-upload snapshot, promise dedupe, post-render completion, and acquisition/performance telemetry contract in CI.

## Editions

This app is part of a two-edition face-match experience. The Korean edition compares against a separate 47-person Korean rich-list sample, while the Global edition compares against a 100-person billionaire sample. They are distinct products rather than translated equivalents, so they cross-link with normal crawlable links instead of `hreflang`. The post-primary-action edition switch and post-result links are measured with `cross_edition_click` (`placement`, `target_edition`, `link_url`).

## Validation

Chrome checks cover English UI, 390px mobile and 1280px desktop overflow, six feature sections rendered with a synthetic UI fixture, PNG saving, opaque face hiding, and the download fallback when Web Share is unavailable. An actual upload of a non-face image loads the scanner and shows the expected English detection error; the upload panel remains usable. Successful real-person matching still requires the US dataset. Native OS sharing needs device-level verification.

## Refresh the Forbes snapshot

Replace the repaired source JSON, source photos, and 10×10 caricature sheet together. Then run `python3 tools/split_caricature_sheet.py` and regenerate embeddings. `rank` preserves the Forbes rank, while `position` and `exportOrder` provide a unique 1–100 mapping through tied ranks. `title` records the supplied source of wealth. Names including “& family” retain Forbes' original attribution.

## Caricature generation and validation

The current portrait source is `assets/crawled/forbes-real-time-billionaires-top-100-complete-repaired/0d1691a0-dcf1-46ae-83af-1854d589d735.png`. `tools/split_caricature_sheet.py` maps its cells to `exportOrder` 1–100, creates uniform 640×640 tiles with an inset gold border, and rebuilds `data/people.json`. The source sheet remains unchanged. The review gallery is `/tools/caricatures.html`.

With a local server running, use `node tools/precompute.cjs --partial` to validate available images without replacing production embeddings. Run `node tools/precompute.cjs` to build the match data. This requires Playwright; `PLAYWRIGHT_MODULE` may point to an existing installation and `CHROME_PATH` to an installed Chrome executable. Each usable portrait must contain exactly one detectable face and six finite proportions. Blank cells are marked `blank-or-undetected` and excluded from embeddings. Results are recorded in `data/caricature-validation.json`.

`tools/precompute_from_photos.cjs` uses the local-only repaired `images/` directory for feature extraction. It resolves each file from the source JSON's `imageFile` field and `exportOrder`, while preserving caricature paths for every public image. The photo directory is ignored by Git and excluded from deployment. People without a usable source photo fall back to their caricature, recorded by `featureSource` in the embeddings.

The current dataset contains 100 display caricatures and 100 match records. All caricatures pass face detection. Matching uses 99 real-person source-photo feature vectors; John Mars uses a clearly labeled caricature fallback because the available verified Forbes photograph is a full side profile. Exact results are recorded in `data/caricature-validation.json` and `data/photo-analysis-validation.json`.

- 2026-09-30 runtime/UI contract: core MediaPipe/WASM/data warm-up begins during deferred runtime execution; every analysis explicitly restores loader visibility; share PNGs are prepared before share clicks; result spacing is owned by shared `--space-*` tokens and `.result-actions`.

- 2026-09-30 transition contract: selecting a file must show the full-viewport processing state before FileReader/decode work begins; every analysis keeps that state perceptible for at least 900 ms; long results switch the page to top-aligned `result-mode`; reset collapses result DOM and restores scroll/initial geometry before revealing the intro; result motion starts only after the processing overlay exits.

- 2026-09-30 transition follow-up: the processing overlay gets a paint opportunity before decode/detection; the offscreen share card is `display:none` except during capture so it cannot inflate document height; expensive html2canvas preparation is armed only when the result actions approach the viewport, never during the initial result reveal.

- 2026-09-30 cleanup/ownership contract: base CSS selectors have a single owner; tail patch rules and known dead JS are forbidden by `tools/ownership_contract.mjs`; tracked people assets must match current `data/people.json`; CI runs the ownership contract before deploy. Motion follows a single `MOTION` policy with short opacity tweens, longer zero-bounce transform settling, interruption-safe reset ownership, and `prefers-reduced-motion` handling.

- Share-card pre-rendering is cancellation-aware: entering the action area only schedules a delayed idle capture; reset/clear cancels the observer, delay and idle callback before html2canvas starts, so export work cannot own or stall navigation transitions.

- Reset follows state-first motion: result DOM, scroll and caches commit to the intro state synchronously; the intro settle animation is decorative and cannot delay geometry restoration.
