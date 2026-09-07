import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Evaluation, EvaluationRecord, User } from '../shared/evaluation';
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
type Row = {
  id: string;
  data: string;
  version: number;
  created_at: string;
  updated_at: string;
  locked_at: string | null;
};
function record(row: Row): EvaluationRecord {
  return {
    id: row.id,
    data: JSON.parse(row.data),
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lockedAt: row.locked_at,
  };
}
export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, identity TEXT NOT NULL UNIQUE, name TEXT NOT NULL, email TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'user'))
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS oauth (
        token TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS evaluations (
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), data TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, locked_at TEXT
      );
      CREATE INDEX IF NOT EXISTS evaluations_owner ON evaluations(owner_id, updated_at);
      CREATE TABLE IF NOT EXISTS expert_links (
        evaluation_id TEXT PRIMARY KEY REFERENCES evaluations(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE
      );
      CREATE TRIGGER IF NOT EXISTS prevent_locked_update BEFORE UPDATE ON evaluations
        WHEN OLD.locked_at IS NOT NULL BEGIN SELECT RAISE(ABORT, 'Evaluation verrouillée'); END;
      CREATE TRIGGER IF NOT EXISTS prevent_locked_delete BEFORE DELETE ON evaluations
        WHEN OLD.locked_at IS NOT NULL BEGIN SELECT RAISE(ABORT, 'Evaluation verrouillée'); END;
      PRAGMA user_version = 1;
    `);
  }
  upsertUser(identity: string, name: string, email: string, role: User['role']): User {
    this.db
      .prepare(
        `INSERT INTO users(id,identity,name,email,role) VALUES(?,?,?,?,?)
      ON CONFLICT(identity) DO UPDATE SET name=excluded.name,email=excluded.email`,
      )
      .run(randomUUID(), identity, name, email, role);
    return this.db
      .prepare('SELECT id,name,email,role FROM users WHERE identity=?')
      .get(identity) as User;
  }
  newSession(user: User) {
    this.cleanup();
    const token = randomBytes(32).toString('base64url');
    this.db
      .prepare('INSERT INTO sessions VALUES(?,?,?)')
      .run(digest(token), user.id, Date.now() + 12 * 60 * 60 * 1000);
    return token;
  }
  session(token?: string): User | null {
    if (!token) return null;
    return (
      (this.db
        .prepare(
          `SELECT u.id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?`,
        )
        .get(digest(token), Date.now()) as User | undefined) ?? null
    );
  }
  logout(token?: string) {
    if (token) this.db.prepare('DELETE FROM sessions WHERE token=?').run(digest(token));
  }
  cleanup() {
    this.db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
    this.db.prepare('DELETE FROM oauth WHERE expires<=?').run(Date.now());
  }
  stashOAuth(data: unknown) {
    this.cleanup();
    const token = randomBytes(32).toString('base64url');
    this.db
      .prepare('INSERT INTO oauth VALUES(?,?,?)')
      .run(digest(token), JSON.stringify(data), Date.now() + 600_000);
    return token;
  }
  consumeOAuth(token?: string): { codeVerifier: string; state: string; nonce: string } | null {
    if (!token) return null;
    const row = this.db
      .prepare('DELETE FROM oauth WHERE token=? RETURNING data,expires')
      .get(digest(token)) as { data: string; expires: number } | undefined;
    return row && row.expires > Date.now() ? JSON.parse(row.data) : null;
  }
  list(owner: string) {
    return (
      this.db
        .prepare('SELECT * FROM evaluations WHERE owner_id=? ORDER BY updated_at DESC')
        .all(owner) as Row[]
    ).map(record);
  }
  get(owner: string, id: string) {
    const row = this.db
      .prepare('SELECT * FROM evaluations WHERE owner_id=? AND id=?')
      .get(owner, id) as Row | undefined;
    return row ? record(row) : null;
  }
  create(owner: string, data: Evaluation) {
    const id = randomUUID(),
      now = new Date().toISOString();
    this.db
      .prepare('INSERT INTO evaluations(id,owner_id,data,created_at,updated_at) VALUES(?,?,?,?,?)')
      .run(id, owner, JSON.stringify(data), now, now);
    return this.get(owner, id)!;
  }
  expertLink(owner: string, id: string) {
    const evaluation = this.get(owner, id);
    if (!evaluation || evaluation.lockedAt) return null;
    this.db
      .prepare('INSERT OR IGNORE INTO expert_links(evaluation_id,token) VALUES(?,?)')
      .run(id, randomBytes(32).toString('base64url'));
    return (
      this.db.prepare('SELECT token FROM expert_links WHERE evaluation_id=?').get(id) as {
        token: string;
      }
    ).token;
  }
  expertEvaluation(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const row = this.db
      .prepare(
        `SELECT e.* FROM evaluations e JOIN expert_links l
      ON l.evaluation_id=e.id WHERE l.token=?`,
      )
      .get(token) as (Row & { owner_id: string }) | undefined;
    return row ? { owner: row.owner_id, evaluation: record(row) } : null;
  }
  update(owner: string, id: string, version: number, data: Evaluation, lock = false) {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `UPDATE evaluations SET data=?,version=version+1,updated_at=?,locked_at=?
      WHERE owner_id=? AND id=? AND version=? AND locked_at IS NULL`,
      )
      .run(JSON.stringify(data), now, lock ? now : null, owner, id, version);
    return result.changes === 1 ? this.get(owner, id) : null;
  }
}
