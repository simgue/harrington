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
  phones install no Harrington software (option 1 adds the Tailscale app).
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
| `HARRINGTON_PUBLISHED_HOST` | same as `HARRINGTON_HOST` | The name other devices open, when a proxy or container sits in front (for example your `.ts.net` name). It decides whether the app says "runs on this computer only" or "shared with your other devices", and it is a host name Harrington answers to. |
| `HARRINGTON_ACCESS_TOKEN` | unset | When set (16 characters or more), every `/api/*` request except `/api/health` needs a sign-in cookie. Each device signs in once at `/login`. |
| `HARRINGTON_ALLOWED_HOSTS` | unset | Extra host names Harrington answers to once it is shared, comma-separated (for example a Tailscale short name such as `family-host`). |

At startup the server logs the bind address and whether it is loopback, the
published address when it differs, the host names it answers to, and whether
the access token is on (never the token itself). `GET /api/health` reports
`host` (`"loopback"` or `"network"`) and `authEnabled`, and, when the token is
on, `signedIn` for the device asking.

### Host names Harrington answers to

Once Harrington is shared (the bind address or the published address is not
loopback), it answers only to `localhost`, the published address, the bind
address, the names in `HARRINGTON_ALLOWED_HOSTS`, and any IP address. A request
for any other name gets `421` and one line of text. This stops *DNS
rebinding*, where a web page on someone else's domain re-points that domain at
your Harrington and reads it through the family's browser. If a device you use
gets that `421`, add the name it uses to `HARRINGTON_ALLOWED_HOSTS` and restart.
A server left on loopback with no published address answers to any name, as
before.

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

The log should say `Bind address 127.0.0.1 is loopback` and `Published address
HOSTNAME.ts.net: other devices open Harrington there`, so the app says it is
shared with your other devices. If anyone opens the MagicDNS short name
(`http://family-host`), add it: `export HARRINGTON_ALLOWED_HOSTS=family-host`.
Only the full `.ts.net` name has an HTTPS certificate, so use that one for
recording.

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
2. Open `https://HOSTNAME.ts.net/login`, type the token into the form, and
   press **Sign in**. The browser lands on Harrington and stays signed in. (If
   the token is off, open `https://HOSTNAME.ts.net` instead.)
3. Add it to the home screen (Share, then Add to Home Screen on iPad and
   iPhone; the browser menu on Android).

To keep it running, start Harrington from a service manager (systemd,
launchd, a Docker restart policy) with the same environment variables.
`tailscale serve --bg` is remembered across reboots.

## Option 2: a local reverse proxy with its own certificate authority (Caddy)

Use this when the family does not want a mesh app on every device. A reverse
proxy on the host serves HTTPS on your home network with a certificate from a
small certificate authority (CA) it creates itself. Each device has to trust
that CA's root certificate once. It works only on your home network.

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
create its own local CA and issue and renew the site certificate. Caddy passes
the name the browser used (`harrington.home.arpa`) and sends
`X-Forwarded-Proto: https`, so Harrington answers and marks its sign-in cookie
`Secure`.

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

Then open `https://harrington.home.arpa/login` on each device and sign in
with the token (or open `https://harrington.home.arpa` if the token is off).

## Option 3: the built-in access token

`HARRINGTON_ACCESS_TOKEN` is Harrington's own lock. With it set:

- every `/api/*` request (family data, recordings, lessons, the AI adapter)
  except `/api/health` needs a sign-in cookie, and gets `401` with a short page
  explaining how to sign in otherwise; the page itself, scripts and styles stay
  open; `/api/health` answers a device that has not signed in with only
  `ok`, `mode`, `host`, `authEnabled` and `signedIn: false`;
- **the sign-in page** at `/login` has one password field. The right token
  sets the cookie (HttpOnly, SameSite=Strict, `Secure` when the request came
  over HTTPS or through a proxy that says so) and goes to the app; a wrong
  token gets a `401` page and no cookie. Your password manager can fill it;
- **the sign-in link** `/login?token=YOUR-TOKEN` does the same in one tap,
  which is handy on a phone. It redirects to `/`, so the token leaves the
  address bar, but the link itself stays in the browser's history (see below);
- the cookie is derived from the token, so changing the token signs every
  device out; sign them in again with the new token.

On its own, with Harrington bound straight to the LAN:

```bash
export HARRINGTON_HOST=0.0.0.0          # or the host's LAN address
export HARRINGTON_ACCESS_TOKEN=paste-your-token-here
npm start
```

and each device opens `http://HOST-LAN-ADDRESS:4173/login` once and signs in.
Devices that use a name instead of the IP address (such as
`family-host.local`) need it in `HARRINGTON_ALLOWED_HOSTS` or
`HARRINGTON_PUBLISHED_HOST`.

**This still needs HTTPS for the microphone.** Over plain `http://` on the LAN,
the tablet can browse, log records and play recordings, but cannot record or
use live transcript. Use the token **together with** option 1 or 2: the mesh or
the proxy provides HTTPS, the token makes sure only family devices that signed
in can read or change data.

### What the token does not protect

- **No limit on sign-in attempts.** Nothing slows down someone guessing. A
  random 24-byte token (the command above) is what makes guessing hopeless;
  never use a short or memorable one.
- **The sign-in link is remembered.** `/login?token=...` stays in the
  browser's history and address-bar suggestions, and in synced history on
  every device signed in to the same browser account. Prefer the form; if you
  used the link, delete that history entry.
- **The cookie is a long-lived key.** It lasts 400 days, it is the same on
  every device, and there is no way to sign out just one device: the only way
  to sign out a lost tablet is to change the token, which signs out everyone.
- **Plain HTTP is readable on the Wi-Fi.** Without HTTPS, the token (when you
  sign in) and the cookie (on every request) cross the network unencrypted.
- **`/api/health` is open.** It tells anyone who can reach the server that it
  is Harrington, whether it is shared and whether the token is on; it shows no
  family data.
- **A signed-in device has full access.** Anyone holding one, a child
  included, can read and change everything. The child-view PIN does not stop
  that (see below).

With Docker, the compose file publishes on `127.0.0.1` and sets
`HARRINGTON_PUBLISHED_HOST: 127.0.0.1`. For option 1 or 2 keep that port
mapping, put Tailscale serve or Caddy in front of it as above, and change only
`HARRINGTON_PUBLISHED_HOST` to the name devices open. Put the token in a `.env`
file next to `compose.yaml` (the repository's `.gitignore` already excludes
`.env`) and reference it from the `environment:` block as
`HARRINGTON_ACCESS_TOKEN: ${HARRINGTON_ACCESS_TOKEN}`.

## Keeping the family's data safe

### Nightly backup

`npm run backup` writes `backups/harrington-<timestamp>.tar.gz` with
everything in the data directory, recordings included. Schedule it on the
host. Cron starts with an almost empty `PATH` and no exported variables, so
the entry uses full paths and names the data directory the server uses. Find
the paths with `command -v node` and `pwd` in the Harrington folder, then run
`crontab -e` (Linux and macOS) and add one line (here node is
`/usr/local/bin/node` and Harrington is in `/home/parent/harrington`):

```
15 2 * * * cd /home/parent/harrington && mkdir -p backups && HARRINGTON_DATA_DIR=/home/parent/harrington/data/private /usr/local/bin/node scripts/backup.mjs >> backups/backup.log 2>&1
```

`mkdir -p backups` matters on a fresh clone: the shell opens
`backups/backup.log` before the backup script runs, and fails if the folder is
missing. If the server runs with a different `HARRINGTON_DATA_DIR`, use that
path. Check the next morning that `backups/backup.log` says `Backed up`.

With Docker, the data lives in the `harrington-data` volume, which Compose
names `harrington_harrington-data` when the folder is called `harrington`
(`docker volume ls` shows the exact name). Back it up with a throwaway
container (`%` must be written `\%` inside a crontab):

```
15 2 * * * mkdir -p /home/parent/harrington/backups && /usr/bin/docker run --rm -v harrington_harrington-data:/data:ro -v /home/parent/harrington/backups:/backups alpine tar -czf /backups/harrington-docker-$(date +\%Y-\%m-\%dT\%H-\%M-\%S).tar.gz -C / data >> /home/parent/harrington/backups/backup.log 2>&1
```

To restore it: `docker compose down`, then
`docker run --rm -v harrington_harrington-data:/data -v /home/parent/harrington/backups:/backups alpine sh -c 'rm -rf /data/* && tar -xzf /backups/FILE.tar.gz -C /'`,
then `docker compose up -d`.

`HARRINGTON_BACKUP_DIR` names the backup folder (default `backups/` in the
Harrington folder); with Docker, mount the host folder your backups go to into
the container (for example `/home/parent/harrington/backups:/backups`) and set
`HARRINGTON_BACKUP_DIR=/backups`, so Harrington sees the same archives.

On Windows, use Task Scheduler to run `node scripts\backup.mjs` daily, with
the full path to `node.exe`, the Harrington folder as the start directory,
and `HARRINGTON_DATA_DIR` set if the server uses one. Copy the `backups/`
folder to a second place (an external drive, another computer) every so
often; a backup on the same disk does not survive that disk. See the README's
"Backup and restore" section for how to restore a plain install.

### Export before every upgrade

Before pulling a new version:

1. In the app, press **Export** in the sidebar's family box and keep the
   `harrington-family-<date>.json` file.
2. Run `npm run backup` (or the Docker backup command above).
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
2. Open `https://HOSTNAME/login` and sign in with the token (or open the
   `https://` address if the token is off). The address bar shows a padlock,
   not a warning.
3. Open the **Guide** and check that it says Harrington is shared with your
   other devices. With the token on, the sidebar on a computer or tablet shows
   "signed in".
4. On the dashboard press **Record what happened**, allow the microphone when
   the browser asks, speak for ten seconds, and stop.
5. Check the recording plays back on the tablet, then open **Records** on the
   host computer and play the same recording there.
6. On the tablet, open `/api/health` in a new tab (it shows `"host":"network"`
   and, with the token, `"signedIn":true`). In a private window that has not
   signed in, `/api/state` shows the sign-in page instead of data.
