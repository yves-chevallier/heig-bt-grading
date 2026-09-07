import { expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { passwordHash } from '../fixtures';

test('le serveur s’arrête même lorsque le navigateur garde la connexion Vite ouverte', async ({
  page,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'tb-shutdown-'));
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: '3110',
      PUBLIC_URL: 'http://127.0.0.1:3110',
      DATABASE_PATH: join(directory, 'test.sqlite'),
      ADMIN_EMAIL: 'admin@example.test',
      ADMIN_PASSWORD_HASH: passwordHash,
      OIDC_ISSUER: '',
    },
    stdio: 'pipe',
  });
  child.stdout.resume();
  child.stderr.resume();
  const exited = once(child, 'exit');
  try {
    await expect
      .poll(async () => {
        try {
          return (await fetch('http://127.0.0.1:3110/healthz')).ok;
        } catch {
          return false;
        }
      })
      .toBe(true);
    const connected = page
      .waitForEvent('websocket')
      .then((socket) => socket.waitForEvent('framereceived'));
    await page.goto('http://127.0.0.1:3110/');
    await connected;
    await expect(page.getByRole('heading', { name: 'Bienvenue' })).toBeVisible();
    child.kill('SIGTERM');
    await expect.poll(() => child.exitCode, { timeout: 5000 }).toBe(0);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exited;
    await rm(directory, { recursive: true, force: true });
  }
});
