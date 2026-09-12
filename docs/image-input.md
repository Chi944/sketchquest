# Photo input

`PhotoImport` is the content of a modal. The application supplies a native dialog or equivalent focus-trapped wrapper, including Escape handling, focus restoration, and unmounting when closed. The component includes its own heading and close control.

```tsx
<PhotoImport
  aiEnabled={status.aiEnabled}
  onClose={closePhotoModal}
  onResult={reviewInterpretation}
/>
```

The result contains `requestId`, `interpretation`, a `previewUrl` for the **prepared crop**, and `metrics.latencyMs`. That elapsed time includes client preparation and the request. The caller owns the returned object URL and must revoke it after review ends, on replacement, and on unmount. Do not persist object URLs: their content only exists in the current page. The component cleans up its own source and preview resources.

## Input and preparation

- Accept JPEG, PNG, WebP, HEIC and HEIF, including a mobile `capture="environment"` input. Some browsers offer a file picker instead of a camera; a separate file input remains available.
- Reject empty files, unknown declared types, source files over 15 MiB, and decoded images over 24 million pixels. Common PNG/JPEG/WebP headers are inspected before decoding; formats without a recognized early header, including HEIC, are checked after decoding.
- Use browser orientation handling first. When native HEIC decoding fails, dynamically import `heic-to/csp` and convert locally. Failures explain how to use a JPEG or the manual editor.
- Crop coordinates refer to the oriented image. Four accessible edge sliders define an axis-aligned crop; clockwise rotation resets the crop to the entire newly oriented image. This is not perspective correction.
- Draw pixels into a fresh white canvas, cap the longest side at 1536 pixels, and encode as JPEG at decreasing quality. If necessary, reduce dimensions further. A bounded loop ensures the result is at most 1 MiB or returns an actionable error. EXIF and other source metadata are not copied.
- Grid guides stay outside the canvas and are never burned into the image. Dimensions are absent by default. Enabling “I know the grid size” sends explicitly selected columns/rows between 4 and 8. The optional legend is limited to 600 characters. A new photo resets crop, rotation, known-grid mode and legend.

Only pressing **Interpret photo** sends data. File selection, preview, cropping, rotation and the grid overlay are local operations. The disclosure names Cloudflare processing and distinguishes photographs from public puzzle snapshots without claiming zero provider retention.

## HTTP boundary

`POST /api/interpret` uses `multipart/form-data` with:

- `image`: sanitized JPEG, filename `sketchquest-crop.jpg`.
- `requestId`: fresh random identifier.
- Optional `width`, `height` and trimmed `legend`.

Expected success: `{ requestId, interpretation, metrics? }`. Expected error: `{ error: { code, message, retryAfter? } }`. The component checks the response identifier and basic interpretation shape; full board validation and uncertainty review belong to the application.

Every photo or request-input change invalidates outstanding work and aborts an active request. Closing does the same. A version check also discards responses that arrive after abort. Requests stop after 45 seconds, with no automatic retry. Server errors, quota exhaustion and failed decodes keep an existing usable photo available. A later retry is an explicit user action. When AI is unavailable, no inference request can be sent and the manual editor remains the alternative.

## Verification

Run `npm exec vitest run src/image`. Tests cover exact rotation/crop landmark mapping, no upscaling, decoded/source size boundaries, header inspection, bounded JPEG compression, resource disposal, optional multipart fields, correlation identifiers, malformed responses, quota errors and cancellation. These tests use synthetic byte headers and mocked decoding/HTTP; they do not make model calls or establish extraction accuracy.

For browser validation, additionally exercise native camera selection on a real mobile device, native and converted HEIC files, keyboard crop controls, changing a photo while decoding, changing crop/grid/legend during a request, closing during a request, failed extraction followed by retry, and replacement/unmount cleanup of the caller-owned review URL.

`heic-to/csp` usage follows the [maintainer documentation](https://github.com/hoppergee/heic-to). The converter is loaded only for HEIC/HEIF that the browser cannot decode itself.
