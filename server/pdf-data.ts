// Prépare les données que met en page typst/evaluation.typ. Tout le calcul
// (moyennes, arrondis, mentions, totaux oraux) reste dans shared/evaluation.ts,
// couvert par les tests : le modèle Typst ne fait qu'afficher des valeurs déjà
// décidées, et les règles de notation n'existent qu'à un seul endroit.
import {
  calculate,
  criteria,
  oralCriteria,
  oralGrade,
  formatGrade,
  gradeLabel,
  programCode,
  type EvaluationRecord,
  type Oral,
} from '../shared/evaluation';

const SCALE: [string, string, string][] = [
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

const date = (iso: string | null | undefined) => (iso ? iso.split('-').reverse().join('.') : '—');

function oralSheet(oral: Oral, role: string) {
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
  const pointsMax = rows.reduce((s, r) => s + r.max, 0);
  return {
    role,
    groups,
    points,
    pointsMax,
    presence: 10,
    presenceMax: 10,
    total: points + 10,
    totalMax: pointsMax + 10,
    grade: formatGrade(oralGrade(oral)),
  };
}

export function typstData(record: EvaluationRecord) {
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
export type TypstData = ReturnType<typeof typstData>;
