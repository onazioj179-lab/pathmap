/**
 * Browserless operational smoke bot.
 *
 * Exercises the real end-to-end "Find My Friends" loop against a running
 * backend (default http://localhost:8000):
 *   1. register + login two users (A, B)
 *   2. A shares its location with B (exact precision)
 *   3. A pushes a location
 *   4. B reads /sharing/friends and must see A at that location
 *
 * Exit code 0 on success, non-zero on any failure. Run in CI as a fast gate
 * and locally with: `node e2e/scripts/smoke.mjs`.
 */
const API = process.env.PATHMAP_API || 'http://localhost:8000';
const SOC = `${API}/api/v1/social`;
const LAT = 9.082;
const LNG = 7.49;

function die(msg) {
  console.error(`✗ SMOKE FAILED: ${msg}`);
  process.exit(1);
}

async function jpost(path, body, token) {
  const res = await fetch(`${SOC}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function jget(path, token) {
  const res = await fetch(`${SOC}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function registerAndLogin(tag) {
  const username = `bot_${tag}_${Date.now()}_${Math.floor(Math.random() * 1e4)}`;
  const password = 'SmokeBotPass123!';
  const email = `${username}@example.com`;

  const reg = await jpost('/auth/register', { username, email, password });
  if (reg.status !== 200 || reg.json.success !== true) die(`register ${tag} -> ${reg.status} ${JSON.stringify(reg.json)}`);

  const login = await jpost('/auth/login', { identifier: username, password });
  const token = login.json?.data?.access_token;
  if (login.status !== 200 || !token) die(`login ${tag} -> ${login.status} ${JSON.stringify(login.json)}`);

  const me = await jget('/auth/me', token);
  const userId = me.json?.data?.id;
  if (me.status !== 200 || !userId) die(`me ${tag} -> ${me.status} ${JSON.stringify(me.json)}`);

  return { username, token, userId };
}

async function main() {
  // 0. backend health
  const health = await fetch(`${API}/v1/health`).then(r => r.json()).catch(() => null);
  if (!health || health.status !== 'ok') die(`health -> ${JSON.stringify(health)}`);
  console.log('✓ backend healthy');

  // 1. two users
  const A = await registerAndLogin('A');
  const B = await registerAndLogin('B');
  console.log(`✓ registered A=${A.userId.slice(0, 8)} B=${B.userId.slice(0, 8)}`);

  // 2. A shares (exact) with B
  const share = await jpost('/sharing/start', { shared_with_id: B.userId, precision: 'exact' }, A.token);
  if (share.status !== 200) die(`start_sharing -> ${share.status} ${JSON.stringify(share.json)}`);
  console.log('✓ A is sharing with B');

  // 3. A pushes a location
  const upd = await jpost('/sharing/location', { latitude: LAT, longitude: LNG, accuracy: 5 }, A.token);
  if (upd.status !== 200) die(`update_location -> ${upd.status} ${JSON.stringify(upd.json)}`);
  console.log('✓ A pushed a location');

  // 4. B reads friends and must see A
  const friends = await jget('/sharing/friends', B.token);
  const list = friends.json?.data || [];
  const a = list.find(f => f.user_id === A.userId);
  if (!a) die(`B does not see A in /sharing/friends: ${JSON.stringify(list)}`);
  if (Math.abs(a.latitude - LAT) > 1e-4 || Math.abs(a.longitude - LNG) > 1e-4) {
    die(`A location wrong: got (${a.latitude},${a.longitude}) expected (${LAT},${LNG})`);
  }
  console.log(`✓ B sees A at (${a.latitude}, ${a.longitude})`);

  console.log('\n✓ SMOKE PASSED: full register→share→push→read loop works');
}

main().catch(e => die(e?.stack || String(e)));
