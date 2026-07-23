# OmERP Screenshot Agent (Electron)

Headless Electron process that periodically captures the primary display,
skips capture when a blacklisted app is focused, and uploads the JPEG to the
backend with a disk-persisted retry queue.

## Run

```bash
npm i -D electron
# optional (Phase 2): real active-window detection
npm i active-win

OMERP_UPLOAD_URL=http://localhost:8080/api/public/agent/screenshots \
OMERP_BLACKLIST_URL=http://localhost:8080/api/public/agent/blacklist \
OMERP_EMPLOYEE_ID=emp-123 \
OMERP_INTERVAL_MIN=7 OMERP_JITTER_MIN=1 \
npx electron electron/main.cjs
```

If `active-win` isn't installed the agent logs `[STUB] Google Chrome` as the
active app and flags every payload with `active_app_stubbed: true`.

## Config (env)

- OMERP_UPLOAD_URL       upload endpoint
- OMERP_BLACKLIST_URL    remote blacklist (falls back to electron/blacklist.json)
- OMERP_EMPLOYEE_ID      tag attached to every payload
- OMERP_INTERVAL_MIN     base interval, minutes (default 7)
- OMERP_JITTER_MIN       plus/minus jitter, minutes (default 1)
- OMERP_JPEG_QUALITY     starting JPEG quality (default 70)
- OMERP_MAX_BYTES        cap; agent ratchets quality down until under this

## Retry queue

On upload failure the payload is written to
`<userData>/omerp-screenshot-queue/*.json` and re-tried every tick. Nothing
is dropped silently and the process never exits on a failed upload.

## Preview it in the browser

The same loop runs at /screenshots-agent in the app — same blacklist
endpoint, same upload endpoint, same payload shape — so you can eyeball
behavior without packaging Electron.
