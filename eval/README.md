# SketchQuest evaluation corpus

**SYNTHETIC authored vector sketches. Not human handwriting, not photographs, and not evidence of real extraction accuracy.**

This folder contains 24 independently authored source boards (12 development, 12 held out), six additional conflicting/rejected sketches, original procedural SVG illustrations, readable ASCII annotations, and an offline evaluation harness. The renderer uses a fixed seed for small stroke variations. No external images, generated artwork services, network requests, or model calls are needed.

Live extraction results are **unavailable**. No extraction calls have been made for this corpus. The committed [extraction report](reports/extraction-not-run.json) contains zero recorded samples and `null` accuracy, latency, token, neuron, and cost measurements. Unit tests use literal artificial predictions only to test scoring; they are not model evaluation results.

## Files and reproduction

- [dataset.json](dataset.json): source IDs, fixed split assignments, SVG paths, and expected `BoardDefinition` values.
- [ANNOTATIONS.md](ANNOTATIONS.md): all 30 human-readable ASCII tables and rejection explanations.
- [fixtures.ts](fixtures.ts): the authored source annotations; development and held-out source boards are distinct.
- [generate-synthetic.ts](generate-synthetic.ts): deterministic drawing and annotation generation. A separate annotation reader checks each expected board with the core validator.
- [evaluate.ts](evaluate.ts): metrics over imported `Interpretation` outputs, with no model client.
- [reports/solver-local.json](reports/solver-local.json): real local solver measurements on authored fixtures.

```sh
npm run eval:dataset
npm run eval:extraction
npm run eval:extraction -- --predictions eval/my-run.json --output eval/reports/my-run.json
npm run eval:solver
npm test
```

`eval:extraction` with no predictions reports `not_run`; it never invokes an AI model. The prediction template is [predictions-template.json](predictions-template.json). Run all samples, including failed calls, before reporting a full-corpus score. Reports show recorded and unmeasured counts separately for development, held-out, and rejection samples.

The SVG files are inspectable source illustrations. Rasterize them to a model-supported PNG/JPEG format before any future image-model experiment; do not send unsupported SVG files to the app's photo-upload endpoint. Rendering the same source into multiple formats does not create additional independent evaluation samples.

## Importing actual model outputs

The input is JSON with `schemaVersion: 1`, optional `run` metadata, and `records`. Each record contains:

| Field                                       | Meaning                                                                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `sampleId`                                  | Exact ID from the selected dataset manifest. One output per sample per report.                                       |
| `interpretation`                            | The complete shared `Interpretation` object: status, width, height, cells, notes. Use `null` for a failed request.   |
| `error`                                     | Optional actual failure message; recorded failures remain in accuracy denominators.                                  |
| `correctionActions`                         | Optional observed number of user editing actions after extraction, or `null`. Do not infer it from mismatched cells. |
| `measurements.latencyMs`                    | Observed end-to-end extraction latency, including failures when known.                                               |
| `measurements.inputTokens` / `outputTokens` | Provider-reported token usage, when available.                                                                       |
| `measurements.neurons`                      | Provider-reported consumption in neurons, when available.                                                            |
| `measurements.costUsd`                      | Actual known cost for that request. Omit or use `null` when unknown; do not assume free.                             |

Suggested run metadata: `provider`, `model`, `promptVersion`, `recordedAt`, `provenance` (`live-model` or `manual-control`), and any preprocessing. The harness reports these as caller-declared metadata, not independently verified provenance.

Every interpretation cell must include `cell`, `terrain`, `occupant`, `uncertain`, `alternatives`, and `note`. A full board includes exactly one cell entry for every cell, including blank floor. Missing or duplicate cells cannot produce an exact-board match. Confidence flags are not treated as calibrated probabilities.

## Adding real self-drawn or permissioned photographs

Create a separate dataset JSON using the same manifest format and provide it with `--dataset path/to/dataset.json`. Keep the original files private and outside any public shared-puzzle payload. For every sample, record `id`, `sourceBoardId`, `split`, `kind`, local `image` path, and a manually checked `expectedBoard`.

Use `provenance.kind: "self-drawn-photo"` for your own drawing or `"permissioned-photo"` for a drawing/photo whose reuse is authorized. Include a private `permissionNote`, attribution when required, and preprocessing notes. Do not commit personal information or permission documents to a public repository.

Split **source boards before prompt tuning**. All photographs, crops, rotations, and rescans of one source board must remain in the same split. A different filename is not a new source. Freeze held-out annotations and prompts before evaluating that split; tuning on it makes it development data. Have another person check expected boards where possible. Report sample count, source diversity, capture conditions, and failures alongside accuracy.

The manifest parser rejects shared source IDs or identical expected boards across splits. It cannot detect visually similar redraws or falsely declared permissions; those require dataset review. This synthetic corpus includes a legend and clean grid lines, so it does not test perspective, shadows, blur, fingers, paper texture, handwriting diversity, or real phone image processing.
