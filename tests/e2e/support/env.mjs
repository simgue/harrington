// Ports and fixed values shared by the Playwright config, the launchers and the specs.
// Override the base with E2E_PORT_BASE when the defaults are taken.

const base = Number.parseInt(process.env.E2E_PORT_BASE || '4310', 10);

export const PORTS = {
  mockAi: base + 1,
  appAi: base + 2,
  appNoAi: base + 3,
};

export const URLS = {
  mockAi: `http://127.0.0.1:${PORTS.mockAi}`,
  appAi: `http://127.0.0.1:${PORTS.appAi}`,
  appNoAi: `http://127.0.0.1:${PORTS.appNoAi}`,
};

// Every browser test runs with the clock pinned to this moment (UTC), so
// greetings, dates, the weekday plan and screenshots are the same on every run.
// Wednesday 7 October 2026, mid-morning.
export const FIXED_NOW = new Date('2026-10-07T10:30:00Z');
export const FIXED_YEAR = FIXED_NOW.getUTCFullYear();
export const TODAY_KEY = '2026-10-07';
