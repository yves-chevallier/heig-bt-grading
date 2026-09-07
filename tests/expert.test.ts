import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { Store } from '../server/store';
import { complete, testConfig } from './fixtures';
import { expertInput, type ExpertEvaluation } from '../shared/expert';
import type { EvaluationRecord, User } from '../shared/evaluation';

const headers = { origin: 'http://localhost:3000', 'x-requested-with': 'evaluation-tb' };
describe('Partage privé avec l’expert', () => {
  let app: Awaited<ReturnType<typeof createApp>>,
    store: Store,
    owner: User,
    record: EvaluationRecord;
  let ownerHeaders: Record<string, string>, expertHeaders: Record<string, string>;
  beforeEach(async () => {
    store = new Store(':memory:');
    owner = store.upsertUser('teacher', 'Teacher', 'teacher@example.test', 'user');
    ownerHeaders = { ...headers, cookie: `session=${store.newSession(owner)}` };
    record = store.create(owner.id, complete());
    app = await createApp(testConfig(), { store });
    const link = await app.inject({
      method: 'POST',
      url: `/api/evaluations/${record.id}/expert-link`,
      headers: ownerHeaders,
    });
    expect(link.statusCode).toBe(200);
    expertHeaders = {
      ...headers,
      authorization: `Bearer ${new URL(link.json().url).hash.slice(1)}`,
    };
  });
  afterEach(async () => {
    await app.close();
  });
  const get = () => app.inject({ url: '/api/expert/evaluation', headers: expertHeaders });
  const save = (view: ExpertEvaluation, data = view.data) =>
    app.inject({
      method: 'PUT',
      url: '/api/expert/evaluation',
      headers: expertHeaders,
      payload: { revision: view.revision, data },
    });
  it('ne transmet que les données autorisées, sans session ni notes du professeur', async () => {
    const response = await get();
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const view = response.json<ExpertEvaluation>();
    expect(Object.keys(view).sort()).toEqual(['data', 'identity', 'lockedAt', 'revision']);
    expect(view.data).toEqual(expertInput(record.data));
    expect(Object.keys(view.identity).sort()).toEqual([
      'defenseDate',
      'expert',
      'firstName',
      'lastName',
      'orientation',
      'program',
      'room',
      'teacher',
      'title',
    ]);
    for (const key of [
      'teacherMarks',
      'teacherOral',
      'protocol',
      'remarks',
      'weights',
      'owner_id',
      'publication',
      'congratulations',
    ])
      expect(response.body).not.toContain(`"${key}"`);
    for (const url of [
      '/api/evaluations',
      `/api/evaluations/${record.id}`,
      `/api/evaluations/${record.id}/pdf`,
    ])
      expect((await app.inject({ url, headers: expertHeaders })).statusCode).toBe(401);
  });
  it('réutilise un lien unique réservé au propriétaire et refuse les clés invalides', async () => {
    const link = await app.inject({
      method: 'POST',
      url: `/api/evaluations/${record.id}/expert-link`,
      headers: ownerHeaders,
    });
    expect(new URL(link.json().url).hash.slice(1)).toBe(expertHeaders.authorization.slice(7));
    expect((await app.inject('/api/expert/evaluation')).statusCode).toBe(404);
    expect(
      (
        await app.inject({
          url: '/api/expert/evaluation',
          headers: { authorization: `Bearer ${'a'.repeat(43)}` },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/evaluations/${record.id}/expert-link`,
          headers,
        })
      ).statusCode,
    ).toBe(401);
    const other = store.upsertUser('other', 'Other', 'other@example.test', 'user');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/evaluations/${record.id}/expert-link`,
          headers: { ...headers, cookie: `session=${store.newSession(other)}` },
        })
      ).statusCode,
    ).toBe(404);
    const another = store.create(other.id, complete());
    expect(store.expertLink(other.id, another.id)).not.toBe(expertHeaders.authorization.slice(7));
  });
  it('fusionne uniquement les notes de l’expert et conserve les modifications du professeur', async () => {
    const view = (await get()).json<ExpertEvaluation>();
    const teacherData = {
      ...record.data,
      remarks: 'Remarque privée récente',
      teacherMarks: [1, 2, 3, 4],
    };
    store.update(owner.id, record.id, record.version, teacherData);
    const data = {
      ...view.data,
      reportMark: 4.2,
      workMark: 4.8,
      expertOral: { ...view.data.expertOral, points: Array(12).fill(3) },
    };
    const response = await save(view, data);
    expect(response.statusCode).toBe(200);
    const saved = store.get(owner.id, record.id)!;
    expect(saved.data).toEqual({
      ...teacherData,
      expertMarks: [null, null, 4.2, 4.8],
      expertOral: data.expertOral,
    });
    expect(response.json().data).toEqual(data);
    expect(saved.version).toBe(3);
    // A teacher tab loaded before the expert's save must not overwrite it or lock stale marks.
    for (const lock of [false, true]) {
      const stale = await app.inject({
        method: lock ? 'POST' : 'PUT',
        url: `/api/evaluations/${record.id}${lock ? '/lock' : ''}`,
        headers: ownerHeaders,
        payload: { version: 2, data: teacherData },
      });
      expect(stale.statusCode).toBe(409);
    }
  });
  it('refuse les champs interdits, valeurs hors barème et écritures provenant d’une autre origine', async () => {
    const view = (await get()).json<ExpertEvaluation>();
    for (const patch of [
      { teacherMarks: [6, 6, 6, 6] },
      { protocol: record.data.protocol },
      { expertMarks: [6, 6, 6, 6] },
      { reportMark: 6.1 },
      { workMark: 0 },
      { workMark: 4.55 },
      { expertOral: { ...view.data.expertOral, points: Array(12).fill(5) } },
    ])
      expect((await save(view, { ...view.data, ...patch })).statusCode).toBe(400);
    const csrf = await app.inject({
      method: 'PUT',
      url: '/api/expert/evaluation',
      headers: { ...expertHeaders, origin: 'https://evil.test' },
      payload: { revision: view.revision, data: view.data },
    });
    expect(csrf.statusCode).toBe(403);
    expect(store.get(owner.id, record.id)!.version).toBe(1);
  });
  it('détecte deux saisies concurrentes des notes expert', async () => {
    const view = (await get()).json<ExpertEvaluation>();
    expect((await save(view, { ...view.data, reportMark: 3.1 })).statusCode).toBe(200);
    expect((await save(view, { ...view.data, reportMark: 2.1 })).statusCode).toBe(409);
    expect(store.get(owner.id, record.id)!.data.expertMarks[2]).toBe(3.1);
  });
  it('laisse consulter uniquement la partie expert et interdit toute saisie après verrouillage', async () => {
    const view = (await get()).json<ExpertEvaluation>();
    const locked = await app.inject({
      method: 'POST',
      url: `/api/evaluations/${record.id}/lock`,
      headers: ownerHeaders,
      payload: { version: record.version, data: record.data },
    });
    expect(locked.statusCode).toBe(200);
    expect((await save(view)).statusCode).toBe(423);
    expect((await get()).json().lockedAt).toBeTruthy();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/evaluations/${record.id}/expert-link`,
          headers: ownerHeaders,
        })
      ).statusCode,
    ).toBe(423);
  });
});
