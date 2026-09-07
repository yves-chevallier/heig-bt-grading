import { expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store';
import { complete } from './fixtures';
it('conserve les dossiers, verrous et sessions après redémarrage du serveur', () => {
  const directory = mkdtempSync(join(tmpdir(), 'evaluation-tb-'));
  let store: Store | undefined;
  try {
    const path = join(directory, 'app.sqlite');
    store = new Store(path);
    const user = store.upsertUser('test:identity', 'Alex Martin', 'alex@example.test', 'user');
    const session = store.newSession(user),
      created = store.create(user.id, complete());
    const locked = store.update(user.id, created.id, 1, created.data, true);
    store.db.close();
    store = new Store(path);
    expect(store.session(session)).toEqual(user);
    expect(store.get(user.id, created.id)).toEqual(locked);
    expect(store.list(user.id)).toHaveLength(1);
    expect(store.update(user.id, created.id, 2, created.data)).toBeNull();
    store.db.prepare('UPDATE sessions SET expires=0').run();
    expect(store.session(session)).toBeNull();
  } finally {
    store?.db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
