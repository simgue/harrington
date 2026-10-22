// Where this Harrington server runs, as /api/health reports it (HAR-25).
// Copy built from here describes only what is true for this server: a
// loopback bind is "this computer only"; any other bind is shared with the
// family's other devices, with or without the access token. Shared copy never
// says "home": a mesh such as Tailscale also reaches devices away from home.

let info = { host: 'loopback', authEnabled: false, signedIn: false };

export function setHosting(health) {
  info = {
    host: health?.host === 'network' ? 'network' : 'loopback',
    authEnabled: health?.authEnabled === true,
    signedIn: health?.signedIn === true,
  };
}

export function isShared() { return info.host === 'network'; }
export function authEnabled() { return info.authEnabled; }

// A device that has not signed in cannot load family data; say how to fix it.
export const SIGN_IN_MESSAGE = 'This device is not signed in to Harrington yet. Open /login on this address and enter the family access token from the computer that runs Harrington, then try again.';

// One sentence for "where does this run".
export function whereItRuns() {
  return isShared()
    ? 'It runs on one host computer and is shared with your other devices, which open it in a browser.'
    : 'It runs on this computer only.';
}

// "on this computer" or "on the host computer", for where files are kept.
export function storedOn() {
  return isShared() ? 'on the computer that runs Harrington' : 'on this computer';
}

function signInState() {
  if (!info.authEnabled) return isShared() ? 'No access token is set, so anyone who can reach it can open it.' : '';
  return info.signedIn ? 'This device is signed in with the family access token.' : 'This device is not signed in.';
}

// The onboarding banner.
export function bannerText() {
  if (!isShared()) return 'Runs on this computer only. Nothing leaves your home unless you configure an AI provider.';
  return `Shared with your other devices. ${signInState()} Family data stays on the computer that runs Harrington unless you configure an AI provider.`;
}

// The short line under "Private family space" in the sidebar.
export function sidebarLine() {
  if (!isShared()) return 'Saved by Harrington';
  if (!info.authEnabled) return 'Shared with your devices';
  return info.signedIn ? 'Shared with your devices · signed in' : 'Shared with your devices';
}
