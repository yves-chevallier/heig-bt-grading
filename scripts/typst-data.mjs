// Exporte les données d'exemple vers typst/exemple.json, pour l'aperçu local du
// modèle (pnpm pdf:data && pnpm pdf:typst). La préparation des données elle-même
// est dans server/pdf-data.ts, celle qu'utilise le serveur.
//
//   node --import tsx scripts/typst-data.mjs > typst/exemple.json
import { typstData } from '../server/pdf-data.ts';
import { roundingExample } from '../tests/fixtures.ts';

if (import.meta.url === `file://${process.argv[1]}`) {
  // L'aperçu montre un résultat insuffisant pour vérifier la mise en
  // évidence des notes sous 4.0 (critères, synthèse, protocole, grilles).
  const data = roundingExample();
  data.teacherMarks = [4.5, 3.5, 3.8, 4.2];
  data.expertMarks = [null, null, 3.6, 4.0];
  data.teacherOral.points = [3, 3, 3, 3, 3, 2, 2, 2, 2, 0, 0, 0]; // 23 + 10 -> 3.3
  data.expertOral.points = [3, 3, 3, 3, 3, 3, 3, 3, 3, 0, 0, 0]; // 27 + 10 -> 3.7
  data.remarks =
    'Rapport incomplet sur la validation expérimentale ; la soutenance n’a pas permis de lever les doutes du jury.';
  data.congratulations = false;
  const record = {
    id: 'apercu',
    data,
    version: 1,
    createdAt: '2026-09-06',
    updatedAt: '2026-09-06',
    lockedAt: null,
  };
  process.stdout.write(JSON.stringify(typstData(record), null, 2) + '\n');
}
