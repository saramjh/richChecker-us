# Richchecker US — Android photo read/decode recovery (2026-11-16)

## Production observation

GA4 property `553866868` (America/Los_Angeles) reported two `upload_error` events, both `error_type=file_read`, by one measured Android Chrome user on **2026-11-04 19:00 PST**. For 2026-10-18..2026-11-15 property-local dates, `upload_started` was 15 events/11 measured users and `analysis_complete` 13 events/10 users. The actual provider, file bytes, real device and uniqueness of attempts were not accessible. This proves a US production error but does not prove one particular photo format or a device-specific failure cause.

## Exact correction

US still used `FileReader.readAsDataURL(file)` on the entire uploaded photo, where a `reader.onerror` produced the observed `file_read`. Replace that path rather than layering a second reader: native browser `URL.createObjectURL(file)` and `HTMLImageElement` load with a timeout and 50MiB/50MP preflight; reuse the existing displayed image, `processImage`, MediaPipe and result/share flow. Revoke URLs on error, reset and replacement. Only when native `<img>` cannot decode a selected photo, try one privacy-preserving native `createImageBitmap` recovery bounded to 20MiB original, 50MP decoded pixels, 7s decode, 5s encode, longest output side 2200px and local JPEG. Late ImageBitmap objects are closed. Inoperative native decoding still yields one terminal `upload_error`, not an invented success.

Telemetry sends only format category, size band and `upload_decode_recovered` on verified normalized preview, never a photo filename, photo content, Blob URL or raw error message. US English error messages retained. No new production package, third-party decoder, uploaded photo network transfer or paid model call. `analysis_error` canvas initialization now ends and cleans up the loading state.

## Verification and remaining uncertainty

- Browser QA: 29 scenarios, valid JPEG with FileReader intentionally disabled, format matrix, corrupt/HEIC/TIFF, timeout, non-image preflight, URL replacement/reset, native recovery, late bitmap closure and byte/pixel caps, all pass with zero browser page errors.
- Five existing repository contracts and JS syntax check pass. Full unmocked MediaPipe E2E forces `<img>` failure, verifies `upload_decode_recovered -> analysis_started -> analysis_complete`, visible result and zero page errors.
- Physical affected Android Chrome handset and its selected Google Photos/gallery/file provider were not available. The old FileReader failure path is removed, but root cause and full real-device P0 closure require a successful end-to-end reproduction and a post-deployment first-party/GA4 check on completed property-local days.

## 2026-11-16 — actual HEIC photos decode and analyze locally

An independent browser regression was reproduced with a **real HEIC photo fixture** (ISO/HEIF HEVC Main, 640×640). Prior to this change Chrome rejected its Blob URL with `image_decode`, and the previous native ImageBitmap fallback could not decode it either. This is one **verified, separate failure mode**; production GA4's historical Android error file format and photo provider were **not available** and must not be assumed to be HEIC.

After an ordinary `<img>` decoder fails, inspect at most 16 header bytes plus existing MIME category. For real HEIC/HEIF only, lazily load a self-hosted, unmodified browser-only MIT-licensed decoder `heic2any@0.0.4`, then convert the image to a local JPEG Blob and feed the **existing** preview, MediaPipe and results path. MIME-misreported JPEG filenames containing actual HEIC bytes are also handled. Normal JPEG/PNG/WebP uploads do **not** fetch or execute this 1.3 MiB bundle. The bundle and upstream MIT license are both in `assets/vendor/`; the photo is never submitted to a third-party decoder or server.

Controls: original HEIC input must be ≤12 MiB; UI conversion wait ≤10 seconds; output JPEG Blob ≤20 MiB; existing pixel cap 50MP applied on the converted image. Invalid/unsupported HEIC still yields the original `upload_error` and clear file-format guidance, not a false complete event. One page-lifetime HEIC conversion worker is created by the upstream library only on first use. Normal files continue through the original zero-copy Blob URL path; no additional normal-path library or resource cost. Metadata is discarded during JPEG conversion.

TDD RED: before integration, an actual HEIC fixture produced `image_decode` and `processImage=0`. GREEN: normal and mislabelled HEIC converted to 640×640 JPEG, emitted `upload_decode_recovered(recovery_method=heic_decoder)`, reached analysis; existing failure/limit/reset tests maintained. Full unmocked MediaPipe E2E using the original HEIC fixture verified actual rendered face result and `analysis_complete`, with zero browser errors and no network transfer of selected photo bytes. Physical affected Android Chrome file provider could not be reproduced because Android emulator system image is incomplete; the actual user-specific P0 stays OPEN until confirmed on their device.
