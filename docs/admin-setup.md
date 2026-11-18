# Admin setup (`/admin/`)

The admin lets the owner write posts in the browser. **Publishing** commits a Markdown
file to GitHub, and Cloudflare Pages rebuilds the static site (~1–2 min). **Uploads**
go straight from the browser to an R2 bucket via short-lived presigned URLs.

```
browser ──Cloudflare Access──▶ /admin/, /api/admin/*  (JWT re-verified in src/lib/admin/auth.ts)
   │                                │
   └─PUT (presigned)──▶ R2          └─GitHub Contents API──▶ repo ──▶ Pages rebuild
```

Until every variable below is set, `/admin/` answers **500 "ยังตั้งค่า admin ไม่ครบ"** and the
API refuses all requests, so deploying this code before finishing setup is safe.

## 1. R2 bucket for media

1. Cloudflare dashboard → R2 → **Create bucket**, e.g. `natpakan-media`.
2. Bucket → Settings → **Public access**: connect a custom domain (e.g. `media.<your-domain>`)
   or enable the `r2.dev` URL. This is `MEDIA_PUBLIC_BASE_URL`.
3. Bucket → Settings → **CORS policy** (lets the admin page PUT files):
   ```json
   [
     {
       "AllowedOrigins": ["https://natpakan-site.pages.dev"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["Content-Type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
4. R2 → **Manage API tokens** → Create token: *Object Read & Write*, scoped to this bucket only.
   Copy the Access Key ID / Secret and your Account ID.

## 2. GitHub token

GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate:
- Repository access: **only** `natpakan_site`
- Permissions: **Contents → Read and write** (nothing else)
- Set an expiry and a calendar reminder to rotate it.

## 3. Cloudflare Access (the login)

Zero Trust → Access → Applications → **Add → Self-hosted**:
- Domain: `natpakan-site.pages.dev`, paths `admin` and `api/admin` (add both).
  If the dashboard refuses a `pages.dev` hostname, attach a custom domain to the Pages project and use that.
- Policy: **Allow**, Include → Emails → your email. Turn on a second factor in your identity provider.
- Login methods: One-time PIN (email) works out of the box; Google is nicer.
- After saving, copy the **Application Audience (AUD) tag**. Your team domain is
  `<team>.cloudflareaccess.com` (Zero Trust → Settings → Custom Pages).

## 4. Firestore service account (fixes open database rules)

1. Firebase console → Project settings → Service accounts → **Generate new private key**.
2. Store the whole JSON (one line) as `FIREBASE_SERVICE_ACCOUNT`.
3. **After** the deploy with that secret is live, publish `firestore.rules` (deny all):
   `npx firebase-tools deploy --only firestore:rules` or paste it into Firestore → Rules.
   Doing it in this order keeps view counts working throughout.

## 5. Environment variables

Pages project → Settings → **Variables and Secrets** (Production). Add as *Secret* unless noted:

| Name | Value |
|---|---|
| `CF_ACCESS_TEAM_DOMAIN` | `<team>.cloudflareaccess.com` (plain text ok) |
| `CF_ACCESS_AUD` | AUD tag from step 3 |
| `ADMIN_EMAILS` | your email (comma-separated for more) |
| `GITHUB_TOKEN` | token from step 2 |
| `GITHUB_REPO` | `natpakanchamp/natpakan_site` (plain text) |
| `GITHUB_BRANCH` | `main` (optional) |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | from step 1 |
| `R2_BUCKET` | bucket name |
| `FIREBASE_SERVICE_ACCOUNT` | JSON from step 4 |

`MEDIA_PUBLIC_BASE_URL` is **not** a secret: it lives in `wrangler.toml` under `[vars]` (this project's
plain-text variables are managed there, not in the dashboard), and `astro.config.mjs` reads the same
value at build time for the CSP.

Upload all secrets at once from `.dev.vars` with `npx wrangler pages secret bulk <file.json> --project-name natpakan`.
Redeploy after changing variables.

## Local development

Copy `.env.example` to `.dev.vars`, fill it in, and set `ADMIN_DEV_BYPASS_EMAIL` to skip Access
locally. The bypass is compiled out of production builds (`import.meta.env.DEV` is `false`).

```bash
npm run dev           # http://localhost:4321/admin/
npm test              # unit tests (Vitest)
npm run test:e2e      # admin UI on desktop + mobile (Playwright, APIs mocked)
```

## Moving existing media to R2

`public/assets` holds ~111 MB of images and videos in git. With step 1 done:

```bash
node --env-file=.dev.vars scripts/migrate-assets-to-r2.mjs          # dry run
node --env-file=.dev.vars scripts/migrate-assets-to-r2.mjs --apply  # upload + rewrite posts
```

It never deletes local files. After checking the deployed site, remove the media from git yourself.
