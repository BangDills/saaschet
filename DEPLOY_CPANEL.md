# Deploy to cPanel (Node.js Selector)

This guide assumes your cPanel has the **"Setup Node.js App"** feature (also called CloudLinux Node.js Selector), which is what we saw in your dashboard.

## Prerequisites

- cPanel with Node.js Selector that supports **Node.js 20+** (your panel listed `20.20.2` — that works).
- A domain or subdomain pointed at the application root (e.g. `app.bangdillz.store`).
- File Manager access (or FTP/SFTP, or Git Version Control if available).

> ⚠️ **Important:** the default version cPanel selects is `10.24.1`. That is **way too old** for Next.js 16. Always change it to **20.20.2 or higher**.

---

## Step 1 — Build the app on your local machine

cPanel's "Setup Node.js App" can run `npm install`, but it usually does **not** have a "Run npm build" button and shared hosting often lacks the RAM to build Next.js. So we build locally and upload the result.

```bash
# on your local machine
git clone https://github.com/cloudmail280/celiuz-ai.git
cd celiuz-ai
npm install
npm run build
```

After the build succeeds you will have a `.next/` folder. Keep it.

---

## Step 2 — Prepare the upload bundle

Upload **everything except**:

| Skip                    | Why                                                |
| ----------------------- | -------------------------------------------------- |
| `node_modules/`         | cPanel will reinstall these for you                |
| `.git/`                 | Not needed at runtime                              |
| `.env*`                 | Upload secrets via cPanel's env-var UI instead     |
| `.vercel/`, `out/`      | Not used on cPanel                                 |

**Do upload**:

- `src/`, `public/`
- `package.json`, `package-lock.json`
- `next.config.ts`, `tsconfig.json`, `next-env.d.ts`
- `postcss.config.mjs`, `eslint.config.mjs`
- `server.js`  ← entry point used by Passenger
- **`.next/`**  ← your pre-built app

The easiest is to zip everything (minus the skip list) and upload one `.zip` to cPanel File Manager, then use **Extract**.

Suggested target directory: `/home/<youruser>/horizon-ai` (NOT inside `public_html`).

---

## Step 3 — Create the Node.js application in cPanel

1. cPanel → **Setup Node.js App** (you already opened this) → **CREATE APPLICATION**.
2. Fill the form:

| Field                       | Value                                            |
| --------------------------- | ------------------------------------------------ |
| **Node.js version**         | `20.20.2` (or higher) — **do not leave 10.24.1** |
| **Application mode**        | `Production`                                     |
| **Application root**        | `horizon-ai` (relative to your home dir)         |
| **Application URL**         | the domain/subdomain you want                    |
| **Application startup file**| `server.js`                                      |

3. Click **Create**.

---

## Step 4 — Install dependencies

Still on the Node.js App page, find your new application and click **"Run NPM Install"**. cPanel will install everything from `package.json` using the Node version you selected.

This might take 1–3 minutes. Wait until it reports success.

---

## Step 5 — Add environment variables

The AI chat feature needs your **DigitalOcean Inference API key**. Use the
**"Environment variables"** section of the Node.js App page (do **not** upload
a `.env` file). Click **+ ADD VARIABLE** and add:

| Name                     | Value                                  |
| ------------------------ | -------------------------------------- |
| `DO_INFERENCE_API_KEY`   | your model access key from DigitalOcean |
| `NODE_ENV`               | `production` (auto-set by cPanel mode)  |

Where to get the key: DigitalOcean Cloud → **Inference** → **Model Access Keys**
→ create one with chat-completion scope.

After adding, click **"Restart"** so the app picks up the new env var.

Other env vars you may add later: `DO_INFERENCE_BASE_URL` (only if DO changes
its endpoint), `NEXT_PUBLIC_SUPABASE_URL`, `STRIPE_SECRET_KEY`, etc.

---

## Step 6 — Start / restart the app

Click **"Restart"** on the Node.js App page. Visit your Application URL — you should see the Horizon AI dashboard.

---

## Updating the app later

Whenever you change code:

1. Run `npm run build` locally.
2. Upload the changed files (especially the new `.next/` folder).
3. Click **"Restart"** in the Node.js App page.

If you change `package.json`, click **"Run NPM Install"** again.

---

## Troubleshooting

**"503 / 502 / Application failed to start"**
- Check the **stderr.log** in the application root.
- Most common cause: Node version too low. Change to 20.20.2+.

**"Cannot find module 'next'"**
- You forgot to click **Run NPM Install** after upload.

**Static assets 404 (CSS/JS broken)**
- Make sure you uploaded the entire `.next/` folder, not just parts of it.

**Page loads but the styles look unstyled**
- Same as above — `.next/static/` is missing or incomplete.

**Memory errors during install**
- Some shared cPanel plans have low RAM. Try installing with `npm install --no-optional --omit=dev`. If that fails, you'll need a higher-tier plan or a VPS.

---

## When to consider moving off cPanel

cPanel is fine for the UI shell. Move to a VPS / Vercel / Railway if you start to need:

- Heavy traffic (cPanel Passenger usually limits worker count).
- Server-Sent Events / streaming responses (e.g. live AI streaming).
- Long-running background jobs.
- WebSockets at scale.

For now, cPanel is enough.
