// Sauvegarde en ligne de la base SQLite : VACUUM INTO produit un fichier
// cohérent sans arrêter l'application (la base est en WAL, une simple copie du
// fichier ne le serait pas). Lancé quotidiennement depuis l'hôte :
//   docker compose -f compose.prod.yml --env-file .env.prod exec -T web \
//     node scripts/backup.mjs
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const source = process.env.DATABASE_PATH || './data/evaluations.sqlite';
const directory = process.env.BACKUP_DIR || '/app/backups';
const retention = Number(process.env.BACKUP_RETENTION_DAYS || 30);

mkdirSync(directory, { recursive: true });
const target = join(directory, `tb-${new Date().toISOString().slice(0, 10)}.sqlite`);
rmSync(target, { force: true });

const db = new DatabaseSync(source, { readOnly: true });
try {
  // Le chemin est interpolé : VACUUM INTO n'accepte pas de paramètre lié.
  db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
} finally {
  db.close();
}

// Rétention : on garde les N plus récentes.
const dumps = readdirSync(directory)
  .filter((name) => /^tb-\d{4}-\d{2}-\d{2}\.sqlite$/.test(name))
  .sort()
  .reverse();
for (const stale of dumps.slice(retention)) rmSync(join(directory, stale), { force: true });

console.log(`backup: ${target} (${statSync(target).size} octets, ${dumps.length} conservées)`);
