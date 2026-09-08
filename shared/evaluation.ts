import { z } from 'zod';
import rubric from './rubric.json' with { type: 'json' };
export const { criteria, oralCriteria, programs, orientations } = rubric;
// Affiche les enregistrements historiques sous le code de filière courant sans
// réécrire la base. Chaque paire désigne la même filière, renommée depuis :
// ELCI -> GE, et les codes hérités du classeur Excel vers ceux du référentiel
// officiel (l'intitulé de la filière est identique de part et d'autre).
const renamedPrograms: Record<string, string> = {
  ELCI: 'GE',
  ENTE: 'ETE',
  MTEC: 'MT',
  SYND: 'SI',
};
export const programCode = (value: string) => renamedPrograms[value.trim().toUpperCase()] ?? value;
export const hasExpertGrade = (criterionIndex: number) => criterionIndex >= 2;
const requiredMarks = criteria.length + criteria.filter((_, i) => hasExpertGrade(i)).length;
export const protocolFields = [
  {
    key: 'proceedings',
    title: 'Remarques sur le déroulement de la soutenance',
    hint: 'Incidents, conditions particulières ou observations utiles (facultatif).',
  },
  {
    key: 'presentation',
    title: 'Appréciation de la présentation orale',
    hint: 'Points positifs et négatifs de la présentation de l’étudiant·e.',
  },
  {
    key: 'questions',
    title: 'Questions du jury et qualification des réponses',
    hint: 'Questions posées, principaux éléments de réponse, défauts et manquements éventuels.',
  },
  {
    key: 'overall',
    title: 'Évaluation globale de la soutenance',
    hint: 'Synthèse du jury et justification de la note de soutenance.',
  },
] as const;
const shortText = z.string().trim().max(300);
const longText = z.string().max(12000);
const tenth = (n: number) => Math.abs(n * 10 - Math.round(n * 10)) < 1e-8;
const mark = z.number().min(1).max(6).refine(tenth, 'La note doit être au dixième.').nullable();
const oralSchema = z
  .object({
    points: z.array(z.number().min(0).max(5).refine(tenth).nullable()).length(12),
    comments: z.array(longText).length(12),
    // Retain historical comments in saved records; these fields are no longer edited or exported.
    expressionComment: longText,
    subjectComment: longText,
  })
  .strict()
  .superRefine((value, ctx) => {
    value.points.forEach((point, i) => {
      if (point !== null && point > oralCriteria[i].max)
        ctx.addIssue({
          code: 'custom',
          path: ['points', i],
          message: `Maximum ${oralCriteria[i].max} points.`,
        });
    });
  });
export const evaluationSchema = z
  .object({
    firstName: shortText.min(1, 'Le prénom est obligatoire.'),
    lastName: shortText.min(1, 'Le nom est obligatoire.'),
    program: shortText.min(1, 'La filière est obligatoire.').transform(programCode),
    orientation: shortText,
    title: shortText.min(1, 'Le titre du TB est obligatoire.'),
    teacher: shortText.min(1, 'L’enseignant·e est obligatoire.'),
    expert: shortText.min(1, 'L’expert·e est obligatoire.'),
    defenseDate: z.iso.date(),
    room: shortText,
    weights: z.array(z.number().int().min(0).max(100)).length(5),
    teacherMarks: z.array(mark).length(4),
    // Keep the original array layout for existing records; indices 0 and 1 are ignored.
    expertMarks: z.array(mark).length(4),
    teacherOral: oralSchema,
    expertOral: oralSchema,
    protocol: z
      .object({
        proceedings: longText,
        presentation: longText,
        questions: longText,
        overall: longText,
      })
      .strict(),
    remarks: longText,
    congratulations: z.boolean(),
    award: z.boolean(),
    confidential: z.boolean(),
    publication: z.enum(['automatic', 'yes', 'no']),
  })
  .strict()
  .superRefine((value, ctx) => {
    value.weights.forEach((weight, i) => {
      if (weight < criteria[i].minimum)
        ctx.addIssue({
          code: 'custom',
          path: ['weights', i],
          message: `Minimum ${criteria[i].minimum} % pour « ${criteria[i].title} ».`,
        });
    });
    if (value.weights.reduce((a, b) => a + b, 0) > 100)
      ctx.addIssue({
        code: 'custom',
        path: ['weights'],
        message: 'La pondération totale ne peut pas dépasser 100 %.',
      });
  });
export type Evaluation = z.infer<typeof evaluationSchema>;
export type Oral = Evaluation['teacherOral'];
export type EvaluationRecord = {
  id: string;
  data: Evaluation;
  version: number;
  createdAt: string;
  updatedAt: string;
  lockedAt: string | null;
};
export type User = { id: string; name: string; email: string; role: 'admin' | 'user' };
export function emptyEvaluation(teacher = ''): Evaluation {
  const oral = (): Oral => ({
    points: Array(12).fill(null),
    comments: Array(12).fill(''),
    expressionComment: '',
    subjectComment: '',
  });
  return {
    firstName: '',
    lastName: '',
    program: '',
    orientation: '',
    title: '',
    teacher,
    expert: '',
    defenseDate: '',
    room: '',
    weights: criteria.map((c) => c.minimum),
    teacherMarks: Array(4).fill(null),
    expertMarks: Array(4).fill(null),
    teacherOral: oral(),
    expertOral: oral(),
    protocol: { proceedings: '', presentation: '', questions: '', overall: '' },
    remarks: '',
    congratulations: false,
    award: false,
    confidential: false,
    publication: 'automatic',
  };
}
export const roundTenth = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;
export function oralGrade(oral: Oral): number | null {
  if (oral.points.some((p) => p === null)) return null;
  const pointTenths = 100 + oral.points.reduce<number>((sum, p) => sum + Math.round(p! * 10), 0);
  return Math.round(pointTenths / 10) / 10;
}
export function calculate(data: Evaluation) {
  const teacher = [...data.teacherMarks, oralGrade(data.teacherOral)];
  const expert = [...data.expertMarks, oralGrade(data.expertOral)].map((mark, i) =>
    hasExpertGrade(i) ? mark : null,
  );
  // The displayed criterion grades are the grades used in the weighted calculation.
  const means = teacher.map((t, i) =>
    !hasExpertGrade(i)
      ? t
      : t === null || expert[i] === null
        ? null
        : Math.round((Math.round(t * 10) + Math.round(expert[i]! * 10)) / 2) / 10,
  );
  const totalWeight = data.weights.reduce((a, b) => a + b, 0);
  const complete = means.every((n) => n !== null);
  // Work in integer tenths × integer percentages to avoid binary rounding at thresholds.
  const weightedTenths =
    complete && totalWeight === 100
      ? means.reduce<number>((sum, n, i) => sum + Math.round(n! * 10) * data.weights[i], 0)
      : null;
  const weighted = weightedTenths === null ? null : weightedTenths / 1000;
  const final = weightedTenths === null ? null : Math.round(weightedTenths / 100) / 10;
  return {
    teacher,
    expert,
    means,
    totalWeight,
    final,
    weighted,
    filled: [...teacher, ...expert].filter((n) => n !== null).length,
    requiredMarks,
    publicationAllowed:
      !data.confidential &&
      (data.publication === 'yes' ||
        (data.publication === 'automatic' && final !== null && final >= 5)),
  };
}
export function lockingIssues(data: Evaluation): string[] {
  const issues: string[] = [];
  if (calculate(data).totalWeight !== 100)
    issues.push('La pondération doit atteindre exactement 100 %.');
  if (calculate(data).filled !== requiredMarks)
    issues.push('Complétez toutes les notes et les deux grilles orales.');
  if (
    !data.protocol.presentation.trim() ||
    !data.protocol.questions.trim() ||
    !data.protocol.overall.trim()
  )
    issues.push('Complétez les trois appréciations de la soutenance.');
  return issues;
}
export const formatGrade = (n: number | null) => (n === null ? '—' : roundTenth(n).toFixed(1));
export function gradeLabel(n: number | null) {
  if (n === null) return 'En attente des notes';
  return n >= 5.8
    ? 'A · Excellent'
    : n >= 5.3
      ? 'B · Très bien'
      : n >= 4.8
        ? 'C · Bien'
        : n >= 4.3
          ? 'D · Satisfaisant'
          : n >= 4
            ? 'E · Passable'
            : n >= 3.5
              ? 'FX · Échec'
              : 'F · Échec';
}
