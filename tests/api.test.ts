import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { Store } from '../server/store';
import { complete, draft, password, testConfig } from './fixtures';
import type { EvaluationRecord } from '../shared/evaluation';
const headers = { origin: 'http://localhost:3000', 'x-requested-with': 'evaluation-tb' };
describe('API et protection des dossiers', () => {
  let app: Awaited<ReturnType<typeof createApp>>, store: Store, cookie: string;
  beforeEach(async () => {
    store = new Store(':memory:');
    app = await createApp(testConfig(), { store });
    const login = await app.inject({
      method: 'POST',
      url: '/auth/local',
      headers,
      payload: { email: 'admin@example.test', password },
    });
    expect(login.statusCode).toBe(200);
    cookie = login.cookies[0].value;
  });
  afterEach(async () => {
    await app.close();
  });
  const authHeaders = () => ({ ...headers, cookie: `session=${cookie}` });
  async function create(data = draft()) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/evaluations',
      headers: authHeaders(),
      payload: data,
    });
    expect(response.statusCode).toBe(201);
    return response.json<EvaluationRecord>();
  }
  it('refuse les accès anonymes et les requêtes sans protection CSRF', async () => {
    expect((await app.inject('/api/evaluations')).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/local',
          payload: { email: 'admin@example.test', password },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/local',
          headers: { ...headers, origin: 'https://evil.test' },
          payload: { email: 'admin@example.test', password },
        })
      ).statusCode,
    ).toBe(403);
  });
  it('isole chaque utilisateur, y compris les PDF et les écritures', async () => {
    const item = await create();
    const other = store.upsertUser('oidc:other', 'Autre personne', 'other@example.test', 'user');
    const otherHeaders = { ...headers, cookie: `session=${store.newSession(other)}` };
    expect(
      (await app.inject({ url: '/api/evaluations', headers: otherHeaders })).json().evaluations,
    ).toEqual([]);
    for (const url of [`/api/evaluations/${item.id}`, `/api/evaluations/${item.id}/pdf`])
      expect((await app.inject({ url, headers: otherHeaders })).statusCode).toBe(404);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/evaluations/${item.id}`,
          headers: otherHeaders,
          payload: { data: complete(), version: 1 },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/evaluations/${item.id}/lock`,
          headers: otherHeaders,
          payload: { data: complete(), version: 1 },
        })
      ).statusCode,
    ).toBe(404);
  });
  it.each(['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000'])(
    'accepte la connexion locale depuis %s',
    async (origin) => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/local',
        headers: { ...headers, origin },
        payload: { email: 'admin@example.test', password },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().user.role).toBe('admin');
    },
  );
  it.each([
    'http://127.0.0.1:3001',
    'https://localhost:3000',
    'http://localhost.evil.test:3000',
    'null',
  ])('refuse l’origine non autorisée %s', async (origin) => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { ...headers, origin },
    });
    expect(response.statusCode).toBe(403);
  });
  it('conserve l’origine exacte en production, même pour une URL locale', async () => {
    const production = await createApp({
      ...testConfig(),
      NODE_ENV: 'production',
      PUBLIC_URL: 'https://localhost:3000',
    });
    try {
      for (const [origin, status] of [
        ['https://localhost:3000', 200],
        ['https://127.0.0.1:3000', 403],
      ] as const) {
        const response = await production.inject({
          method: 'POST',
          url: '/auth/logout',
          headers: { ...headers, origin },
        });
        expect(response.statusCode).toBe(status);
      }
    } finally {
      await production.close();
    }
  });
  it('détecte les modifications concurrentes et refuse les valeurs invalides', async () => {
    const item = await create();
    const update = () =>
      app.inject({
        method: 'PUT',
        url: `/api/evaluations/${item.id}`,
        headers: authHeaders(),
        payload: { data: complete(), version: 1 },
      });
    expect((await update()).statusCode).toBe(200);
    expect((await update()).statusCode).toBe(409);
    const invalid = complete();
    invalid.weights[0] = 50;
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/evaluations/${item.id}`,
          headers: authHeaders(),
          payload: { data: invalid, version: 2 },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('conserve les anciennes saisies lors de l’édition d’un dossier existant', async () => {
    const data = complete();
    data.expertMarks[0] = 2;
    data.expertMarks[1] = 3;
    data.teacherOral.expressionComment = 'Commentaire historique enseignant.';
    data.expertOral.subjectComment = 'Commentaire historique expert.';
    const item = await create(data);
    const updatedData = { ...data, remarks: 'Nouvelle remarque du jury.' };
    const response = await app.inject({
      method: 'PUT',
      url: `/api/evaluations/${item.id}`,
      headers: authHeaders(),
      payload: { version: item.version, data: updatedData },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({ ...updatedData, program: 'GE' });
    expect(store.get(store.session(cookie)!.id, item.id)?.data).toEqual({
      ...updatedData,
      program: 'GE',
    });
  });
  it('verrouille atomiquement et interdit toute modification même à l’admin', async () => {
    const item = await create();
    const lock = (data = complete()) =>
      app.inject({
        method: 'POST',
        url: `/api/evaluations/${item.id}/lock`,
        headers: authHeaders(),
        payload: { data, version: 1 },
      });
    expect((await lock(draft())).statusCode).toBe(400);
    const response = await lock();
    expect(response.statusCode).toBe(200);
    expect(response.json().lockedAt).toBeTruthy();
    expect((await lock()).statusCode).toBe(423);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/evaluations/${item.id}`,
          headers: authHeaders(),
          payload: { data: complete(), version: 2 },
        })
      ).statusCode,
    ).toBe(423);
    expect(() =>
      store.db.prepare('UPDATE evaluations SET locked_at=NULL WHERE id=?').run(item.id),
    ).toThrow();
  });
  it('produit de vrais PDF complet et étudiant, sans cache', async () => {
    const item = await create(complete());
    for (const suffix of ['', '?view=student']) {
      const response = await app.inject({
        url: `/api/evaluations/${item.id}/pdf${suffix}`,
        headers: authHeaders(),
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
      // Footer rendering must not accidentally append a blank page per document page.
      const pages = response.rawPayload.toString('latin1').match(/\/Type \/Page\b/g)?.length ?? 0;
      expect(pages).toBe(suffix ? 1 : 5);
    }
  });
  it('révoque la session après déconnexion', async () => {
    await app.inject({ method: 'POST', url: '/auth/logout', headers: authHeaders() });
    expect((await app.inject({ url: '/api/evaluations', headers: authHeaders() })).statusCode).toBe(
      401,
    );
  });
  it('ne consomme un état OpenID qu’une seule fois', () => {
    const state = { state: 's', nonce: 'n', codeVerifier: 'v' },
      token = store.stashOAuth(state);
    expect(store.consumeOAuth(token)).toEqual(state);
    expect(store.consumeOAuth(token)).toBeNull();
  });
  it('refuse un callback sans état de connexion et ne crée aucune session', async () => {
    const result = await app.inject('/auth/callback?code=forged&state=forged');
    expect(result.statusCode).toBe(302);
    expect(result.headers.location).toBe('/?authError=expired');
    expect(result.cookies.some((c) => c.name === 'session')).toBe(false);
  });
});
