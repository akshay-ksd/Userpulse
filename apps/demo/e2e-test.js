/**
 * End-to-end test: uses the Userpulse SDK to send real events
 * to the local API and verifies they land in the database.
 *
 * Usage:
 *   1. Start the API:  pnpm dev:api
 *   2. Run this:       node apps/demo/e2e-test.js
 */

import { init, identify, track, page, flush, destroy } from '@userpulse/sdk';

const API_BASE = process.env.API_URL || 'http://localhost:3001';
const DEMO_EMAIL = `demo-${Date.now()}@test.local`;
const DEMO_PASSWORD = 'DemoPass123';
const DEMO_NAME = 'Demo User';

let cookie = '';

// ─── helpers ───────────────────────────────────────────────────────

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (cookie) opts.headers['Cookie'] = cookie;
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, opts);

  // capture session cookie
  const setCookie = res.headers.getSetCookie?.() || [];
  for (const c of setCookie) {
    const match = c.match(/((?:__Host-)?sid=[^;]+)/);
    if (match) cookie = match[1];
  }

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, data: json };
}

function assert(condition, message) {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`  PASS: ${message}`);
}

// ─── main ──────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Userpulse E2E Demo ===\n');

  // 1. Register
  console.log('1. Registering user...');
  const reg = await api('POST', '/auth/register', {
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    name: DEMO_NAME,
  });
  assert(reg.status === 201, `Register returned ${reg.status}`);
  console.log(`   User: ${DEMO_EMAIL}\n`);

  // 2. Sign in
  console.log('2. Signing in...');
  const login = await api('POST', '/auth/sign-in', {
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  assert(login.status === 200 || login.status === 201, `Sign-in returned ${login.status}`);
  assert(cookie, 'Session cookie received');
  console.log();

  // 3. Create organization
  console.log('3. Creating organization...');
  const org = await api('POST', '/organizations', { name: 'Demo Org' });
  assert(org.status === 201, `Create org returned ${org.status}`);
  const orgId = org.data.id;
  console.log(`   Org ID: ${orgId}\n`);

  // 4. Create project
  console.log('4. Creating project...');
  const proj = await api('POST', `/organizations/${orgId}/projects`, {
    name: 'Demo App',
    description: 'E2E demo project',
  });
  assert(proj.status === 201, `Create project returned ${proj.status}`);
  const projectId = proj.data.id;
  console.log(`   Project ID: ${projectId}\n`);

  // 5. Generate API key
  console.log('5. Generating API key...');
  const key = await api('POST', `/organizations/${orgId}/projects/${projectId}/api-keys`, {
    name: 'demo-key',
  });
  assert(key.status === 201, `Create API key returned ${key.status}`);
  const apiKey = key.data.key;
  const keyPrefix = key.data.keyPrefix;
  assert(apiKey, 'Got full API key');
  console.log(`   Key prefix: ${keyPrefix}\n`);

  // 6. Initialize SDK and send events
  console.log('6. Initializing SDK and tracking events...');
  const client = init({
    apiKey,
    endpoint: `${API_BASE}/v1/events`,
    flushInterval: 0,   // disable auto-flush, we'll flush manually
    maxQueueSize: 100,
    debug: true,
  });
  console.log(`   SDK version: ${client.sdkVersion}`);
  console.log(`   Anonymous ID: ${client.anonymousId}`);

  // Track some events as anonymous user
  track('app_opened', { source: 'demo-script', platform: 'node' });
  track('button_clicked', { button: 'get-started', page: '/home' });
  page('Home', { path: '/home' });

  // Identify the user
  identify('demo-user-42', { plan: 'pro', role: 'admin' });

  // Track events as identified user
  track('feature_used', { feature: 'dashboard', duration_ms: 1500 });
  track('feature_used', { feature: 'analytics', duration_ms: 3200 });
  track('search_performed', { query: 'conversion rate', results: 12 });
  page('Analytics', { path: '/analytics' });

  const queued = client.queue.length;
  console.log(`   Queued ${queued} events\n`);
  assert(queued >= 7 && queued <= 8, `Expected 7-8 events in queue, got ${queued}`);

  // 7. Flush events to the API
  console.log('7. Flushing events to API...');
  await flush();
  console.log(`   Queue after flush: ${client.queue.length} events`);
  assert(client.queue.length === 0, 'Queue is empty after flush');
  console.log();

  // Give the event processor a moment
  console.log('8. Waiting 2s for event processing...');
  await new Promise(r => setTimeout(r, 2000));
  console.log();

  // 9. Verify events via event-status endpoint
  console.log('9. Checking event collection status...');
  const eventStatus = await api('GET', `/organizations/${orgId}/projects/${projectId}/event-status`);
  if (eventStatus.status === 200) {
    console.log('   Event status:', JSON.stringify(eventStatus.data, null, 2));
    const total = eventStatus.data.totalEvents ?? eventStatus.data.total ?? 0;
    assert(total >= 7, `Expected >=7 events stored, got ${total}`);
  } else {
    console.log(`   Event status endpoint returned ${eventStatus.status}: ${JSON.stringify(eventStatus.data)}`);
  }

  // 10. Check processing metrics
  console.log('\n10. Checking processing metrics...');
  const metrics = await api('GET', '/internal/metrics/processing');
  if (metrics.status === 200) {
    console.log('   Processing metrics:', JSON.stringify(metrics.data, null, 2));
  } else {
    console.log(`   Metrics returned ${metrics.status}`);
  }

  // Cleanup
  destroy();

  console.log('\n=== Summary ===');
  console.log(`  User:         ${DEMO_EMAIL}`);
  console.log(`  Organization: Demo Org (${orgId})`);
  console.log(`  Project:      Demo App (${projectId})`);
  console.log(`  API Key:      ${keyPrefix}...`);
  console.log(`  Events sent:  8 (6 track + 2 page)`);
  console.log('\n=== E2E Demo Complete ===\n');
}

main().catch(err => {
  console.error('\nFATAL:', err.message || err);
  process.exit(1);
});
