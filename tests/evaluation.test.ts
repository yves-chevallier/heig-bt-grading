import { describe, expect, it } from 'vitest';
import {
  calculate,
  emptyEvaluation,
  evaluationSchema,
  lockingIssues,
  oralCriteria,
  oralGrade,
  roundTenth,
  programCode,
  programs,
  orientations,
} from '../shared/evaluation';
import { complete, draft, roundingExample } from './fixtures';
describe('Barème du classeur', () => {
  it('reprend les minimums et les deux groupes de points', () => {
    expect(emptyEvaluation().weights).toEqual([10, 15, 15, 20, 15]);
    expect(oralCriteria.slice(0, 5).reduce((sum, c) => sum + c.max, 0)).toBe(20);
    expect(oralCriteria.slice(5).reduce((sum, c) => sum + c.max, 0)).toBe(30);
  });
  it('calcule la moyenne pondérée du jury au dixième', () => {
    const result = calculate(complete());
    expect(result.means).toEqual([5, 5.2, 5.3, 5.5, 6]);
    // 0.50 + 1.04 + 1.06 + 1.65 + 1.2 = 5.45 -> 5.5
    expect(result.final).toBe(5.5);
    expect(roundTenth(4.05)).toBe(4.1);
  });
  it('ignore les anciennes notes expert des critères 1 et 2 sans altérer le dossier', () => {
    const data = complete();
    data.expertMarks[0] = 1;
    data.expertMarks[1] = 6;
    data.teacherOral.expressionComment = 'Ancienne observation à conserver.';
    data.expertOral.subjectComment = 'Autre observation historique.';
    const snapshot = structuredClone(data);
    const result = calculate(data);
    expect(result.expert.slice(0, 2)).toEqual([null, null]);
    expect(result.means.slice(0, 2)).toEqual(data.teacherMarks.slice(0, 2));
    expect(result.final).toBe(5.5);
    expect(result.filled).toBe(8);
    expect(result.requiredMarks).toBe(8);
    expect(lockingIssues(data)).toEqual([]);
    expect(evaluationSchema.parse(data)).toEqual({ ...snapshot, program: 'GE' });
    expect(data).toEqual(snapshot);
  });
  it('ne remplace pas les notes manquantes par un 1 ni par un zéro', () => {
    const data = complete();
    data.teacherMarks[0] = null;
    expect(calculate(data).means[0]).toBeNull();
    expect(calculate(data).final).toBeNull();
    expect(oralGrade(draft().teacherOral)).toBeNull();
  });
  it('convertit les points de présence et reporte les notes orales', () => {
    const data = complete();
    data.teacherOral.points = Array(12).fill(0);
    expect(oralGrade(data.teacherOral)).toBe(1);
    expect(calculate(data).teacher[4]).toBe(1);
    expect(calculate(data).expert[4]).toBe(6);
    expect(calculate(data).means[4]).toBe(3.5);
    data.teacherOral.points[0] = 3.5;
    expect(oralGrade(data.teacherOral)).toBe(1.4);
  });
  it('pondère les notes finales arrondies de chaque critère', () => {
    const data = complete();
    data.weights = [10, 15, 20, 40, 15];
    data.teacherMarks = [4, 4, 4.1, 4.1];
    data.expertMarks = [null, null, 4, 4];
    data.teacherOral.points = [4, 4, 4, 4, 4, 4, 4, 2, 0, 0, 0, 0];
    data.expertOral.points = [...data.teacherOral.points];
    expect(calculate(data).means).toEqual([4, 4, 4.1, 4.1, 4]);
    expect(calculate(data).final).toBe(4.1);
  });
  it('reproduit la grille signalée : 4.965 devient 5.0, et non 4.9', () => {
    const data = roundingExample();
    const snapshot = structuredClone(data);
    const result = calculate(data);
    expect(result.teacher[4]).toBe(4.7);
    expect(result.expert[4]).toBe(4.6);
    expect(result.means).toEqual([4.5, 5, 5, 5.3, 4.7]);
    expect(result.weighted).toBe(4.965);
    expect(result.final).toBe(5);
    expect(result.publicationAllowed).toBe(true);
    expect(data).toEqual(snapshot);
  });
  it('arrondit exactement toutes les paires de notes autorisées, y compris les demi-dixièmes', () => {
    const data = complete();
    for (let teacher = 10; teacher <= 60; teacher++) {
      for (let expert = 10; expert <= 60; expert++) {
        data.teacherMarks[2] = teacher / 10;
        data.expertMarks[2] = expert / 10;
        expect(calculate(data).means[2]).toBe(Math.round((teacher + expert) / 2) / 10);
      }
    }
    data.teacherOral.points = [...Array(10).fill(3.3), 0.5, 0];
    expect(oralGrade(data.teacherOral)).toBe(4.4); // 33.5 + 10 points -> 4.35 -> 4.4
  });
  it('valide minimums, plafond, précision, dates et notes', () => {
    for (const weights of [
      [9, 20, 20, 30, 20],
      [10, 20, 20, 31, 20],
      [10.5, 15, 15, 20, 15],
    ])
      expect(evaluationSchema.safeParse({ ...draft(), weights }).success).toBe(false);
    expect(evaluationSchema.safeParse(draft()).success).toBe(true);
    for (const mark of [0, 6.1, 4.55]) {
      const data = draft();
      data.teacherMarks[0] = mark;
      expect(evaluationSchema.safeParse(data).success).toBe(false);
    }
    const data = complete();
    data.teacherOral.points[0] = 5;
    expect(evaluationSchema.safeParse(data).success).toBe(false);
    expect(evaluationSchema.safeParse({ ...draft(), defenseDate: '2026-02-30' }).success).toBe(
      false,
    );
    expect(evaluationSchema.safeParse({ ...draft(), lockedAt: '2026-09-06' }).success).toBe(false);
  });
  it('exige 100 %, toutes les notes et le protocole avant verrouillage', () => {
    expect(lockingIssues(draft())).toHaveLength(3);
    expect(lockingIssues(complete())).toEqual([]);
    expect(calculate({ ...complete(), weights: [10, 15, 15, 20, 15] }).final).toBeNull();
  });
  it('applique les décisions de diffusion sans diffuser les travaux confidentiels', () => {
    expect(calculate(complete()).publicationAllowed).toBe(true);
    expect(
      calculate({ ...complete(), confidential: true, publication: 'yes' }).publicationAllowed,
    ).toBe(false);
    expect(calculate({ ...complete(), publication: 'no' }).publicationAllowed).toBe(false);
  });
});

it('corrige le code ELCI à l’affichage et au prochain enregistrement, sans modifier l’objet historique', () => {
  const historical = draft();
  historical.program = 'ELCI';
  expect(programCode(historical.program)).toBe('GE');
  expect(evaluationSchema.parse(historical).program).toBe('GE');
  expect(historical.program).toBe('ELCI');
});

it.each([
  ['ENTE', 'ETE'],
  ['MTEC', 'MT'],
  ['SYND', 'SI'],
])('affiche le code hérité %s sous le code officiel %s', (historique, officiel) => {
  const record = draft();
  record.program = historique;
  expect(programCode(record.program)).toBe(officiel);
  expect(record.program).toBe(historique);
});

it('laisse intact un code inconnu plutôt que de le réécrire', () => {
  // Une évaluation peut porter une filière saisie à la main : elle doit
  // s'afficher telle quelle, pas disparaître derrière un code inventé.
  expect(programCode('XYZ')).toBe('XYZ');
  expect(programCode('')).toBe('');
});

describe('référentiel des filières et orientations', () => {
  it('ne contient pas de code de filière en double', () => {
    const codes = programs.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('rattache chaque orientation à une filière existante', () => {
    const codes = new Set(programs.map((p) => p.code));
    const orphelines = orientations.filter((o) => !codes.has(o.program));
    expect(orphelines.map((o) => o.code)).toEqual([]);
  });

  it('donne à chaque filière au moins une orientation', () => {
    const rattachees = new Set(orientations.map((o) => o.program));
    const sansOrientation = programs.filter((p) => !rattachees.has(p.code));
    expect(sansOrientation.map((p) => p.code)).toEqual([]);
  });

  it('ne propose aucun code de filière que programCode réécrirait', () => {
    // Un code hérité laissé dans la liste serait proposé à la saisie puis
    // aussitôt réaffiché sous un autre code : incohérent pour l'utilisateur.
    const reecrits = programs.filter((p) => programCode(p.code) !== p.code);
    expect(reecrits.map((p) => p.code)).toEqual([]);
  });
});
