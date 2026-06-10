import { APIRequestContext, expect } from '@playwright/test';

export const API = 'http://localhost:8000';
export const SOC = `${API}/api/v1/social`;
export const TEST_LAT = 9.082;
export const TEST_LNG = 7.49;

export interface BotUser {
  username: string;
  token: string;
  userId: string;
}

/** Register a fresh user, log in, and return their id + access token. */
export async function registerAndLogin(request: APIRequestContext, tag: string): Promise<BotUser> {
  // Backend caps usernames at 30 chars; base36 keeps the unique suffix short.
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')}`;
  const username = `bot_${tag}_${suffix}`;
  expect(username.length, `username "${username}" must fit the 30-char limit`).toBeLessThanOrEqual(30);
  const password = 'BotPass123!';
  const email = `${username}@example.com`;

  const reg = await request.post(`${SOC}/auth/register`, { data: { username, email, password } });
  expect(reg.status(), 'register').toBe(200);

  const login = await request.post(`${SOC}/auth/login`, { data: { identifier: username, password } });
  expect(login.status(), 'login').toBe(200);
  const token = (await login.json())?.data?.access_token as string;
  expect(token, 'access_token').toBeTruthy();

  const me = await request.get(`${SOC}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  expect(me.status(), 'me').toBe(200);
  const userId = (await me.json())?.data?.id as string;
  expect(userId, 'user id').toBeTruthy();

  return { username, token, userId };
}
