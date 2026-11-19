# POC verification — 2026-11-18

This is a local, functional POC of issue #1, not a claim that all launch research
and production rollout acceptance criteria are complete.

## Provider and scope decisions

The owner explicitly approved reuse of the existing OpenAI key and OpenAI-based
planning and text detection instead of Claude/Google Vision for the POC.

- Planner/OCR: `gpt-5.4-mini-2026-03-17`, Responses API structured JSON,
  `store:false`, low image detail, max 2200 output tokens, no reasoning.
- Image edits: `gpt-image-2.5-sunburst-2026-09-08`, `low`, one PNG per request,
  1024² / 1536×1024 / 1024×1536 by orientation. The output is explicitly resampled
  to the app canvas. Original subject detail is composited locally, not entrusted
  to the image model's mask compliance or geometry.
- Segmentation: local **U-2-Netp**, Apache-2.0, 4.6MB ONNX weights,
  `BritishWerewolf/U-2-Netp` conversion of the original U-2-Net model. ONNX Runtime
  WASM in a worker, 320² input and bilinear soft-mask resampling. All runtime assets
  come from this app; no photos are sent to a segmentation provider.
- BEN2 was evaluated and rejected for this POC: too heavy on CPU and failed on the
  accelerated browser path on the evaluation machine. No BEN2 dependency remains.
- Selection always requires confirmation: confidence is not calibrated. Positive
  and negative brush taps paint the matte; they do not run an interactive SAM
  decoder. Fine hair, transparent objects, reflective edges, and crowded scenes
  require manual checking. No universal matte-quality claim is made.
- Local low-frequency relighting and a synthetic matte-derived shadow remain
  approximations. Prompt planning includes a matching local relight on scene
  replacement; this is not measured physical scene-light estimation.

Sources: [OpenAI image guide](https://developers.openai.com/api/docs/guides/image-generation),
[image model/settings/pricing](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst),
[planner pricing](https://developers.openai.com/api/docs/models/gpt-5.4-mini),
[U-2-Netp conversion](https://huggingface.co/BritishWerewolf/U-2-Netp),
[original U-2-Net and license](https://github.com/xuebinqin/U-2-Net).

## Observed results

Local development run using configured Neon, private Vercel Blob and real OpenAI
requests. Includes cold route compilation, storage and database latency; small
samples, not percentile latency measurements.

| Check | Result |
| --- | --- |
| 800² deterministic product chart, preparation | Passed, 24.8s including cold compile; image cost $0.014332 |
| Background + headline prompt | Passed, 25.1s; planner $0.001757 + image $0.014512 |
| Unsupported dragon/product-regeneration request | Refused, 4.0s; no user prompt charged; planner cost $0.001679 |
| Two text-only variations from one base | Passed, 11.6s combined; one prompt per variation, separate immutable versions |
| Detect text on product label | Passed, 10.2s including cold compile; all found product labels classified as in-scene |
| Remove brush (100² background region) | Passed, 15.5s; all pixels outside the selected background region compared byte-for-byte unchanged |
| Product photo swap | Passed, 6.0s; new original cutout reference, no prompt charged |
| Save from version 0 after newer edits | Passed; appended a new latest version retaining the selected old background |
| 4:5 PNG export | Passed; decoded dimensions verified; no prompt charged |
| Authentication and cross-origin request | Anonymous read returned 401; cross-origin write returned 403 |
| Exhausted user allowance | Prompt returned 403; export still returned 200 |
| Browser-local detection, real 2048px café photo | Foreground cup/saucer selected; positive/negative selection controls exercised |

The synthetic chart verifies small label detail precisely; it is not a real-photo
quality benchmark. The real photo is the public café reference from
[Unsplash](https://images.unsplash.com/photo-1509042239860-f550ce710b93), used only
as an ignored QA fixture. A broad real-product dataset and difficult-edge quality
study remain launch work. Do not claim the 30-second target generally.

Image costs use *all* reported input text ($5/M), input image ($8/M), and output
image ($30/M) tokens. Planner cost uses $0.75/M input and $4.50/M output. These are
standard endpoint rates; credits are not treated as free usage. Unknown usage
retains the full app reservation rather than guessing a refund.

## Automated evidence

Fixture tests exercise operation rollback, immutable history, original subject
references, real pixel composition, crop/rotation/text export, image-mask merging,
provider success/rejection/rate limits/timeouts, reservation-before-request,
unknown-cost retention, and alert delivery with a fake email transport.

`npm run test:db` opts in to actual Neon concurrency checks. Routine `npm test`
skips the database test and requires no service credentials.

## Privacy and operational limits

OpenAI API inputs are not used for training by default. Requests use `store:false`
where supported, but standard abuse-monitoring retention can be up to 30 days,
and safety/legal exceptions apply. Account-specific sharing opt-ins have not been
independently inspected; the operator must verify them before public launch.
[Data controls](https://developers.openai.com/api/docs/guides/your-data).

Images and versions are kept in private app storage until project deletion. Delete
removes the database record only after deleting all recorded and project-prefixed
files. Storage verification must bypass the CDN (`useCache:false`); cached private
objects can otherwise appear readable immediately after origin deletion. Owner
checks and `Cache-Control: private, no-store` prevent app access after deletion.
Infrastructure backups and provider safety logs have separate lifecycles.

No real email recipient is configured. The cap email integration is implemented
and tested with a fake transport; live delivery is not verified. Production Google
OAuth, a physical-phone HEIC upload matrix, provider account data controls and
production hosting rollout remain outside the completed local verification.

## Final rerun

- Fixture suite: **47 passed**, 1 explicit live-DB check skipped by default,
  after integrating the latest main branch narrow-image and relighting fixes.
- Opt-in real Neon check: **1 passed**, including simultaneous reservations and
  cap refusal without a provider call; test reservations reconciled to zero.
- Lint and TypeScript: passed. Production build: passed, all routes emitted.
- The complete paid smoke and extended suites both passed on the final pipeline:
  preparation **21.4s**, scene + text + local relight **21.7s**, manual save **0.3s**,
  unsupported request **4.2s**, two text variations **5.5s**, OCR **4.6s**, brush
  **15.7s**, swap **2.2s**. Upload fixture included a promotional headline, verified
  as an editable layer while its physical product label remained in the cutout.
- Real browser: 2048px photo prepared, prompt edited, manual position adjusted,
  undo/redo and save exercised, PNG download displayed **Done**. The exported
  **1365×2048** PNG was decoded and visually inspected.
- Permanent deletion verified against Blob **origin**, with `useCache:false`.
- Metrics command runs and excludes the local-preview account from signup cohorts.
- Production dependency audit: **0 vulnerabilities** after overriding the Blob
  SDK's outdated nested Zod with the already installed fixed Zod version.

The responsive CSS is implemented, but a physical phone/HEIC device matrix is not
verified. Chrome developer-tools responsive emulation was unavailable through this
native preview session; no claim of a completed mobile-browser test is made.

Production-mode HTTP smoke checks also passed: public home and Google provider,
no local-preview provider or button, bundled model/WASM/font assets, and an
owner-authenticated PNG export. Blob path validation rejects prefix lookalikes,
URL escapes and traversal before any client-supplied image is read.

## Merge review corrections

The review found six defects beyond the original happy-path checks. Regression
fixtures now cover stable Google IDs across separate OAuth logins, odd/narrow
4:5 export dimensions, crop/rotation coordinate conversion in the real planner,
region-only upload cleanup, replacement products with different framing, saved
lighting after swaps, and use of the selected bounded brightness transfer.
The previously failing cases were reproduced before their fixes. These checks
use local fixtures and fake provider output; no paid calls were needed.

Preparation now merges only product/contact-shadow and detected overlay cleanup
regions, preserving other background and in-scene text pixels. The local shadow
cleanup uses a bounded base band; long cast shadows may still need the brush.
Swap aligns visible product bounds and preserves transform plus recorded lighting.
Older POC versions without lighting metadata retain original lighting on a swap.

Google sign-ins now use the verified provider account ID. Existing JWT sessions
keep their existing IDs until signing in again. Legacy random-ID project rows
cannot be automatically attributed because the original schema did not persist
Google account mappings; any such records require a verified operator mapping,
not an inferred reassignment. No legacy records are deleted by this change.

The remaining ticket gaps include phone/HEIC verification, benchmarks and account
privacy controls, confidence-based selection skipping, text dragging, pinch
resizing, history thumbnails, explicit variation selection, operational email
verification, and complete return-visit instrumentation. These are not claimed
complete by merging the POC.
