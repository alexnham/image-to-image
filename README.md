# Image to Image

Turn a photo into an ad that doesn't look AI-generated. See issue #1 for the spec.

## Setup

1. **Vercel:** import this GitHub repo as a new project.
2. **Database:** in the Vercel project → Storage, add **Neon** (sets `DATABASE_URL`). Open the Neon SQL editor and run `db/schema.sql`.
3. **Images:** in Storage, create a **Blob** store with **private** access and connect it (sets `BLOB_READ_WRITE_TOKEN`).
4. **Google sign-in:** in Google Cloud console → APIs & Services → Credentials, create an OAuth client (Web). Add redirect URIs `https://<your-domain>/api/auth/callback/google` and `http://localhost:3000/api/auth/callback/google`. Put the id/secret in `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` in Vercel.
5. **Secret:** run `npx auth secret` and set `AUTH_SECRET` in Vercel.
6. Redeploy.

## Local development

```sh
npx vercel env pull .env.local   # or copy .env.example and fill it in
npm install
npm run dev
npm test
```
