# Deploy Rectangle web shell on Railway

**Status:** Ready to connect (validated locally with production-like install/prune/serve).  
**App path:** `apps/web`  
**Repo:** https://github.com/Ahmed-Sleem/rectangle

---

## Why this setup

| Requirement | Our solution |
|-------------|--------------|
| Serve Vite static `dist/` | `serve` package (production **dependency**) |
| React Router deep links (`/projects`) | `serve -s` (SPA rewrite to `index.html`) |
| Railway `PORT` | `serve -s dist -l tcp://0.0.0.0:$PORT` via `npm start` |
| Build needs Vite + `tsc` | `npm ci --include=dev` in build (devDeps present for build only) |
| Runtime without Vite | After build, only `serve` + `dist` needed |

**Do not** use `vite preview` or `vite` as the production start command on Railway (dev server, port mismatches, higher cost).

---

## Recommended path (Root Directory = `apps/web`)

### Click path

1. Open [https://railway.app](https://railway.app) → login with GitHub.  
2. **New Project** → **Deploy from GitHub repo**.  
3. Select **`Ahmed-Sleem/rectangle`** (grant access if needed).  
4. After the service appears, open **Settings**:  
   - **Root Directory:** `apps/web`  
   - **Watch Paths (optional):** `apps/web/**`  
5. Open **Settings → Build**:  
   - Build Command: `npm ci --include=dev && npm run build`  
     *(or leave empty if `apps/web/railway.toml` is picked up)*  
6. Open **Settings → Deploy**:  
   - Start Command: `npm run start`  
7. **Networking → Generate Domain** (public HTTPS URL).  
8. Confirm **Wait for CI** is off unless you add GitHub Actions later.  
9. Enable automatic deploys from branch **`main`**.  
10. Open **Deployments** → wait for success → open the public URL.

### Config file used

[`apps/web/railway.toml`](../apps/web/railway.toml)

### Env vars

| Name | Required | Notes |
|------|----------|--------|
| `PORT` | Auto | Railway injects; do not hardcode |
| *(none else)* | — | P0 shell needs no secrets |

Add nothing unless you introduce `VITE_*` build-time vars later (those must exist **at build time** and force rebuild when changed).

---

## Alternate path (monorepo root)

If Root Directory is left empty / `.`:

- Uses root [`railway.toml`](../railway.toml)  
- Build: `npm ci --prefix apps/web --include=dev && npm run build --prefix apps/web`  
- Start: `npm run start --prefix apps/web`  

Still prefer **Root Directory = `apps/web`** for simpler logs and caching.

---

## Local production parity (what we already validated)

```bash
cd apps/web
npm ci --include=dev
npm run build
npm prune --omit=dev          # optional: simulate slim runtime
PORT=3456 npm run start
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3456/
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3456/projects
# both must be 200
```

---

## Expected first-deploy log signals

**Good**

```text
npm ci ...
vite build ...
✓ built in ...
Accepting connections at http://0.0.0.0:XXXX
```

**Bad → fix**

| Symptom | Cause | Fix |
|---------|--------|-----|
| `No start command could be found` | Root Directory wrong or no `start` script | Root = `apps/web`, start = `npm run start` |
| `502 Bad Gateway` | App not listening on `$PORT` / not `0.0.0.0` | Keep our `start` script; don’t use bare `vite preview` |
| `tsc: not found` / `vite: not found` during build | devDeps omitted before build | Build must use `npm ci --include=dev` |
| `Cannot find module 'serve'` at runtime | `serve` only in devDependencies | Keep `serve` under **dependencies** (already) |
| `/projects` → 404 on refresh | Missing SPA fallback | Must use `serve -s` (already in `start`) |
| Blank page | Wrong base path or failed JS load | `base: '/'` in vite; check browser network tab |

---

## Post-deploy smoke checklist (you)

Open the Railway URL and verify:

- [ ] Page loads (black chrome + white panel)  
- [ ] Logo shows `rectangle`  
- [ ] Collapse control works (edge circle)  
- [ ] Click **Projects** → URL `/projects`, empty state text  
- [ ] Hard refresh on `/projects` still 200 (not Railway 404)  
- [ ] **Settings** / **Team** routes work  
- [ ] New push to `main` triggers a new deployment  

---

## Rollback

Railway UI → Deployments → previous successful deploy → **Redeploy**.  
Or `git revert` the bad commit on `main`.

---

## Out of scope for first deploy

- Custom domain (optional later: Settings → Domains)  
- Postgres / Redis  
- Auth secrets  
- Multiple services  

---

*Validated in workspace: full `npm ci`, build, prune production deps, `PORT=` start, `/` + `/projects` + `/settings` → HTTP 200.*
