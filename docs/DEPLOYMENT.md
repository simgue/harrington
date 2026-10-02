# Running Harrington for the whole family

This runbook takes Harrington from "works on the computer it was installed on"
to "the family opens it from a tablet, a phone and a laptop". Follow one
option below from start to finish. Every command is run on the host computer
unless a step says otherwise.

## The one rule: one host, one data folder, everything else is a browser

- **One always-on computer runs `node server.mjs`** (or `npm start`, or the
  Docker container) with **one data directory** (`data/private/`, or
  `HARRINGTON_DATA_DIR`). Pick a computer that stays on: a desktop, a mini PC,
  a home server.
- **Every other device is only a browser** pointed at that host. Tablets and
  phones install nothing.
- **Never run two Harrington servers against the same folder**, and never put
  the data directory in a synced folder (iCloud Drive, Dropbox, OneDrive,
  Syncthing, Google Drive) shared with another server. Two servers each think
  they own the file, and the sync tool will silently keep one copy and drop
  the other's changes.

Several browsers at once are safe: saves are versioned, and a device that saved
second reloads the latest data and says so instead of overwriting it.

## Why HTTPS matters: the microphone

Browsers allow the microphone and the speech service only on a *secure
context*: `https://` pages, or `http://localhost` / `http://127.0.0.1` on the
computer itself. A tablet opening `http://192.168.1.20:4173` is not a secure
context, so **recording and live transcript do not work there**, whatever
Harrington does. Options 1 and 2 give every device an `https://` address.
Option 3 alone does not.

## Settings reference

| Variable | Default | What it does |
| --- | --- | --- |
| `HARRINGTON_HOST` | `127.0.0.1` | Address the server binds to. Must be an IP address or a host name; the server refuses to start otherwise. |
| `HARRINGTON_PORT` | `4173` | Port. |
| `HARRINGTON_PUBLISHED_HOST` | same as `HARRINGTON_HOST` | The address other devices actually use, when a proxy or container sits in front (for example your `.ts.net` name). It decides whether the app says "runs on this computer only" or "shared on your home network". |
| `HARRINGTON_ACCESS_TOKEN` | unset | When set (16 characters or more), every `/api/*` request needs a sign-in cookie. Each device signs in once at `/login?token=...`. |

At startup the server logs the bind address, whether it is loopback, and
whether the access token is on (never the token itself). `GET /api/health`
reports `host` (`"loopback"` or `"network"`) and `authEnabled`, and, when the
token is on, `signedIn` for the device asking.

Make a token with:

```bash
node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))"
```

Keep it like a house key: in a password manager, never in Git, never in a
screenshot.

## Option 1 (recommended): a WireGuard mesh with HTTPS (Tailscale)

A mesh VPN such as [Tailscale](https://tailscale.com) puts the host and the
family's devices on a private network that only they can join, and gives the
host a real HTTPS certificate, so the microphone works on every device. It
also works away from home without opening anything on your router.

### 1. Join every device to the mesh

1. Create a Tailscale account (the free personal plan is enough).
2. Install Tailscale on the **host** and sign in.
3. Install the Tailscale app on **each tablet, phone and laptop** and sign in
   to the same account (or invite family members to your tailnet).
4. In the Tailscale admin console, under **DNS**, turn on **MagicDNS** and
   **HTTPS Certificates**.
5. Find the host's full mesh name on the **Machines** page of the admin
   console. It looks like `family-host.tailnet-name.ts.net`. Below it is
   written `HOSTNAME.ts.net`; use yours.

### 2. Bind Harrington behind the mesh interface

Keep Harrington itself on loopback and let the mesh be its only front door.
`tailscale serve` listens on the host's mesh interface, terminates HTTPS with
the mesh certificate, and forwards to Harrington on the same computer. Nothing
on your home Wi-Fi or the internet can reach port 4173 directly.

```bash
export HARRINGTON_HOST=127.0.0.1
export HARRINGTON_PUBLISHED_HOST=HOSTNAME.ts.net
export HARRINGTON_ACCESS_TOKEN=paste-your-token-here   # recommended, see option 3
npm start
```

The log should say `Published address: HOSTNAME.ts.net` and `Address is not
loopback`: Harrington binds to loopback, but devices reach it through the mesh
name, so the app says it is shared on your home network.

### 3. Turn on HTTPS through the mesh

```bash
tailscale serve --bg 4173
tailscale serve status
```

`serve status` prints `https://HOSTNAME.ts.net` proxying to
`http://127.0.0.1:4173`. The first HTTPS request can take a few seconds while
the certificate is issued. To stop sharing: `tailscale serve reset`.

Do **not** use `tailscale funnel`: Funnel publishes the site on the public
internet.

### 4. Open it on each device

1. On the tablet, phone or laptop, make sure Tailscale is connected.
2. If the token is on, open `https://HOSTNAME.ts.net/login?token=YOUR-TOKEN`
   once. The browser lands on Harrington and stays signed in.
3. Otherwise open `https://HOSTNAME.ts.net`.
4. Add it to the home screen (Share, then Add to Home Screen on iPad and
   iPhone; the browser menu on Android).

To keep it running, start Harrington from a service manager (systemd,
launchd, a Docker restart policy) with the same environment variables.
`tailscale serve --bg` is remembered across reboots.

## Option 2: a local reverse proxy with its own certificate authority (Caddy)

Use this when the family does not want a mesh app on every device. A reverse
proxy on the host serves HTTPS on your home network with a certificate from a
small certificate authority (CA) it creates itself. Each device has to trust
that CA's root certificate once.

### 1. Give the host a name on your network

Pick a name such as `harrington.home.arpa` and point it at the host's LAN
address: add a DNS entry on your router (often under "Local DNS" or "DHCP
reservations"), or use the host's own `.local` name if your devices resolve it.

### 2. Run Harrington on loopback and Caddy in front

```bash
export HARRINGTON_HOST=127.0.0.1
export HARRINGTON_PUBLISHED_HOST=harrington.home.arpa
export HARRINGTON_ACCESS_TOKEN=paste-your-token-here   # recommended
npm start
```

Install [Caddy](https://caddyserver.com) and use this `Caddyfile`:

```
harrington.home.arpa {
	tls internal
	reverse_proxy 127.0.0.1:4173
}
```

Start it with `caddy run` (or the system service). `tls internal` makes Caddy
create its own local CA and issue and renew the site certificate. Caddy sends
`X-Forwarded-Proto: https`, so Harrington marks its sign-in cookie `Secure`.

### 3. Install the root certificate on each device

Caddy writes the root certificate to `pki/authorities/local/root.crt` under
its data directory:

- Linux, Caddy run by your user: `~/.local/share/caddy/pki/authorities/local/root.crt`
- Linux, Caddy system package: `/var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt`
- macOS: `~/Library/Application Support/Caddy/pki/authorities/local/root.crt`
- Windows: `%AppData%\Caddy\pki\authorities\local\root.crt`

Copy **only `root.crt`** (never `root.key`) to each device and trust it:

- **iPad and iPhone:** AirDrop or email the file, open it, then Settings,
  General, VPN & Device Management, install the profile. Then Settings,
  General, About, Certificate Trust Settings, and turn on full trust for it.
- **Android:** Settings, Security (or Security & privacy), Encryption &
  credentials, Install a certificate, CA certificate.
- **macOS:** open the file in Keychain Access, add it to the System keychain,
  open it and set "When using this certificate" to Always Trust.
- **Windows:** double-click, Install Certificate, Local Machine, "Trusted Root
  Certification Authorities".
- **ChromeOS:** `chrome://certificate-manager`, Authorities, Import.
- **Firefox** keeps its own list: Settings, Privacy & Security, Certificates,
  View Certificates, Authorities, Import.

Then open `https://harrington.home.arpa/login?token=YOUR-TOKEN` once on each
device (or `https://harrington.home.arpa` without a token).

## Option 3: the built-in access token

`HARRINGTON_ACCESS_TOKEN` is Harrington's own lock. With it set:

- every `/api/*` request (family data, recordings, lessons, the AI adapter)
  needs a sign-in cookie, and gets `401` with a short page explaining how to
  sign in otherwise; the page itself, scripts and styles stay open;
- `GET /login?token=...` with the right token sets the cookie (HttpOnly,
  SameSite=Strict, `Secure` when the request came over HTTPS or through a
  proxy that says so) and redirects to `/`, dropping the token from the
  address bar; a wrong token gets a `401` page and no cookie;
- the cookie is derived from the token, so changing the token signs every
  device out; sign them in again with the new link.

On its own, with Harrington bound straight to the LAN:

```bash
export HARRINGTON_HOST=0.0.0.0          # or the host's LAN address
export HARRINGTON_ACCESS_TOKEN=paste-your-token-here
npm start
```

and each device opens `http://HOST-LAN-ADDRESS:4173/login?token=YOUR-TOKEN`
once.

**This still needs HTTPS for the microphone.** Over plain `http://` on the LAN,
the tablet can browse, log records and play recordings, but cannot record or
use live transcript, and the sign-in link travels unencrypted on your Wi-Fi.
Use the token **together with** option 1 or 2: the mesh or the proxy provides
HTTPS, the token makes sure only family devices that signed in can read or
change data.

With Docker, the compose file publishes on `127.0.0.1` and sets
`HARRINGTON_PUBLISHED_HOST: 127.0.0.1`. For option 1 or 2 keep that port
mapping, change `HARRINGTON_PUBLISHED_HOST` to the name devices use, and put
the token in a `.env` file next to `compose.yaml` (the repository's
`.gitignore` already excludes `.env`) and reference it from the `environment:`
block as `HARRINGTON_ACCESS_TOKEN: ${HARRINGTON_ACCESS_TOKEN}`.

## Keeping the family's data safe

### Nightly backup

`npm run backup` writes `backups/harrington-<timestamp>.tar.gz` with
everything in the data directory, recordings included. Schedule it on the
host. With cron (Linux and macOS), run `crontab -e` and add:

```
15 2 * * * cd /path/to/harrington && npm run backup >> backups/backup.log 2>&1
```

On Windows, use Task Scheduler to run `npm run backup` daily with the
Harrington folder as the start directory. Copy the `backups/` folder to a
second place (an external drive, another computer) every so often; a backup
on the same disk does not survive that disk. See the README's "Backup and
restore" section for how to restore.

### Export before every upgrade

Before pulling a new version:

1. In the app, press **Export** in the sidebar's family box and keep the
   `harrington-family-<date>.json` file.
2. Run `npm run backup`.
3. Stop Harrington, update (`git pull`, then `npm ci`), and start it again
   with the same environment variables.
4. Open the app on the host and on one other device and check the learners
   are there.

### The child-view PIN

The first time someone presses **Grown-ups** in the child view, Harrington asks
for a 4-digit PIN; after that the PIN is needed to leave the child view. It is
saved with the family data, so it is the same on every device. It keeps a
child on the child screen of a shared tablet; it is not a password. Anyone who
reloads the page is back in the grown-up view, and it does not replace the
access token.

## Verifying recording from a second device

After option 1 or 2, on a tablet or phone that is **not** the host:

1. Connect it to the mesh (option 1) or install the root certificate
   (option 2).
2. Open the `https://` sign-in link, or the `https://` address if the token is
   off. The address bar shows a padlock, not a warning.
3. Open the **Guide** and check that it says Harrington is shared on your home
   network (and, with the token, that the sidebar shows "signed in").
4. On the dashboard press **Record what happened**, allow the microphone when
   the browser asks, speak for ten seconds, and stop.
5. Check the recording plays back on the tablet, then open **Records** on the
   host computer and play the same recording there.
6. On the tablet, open `/api/health` in a new tab (it shows `"host":"network"`
   and, with the token, `"signedIn":true`). In a private window that has not
   signed in, `/api/state` shows the sign-in page instead of data.
