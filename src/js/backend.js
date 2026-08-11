// Harrington-owned persistence. All requests stay on the same self-hosted origin.

async function request(path, options = {}) {
  const response = await fetch(path, options);
  if (!response.ok) {
    let message = `Harrington request failed (${response.status})`;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {}
    throw new Error(message);
  }
  return response;
}

export async function health() {
  return request('/api/health').then((response) => response.json());
}

export async function loadState() {
  return request('/api/state').then((response) => response.json());
}

export async function saveState(value) {
  await request('/api/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
}

export async function loadLesson(id) {
  const response = await fetch(`/api/lessons/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Could not load lesson (${response.status})`);
  return response.json();
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

export async function chat(messages, model = null) {
  const response = await request('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, model }),
  });
  return response.json();
}
