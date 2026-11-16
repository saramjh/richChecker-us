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
