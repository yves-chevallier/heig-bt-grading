import { describe, expect, it } from 'vitest';
import { typstData } from '../server/pdf-data';
import { typstSource, typstString } from '../server/pdf';
import { roundingExample } from './fixtures';
import type { Evaluation, EvaluationRecord } from '../shared/evaluation';

const record = (data: Evaluation, lockedAt: string | null = null): EvaluationRecord => ({
  id: 'data-fixture',
  data,
  version: 3,
  createdAt: '2026-09-06',
  updatedAt: '2026-09-06',
  lockedAt,
});

describe('données du modèle Typst', () => {
  it('livre des valeurs déjà calculées : notes, moyenne, mention, phases, décisions', () => {
    const data = roundingExample();
    data.congratulations = true;
    const d = typstData(record(data));
    expect(d.meta.student).toBe(`${data.firstName} ${data.lastName}`);
    expect(d.meta.program).toBe('GE');
    expect(d.meta.status).toBe('Brouillon · Évaluation non verrouillée');
    expect(d.criteria.map((c) => c.phase)).toEqual([
      'Évaluation intermédiaire',
      'Évaluation en fin de projet',
      '',
      '',
      'Soutenance orale',
    ]);
    // Critères 1 et 2 : enseignant·e seul·e, pas de note d'expert·e à afficher.
    expect(d.criteria.map((c) => c.expert)).toEqual(['', '', '5.0', '5.0', '4.6']);
    expect(d.criteria.map((c) => c.final)).toEqual(['4.5', '5.0', '5.0', '5.3', '4.7']);
    expect(d.overall).toEqual({
      weight: 100,
      final: '5.0',
      mention: 'C · Bien',
      beforeRounding: '4.965',
    });
    expect(d.scale.filter((s) => s.active).map((s) => s.code)).toEqual(['C']);
    expect(d.decisions.map((x) => [x.label, x.checked])).toEqual([
      ['Félicitations du jury', true],
      ['Proposition de prix', false],
      ['Travail confidentiel', false],
      ['Diffusion du travail sur tb.heig-vd.ch', true],
    ]);
    expect(d.protocol.grade).toBe('4.7');
    expect(d.orals.map((o) => [o.role, o.total, o.totalMax, o.grade])).toEqual([
      ['Enseignant·e', 47, 60, '4.7'],
      ['Expert·e', 46, 60, '4.6'],
    ]);
    expect(d.orals[0].groups.map((g) => [g.title, g.max, g.rows.length])).toEqual([
      ['Maîtrise de l’expression orale', 20, 5],
      ['Maîtrise du sujet présenté', 30, 7],
    ]);
  });
  it('signale le verrouillage et les notes manquantes', () => {
    const data = roundingExample();
    data.teacherMarks[0] = null;
    const d = typstData(record(data, '2026-09-08T10:00:00.000Z'));
    expect(d.meta.status).toBe('Verrouillée le 08.09.2026');
    expect(d.meta.locked).toBe(true);
    expect(d.criteria[0].teacher).toBe('—');
    expect(d.criteria[0].final).toBe('—');
    expect(d.overall.final).toBe('—');
    expect(d.overall.beforeRounding).toBe('—');
    expect(d.scale.some((s) => s.active)).toBe(false);
  });
});

describe('source Typst', () => {
  it('encode les chaînes en littéraux sûrs', () => {
    expect(typstString('a"b\\c\nd\te\r')).toBe('"a\\"b\\\\c\\nd\\te\\r\\u{1}"');
    expect(typstString('#strong[x] $y$ <z>  ')).toBe('"#strong[x] $y$ <z> \\u{2028}"');
  });
  it('importe le modèle et lui passe les données inlinées', () => {
    const source = typstSource(record(roundingExample()), true);
    expect(source).toMatch(/^#import "\/typst\/evaluation\.typ": render\n/);
    expect(source).toContain('student: true');
    expect(source).toContain('json(bytes("');
  });
});
