// Harrington-owned persistence. All requests stay on the same self-hosted origin.

async function request(path, options = {}) {
  const response = await fetch(path, options);
  if (!response.ok) {
    let message = `Harrington request failed (${response.status})`;
    let body = null;
    try {
      body = await response.json();
      if (body?.error) message = body.error;
    } catch {}
    throw Object.assign(new Error(message), { status: response.status, body });
  }
  return response;
}

export async function health() {
  return request('/api/health').then((response) => response.json());
}

function versionFromEtag(response) {
  const match = (response.headers.get('ETag') || '').match(/"v(\d+)"/);
  return match ? Number.parseInt(match[1], 10) : null;
}

// Returns the stored family document, including its integer `version`.
export async function loadState() {
  return request('/api/state').then((response) => response.json());
}

// Saves only if the server still holds `version`. `writeId` is stored on the
// document so this tab can recognise its own write later. Resolves to the new version.
// Rejects with `status: 412` and `body` set to the server's current document
// when another tab or device saved first.
export async function saveState(value, version, writeId) {
  const response = await request('/api/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': `"v${version}"` },
    body: JSON.stringify({ ...value, writeId }),
  });
  return versionFromEtag(response) ?? version + 1;
}

// Unload path: beacons cannot set headers, so the precondition travels in the
// body. Returns false when the browser refused to queue the beacon.
export function beaconState(value, version, writeId) {
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return false;
  const blob = new Blob([JSON.stringify({ ...value, version, writeId })], { type: 'application/json' });
  return navigator.sendBeacon('/api/state', blob);
}

export async function loadLesson(id) {
  const response = await fetch(`/api/lessons/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Could not load lesson (${response.status})`);
  return response.json();
}

// Keys and saved times (ms) of cached entries under one prefix, newest first. No content.
export async function listLessons(prefix) {
  const response = await request(`/api/lessons?prefix=${encodeURIComponent(prefix)}`);
  const body = await response.json();
  return Array.isArray(body?.lessons) ? body.lessons : [];
}

export async function saveLesson(id, value) {
  await request(`/api/lessons/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
}

export async function saveAudio(name, blob) {
  await request(`/api/audio/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': blob.type || 'application/octet-stream' },
    body: blob,
  });
  return name;
}

export async function loadAudio(name) {
  return request(`/api/audio/${encodeURIComponent(name)}`).then((response) => response.blob());
}

export async function deleteAudio(name) {
  await request(`/api/audio/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

// The server always uses its configured HARRINGTON_AI_MODEL.
export async function chat(messages) {
  const response = await request('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  return response.json();
}
