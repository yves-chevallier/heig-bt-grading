// Exporte un enregistrement d'évaluation vers le JSON que consomme
// typst/evaluation.typ. Tout le calcul (moyennes, arrondis, mentions) reste ici,
// dans le code déjà couvert par les tests : le modèle Typst ne fait que mettre
// en page des valeurs déjà décidées.
//
//   node --import tsx scripts/typst-data.mjs > typst/exemple.json
import {
  calculate,
  criteria,
  oralCriteria,
  oralGrade,
  formatGrade,
  gradeLabel,
  programCode,
} from '../shared/evaluation.ts';

const SCALE = [
  ['5.8–6.0', 'A', 'Excellent'],
  ['5.3–5.7', 'B', 'Très bien'],
  ['4.8–5.2', 'C', 'Bien'],
  ['4.3–4.7', 'D', 'Satisfaisant'],
  ['4.0–4.2', 'E', 'Passable'],
  ['3.5–3.9', 'FX', 'Échec'],
  ['1.0–3.4', 'F', 'Échec'],
];
// Le libellé de phase n'apparaît que sur le premier critère de chaque phase.
const PHASES = [
  'Évaluation intermédiaire',
  'Évaluation en fin de projet',
  '',
  '',
  'Soutenance orale',
];
const GROUPS = [
  { id: 'expression', title: 'Maîtrise de l’expression orale' },
  { id: 'subject', title: 'Maîtrise du sujet présenté' },
];

const date = (iso) => (iso ? iso.split('-').reverse().join('.') : '—');

function oralSheet(oral, role) {
  const groups = GROUPS.map(({ id, title }) => {
    const rows = oralCriteria
      .map((c, i) => ({ ...c, i }))
      .filter((c) => c.group === id)
      .map((c) => ({
        title: c.title,
        points: oral.points[c.i],
        max: c.max,
        comment: oral.comments[c.i] ?? '',
      }));
    return { title, max: rows.reduce((s, r) => s + r.max, 0), rows };
  });
  const rows = groups.flatMap((g) => g.rows);
  const points = rows.reduce((s, r) => s + (r.points ?? 0), 0);
  return {
    role,
    groups,
    points,
    pointsMax: rows.reduce((s, r) => s + r.max, 0),
    presence: 10,
    presenceMax: 10,
    total: points + 10,
    totalMax: rows.reduce((s, r) => s + r.max, 0) + 10,
    grade: formatGrade(oralGrade(oral)),
  };
}

export function typstData(record) {
  const d = record.data;
  const r = calculate(d);
  const letter = gradeLabel(r.final).split(' · ')[0];
  return {
    meta: {
      student: `${d.firstName} ${d.lastName}`.trim(),
      title: d.title,
      program: programCode(d.program),
      orientation: d.orientation,
      teacher: d.teacher,
      expert: d.expert,
      defense: date(d.defenseDate),
      room: d.room,
      version: record.version,
      locked: record.lockedAt !== null,
      status: record.lockedAt
        ? `Verrouillée le ${date(record.lockedAt.slice(0, 10))}`
        : 'Brouillon · Évaluation non verrouillée',
    },
    criteria: criteria.map((c, i) => ({
      phase: PHASES[i],
      number: i + 1,
      title: c.title,
      description: c.description,
      weight: d.weights[i],
      minimum: c.minimum,
      teacher: formatGrade(r.teacher[i]),
      expert: r.expert[i] === null ? '' : formatGrade(r.expert[i]),
      final: formatGrade(r.means[i]),
    })),
    overall: {
      weight: r.totalWeight,
      final: formatGrade(r.final),
      mention: gradeLabel(r.final),
      beforeRounding: r.weighted === null ? '—' : r.weighted.toFixed(3),
    },
    decisions: [
      { label: 'Félicitations du jury', checked: d.congratulations },
      { label: 'Proposition de prix', checked: d.award },
      { label: 'Travail confidentiel', checked: d.confidential },
      { label: 'Diffusion du travail sur tb.heig-vd.ch', checked: r.publicationAllowed },
    ],
    scale: SCALE.map(([range, code, label]) => ({ range, code, label, active: code === letter })),
    remarks: d.remarks,
    protocol: { grade: formatGrade(r.means[4]), ...d.protocol },
    orals: [oralSheet(d.teacherOral, 'Enseignant·e'), oralSheet(d.expertOral, 'Expert·e')],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { roundingExample } = await import('../tests/fixtures.ts');
  const data = roundingExample();
  data.remarks = 'Remarque du jury : travail solide et bien documenté, défense convaincante.';
  data.congratulations = true;
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
