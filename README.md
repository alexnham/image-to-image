# Image / Image

A working product-ad editor: upload a real photo, confirm the protected product,
change the setting by prompt, refine the layout, and export a PNG.

## Run locally

```sh
npm install
# Copy .env.example to .env.local and configure the services below.
npm run db:migrate
npm run dev
```

Open http://localhost:3000. Google sign-in is the normal login. For a private local
preview, set `LOCAL_DEV_AUTH=true` and use **Open local preview**. That provider is
always disabled in production. Keep the dev server on your own machine; the local
preview account is shared by everyone who can reach that dev server.

Required services:

- Auth.js Google OAuth: `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`.
  Callback: `http://localhost:3000/api/auth/callback/google` (and the production
  equivalent). Use the hostname registered with Google when signing in.
- Neon Postgres: `DATABASE_URL`; run the idempotent migration above.
- **Private** Vercel Blob store: `BLOB_READ_WRITE_TOKEN`.
- OpenAI API: `OPENAI_API_KEY`. Live usage is metered, independent of ChatGPT plans.

## What works

- JPEG, PNG, WebP and HEIC uploads up to 20MB, EXIF orientation, metadata stripping,
  and a 2048px maximum edge.
- Local U-2-Netp subject detection in a worker, soft mask and positive/negative
  brush refinement. The original RGB pixels become the product cutout.
- OpenAI vision extracts background text overlays; physical labels are preserved.
  Overlays covering protected product detail need a real replacement product photo.
- Prompt planning with validated operations: background replacement, local relight,
  contact shadows, text, product movement/scale, background object removal and
  adjustments. Unsupported requests are refused.
- Text words/font/color/size/position; product drag/scale/flip/swap; sliders,
  crop/rotation; remove brush; undo/redo; explicit save.
- Immutable version history, including editing from older versions, and 1–3
  independent prompt variations.
- PNG exports in original, 1:1 or 4:5 proportions, using bundled fonts on preview
  and server. Export saves pending manual edits first.
- 20 prompts per account. A successful variation costs one prompt; failed or
  refused edits and manual operations do not. All paid work reserves global budget.
- Owner-only image routes, project/file deletion, privacy disclosure, and basic
  export and week-two return metrics (`npm run metrics`).

## Operator controls

`MONTHLY_API_CAP_USD` defaults to **10 USD**. A database-atomic reservation occurs
before each OpenAI call: $2 for an image edit and $0.10 for planning/vision. Actual
input/output token costs are reconciled on successful responses. Unknown costs
(e.g. a timeout after submission) retain the full reservation. This intentionally
pauses work early if there is insufficient headroom. These bounds apply to the
fixed model, prompt lengths, quality and output sizes in this repo; re-evaluate
before changing those settings. Disable paid work immediately with a cap of `0`.
Use an OpenAI project budget as a second provider-side limit.

At capacity, paid actions stop while existing projects can still be edited
manually and exported. Configure `RESEND_API_KEY`, `OPERATOR_EMAIL`, and
`ALERT_FROM_EMAIL` to receive a once-per-month cap email. Email is optional for
local evaluation; delivery has fixture coverage but no real operator email has
been configured or sent. Failed delivery is retried when capacity is next checked.

No credentials are shipped to the browser. No automatic provider retries incur
surprise spend. Account locks serialize edits, saves and deletion; a crashed
request's lock expires after 10 minutes. Provider timeouts and Vercel function
termination can leave unattached images, which project deletion also removes.

## Verification

```sh
npm test               # no credentials or paid APIs; pixel/engine/provider tests
npm run lint
npx tsc --noEmit
npm run build
npm run test:db        # explicit: uses configured Neon, checks concurrent budget guard
npm run test:live      # explicit: paid OpenAI, Neon + Blob, creates a preview project
npm run test:editor    # explicit: paid extended checks on that project's versions
```

Live scripts use the disposable `local-preview` account. Do not run them against
an account containing your actual projects. Test results and output PNGs are
written to ignored `artifacts/`. The extended script tests removal, swap, OCR,
variations, exhausted allowance, and deletion of a new disposable fixture.

Measured POC evidence and limits: [docs/poc/verification.md](docs/poc/verification.md).
The original full v1 proposal remains in GitHub issue #1. This POC uses OpenAI for
planning and OCR with the owner's approval, instead of Claude and Google Vision.
The selected segmentation method and inference assets need no external account.

## Deploy to Vercel

Import this repository as a Next.js project. Configure the required secrets above,
connect Neon and a **private** Blob store, run `npm run db:migrate`, and register the
production Google OAuth redirect URI. Set the monthly cap explicitly. Use
`AUTH_TRUST_HOST=true` only on a trusted reverse proxy if running outside Vercel.
Build/install scripts copy the matching local ONNX WASM runtime to `public/onnx`.
Server functions using image edits allow up to 300 seconds; select a Vercel plan
and function duration that supports this. No production deployment is made by the
local build.

Before a public launch, verify the OpenAI project's data-sharing opt-ins are off,
configure a real alert sender, and test sign-in and HEIC uploads on target phones.
The app does not claim zero provider retention or universal segmentation quality.
