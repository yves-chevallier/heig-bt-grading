import { execFileSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { renderPdf } from '../server/pdf';
import { roundingExample } from './fixtures';
import type { Evaluation, EvaluationRecord } from '../shared/evaluation';

const record = (data: Evaluation): EvaluationRecord => ({
  id: 'pdf-fixture',
  data,
  version: 1,
  createdAt: '2026-09-06',
  updatedAt: '2026-09-06',
  lockedAt: null,
});
const pages = (pdf: Buffer) =>
  execFileSync('pdftotext', ['-layout', '-', '-'], { input: pdf, maxBuffer: 8 * 1024 * 1024 })
    .toString()
    .split('\f')
    .filter((p) => p.trim());
const compact = (text: string) => text.replace(/\s+/g, ' ');

describe('PDF imprimable (Poppler requis)', () => {
  it('réunit les cinq feuilles, les décisions, l’échelle, les remarques et signatures sur la première page', async () => {
    const data = roundingExample();
    data.remarks = 'Remarque du jury : travail solide et bien documenté.';
    data.congratulations = true;
    const pdf = await renderPdf(record(data));
    const sheets = pages(pdf);
    expect(sheets).toHaveLength(5);
    for (const expected of [
      'Grille d’évaluation',
      'Enseignant·e',
      'Expert·e',
      '5.0',
      '4.965',
      'Félicitations du jury',
      'Proposition de prix',
      'Travail confidentiel',
      'Échelle d’évaluation',
      '5.8–6.0',
      '1.0–3.4',
      'Remarque du jury : travail solide et bien documenté.',
      'Signature de l’expert·e',
    ]) {
      expect(compact(sheets[0])).toContain(expected);
    }
    expect(sheets[0]).not.toContain('Autorisé à partir');
    expect(sheets[0]).not.toMatch(/5\.0\s*\/\s*6/);
    expect(sheets[1]).toContain('Protocole d’évaluation orale');
    expect(sheets[0]).toContain('GE');
    expect(sheets[0]).not.toContain('ELCI');
    expect(sheets[1]).not.toMatch(/1\.\s*Appréciation/);
    expect(sheets[2]).toContain('Évaluation Enseignant·e');
    expect(sheets[3]).toContain('Évaluation Expert·e');
    expect(sheets[4]).toContain('Travail de Bachelor');
    expect(compact(sheets[4])).toBe(compact(pages(await renderPdf(record(data), true))[0]));
    expect(sheets[4]).toContain('Félicitations du jury');
    expect(sheets[0]).toMatch(/1\s*\/\s*4/);
    expect(sheets[3]).toMatch(/4\s*\/\s*4/);
    expect(sheets[4]).not.toMatch(/\d+\s*\/\s*\d+/);
    // Vector logo: 15 mm from both the left and the top.
    const source = pdf.toString('latin1');
    const streams = [...source.matchAll(/<<[^<>]*\/Length (\d+)[^<>]*>>\s*stream\r?\n/g)].flatMap(
      (m) => {
        try {
          const start = m.index! + m[0].length;
          return [inflateSync(pdf.subarray(start, start + Number(m[1]))).toString()];
        } catch {
          return [];
        }
      },
    );
    expect(streams.filter((s) => s.includes('1 0 0 1 42.519685 42.519685 cm'))).toHaveLength(5);
    expect(source).not.toContain('/Subtype /Image');
    expect(streams[0]).toContain('1417.3 1092.5 m');
    for (const stream of streams.filter((s) => s.includes('42.519685 42.519685 cm'))) {
      for (const color of stream.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) (?:scn|SCN|rg|RG)\b/g)) {
        expect(color[1]).toBe(color[2]);
        expect(color[2]).toBe(color[3]);
      }
    }
  });
  it('exporte une feuille étudiante indépendante sans décisions, diffusion ni pagination', async () => {
    const data = roundingExample();
    data.confidential = true;
    data.award = true;
    const sheets = pages(await renderPdf(record(data), true));
    expect(sheets).toHaveLength(1);
    for (const label of [
      'Décisions du jury',
      'Diffusion',
      'tb.heig-vd.ch',
      'Proposition de prix',
      'Travail confidentiel',
      'Félicitations du jury',
    ])
      expect(sheets[0]).not.toContain(label);
    expect(sheets[0]).not.toMatch(/\d+\s*\/\s*\d+/);
    expect(sheets[0]).not.toContain('5.5'); // Teacher's individual work grade.
    expect(sheets[0]).toContain('5.3');
    expect(sheets[0]).toContain('5.0');
  });
  it('conserve intégralement les longs commentaires en annexes et protège les totaux et pieds de page', async () => {
    const data = roundingExample();
    const long = 'Observation détaillée du jury sur la démarche et les résultats. '.repeat(180);
    data.remarks = `${long} FIN_REMARQUES`;
    data.protocol.questions = `${long} FIN_QUESTIONS`;
    data.teacherOral.comments = data.teacherOral.comments.map((_, i) => `${long} FIN_CRITERE_${i}`);
    data.teacher = 'Enseignant avec un nom très long '.repeat(8).trim();
    const pdf = await renderPdf(record(data));
    const sheets = pages(pdf);
    const whole = compact(sheets.join(' '));
    expect(sheets.length).toBeGreaterThan(5);
    for (const marker of [
      'FIN_REMARQUES',
      'FIN_QUESTIONS',
      ...Array.from({ length: 12 }, (_, i) => `FIN_CRITERE_${i}`),
    ])
      expect(whole).toContain(marker);
    expect(sheets[2]).toContain('Note reportée : 4.7');
    expect(sheets[2]).toContain('Signature de l’expert·e');
    // Respect 15 mm margins and keep body text above the footer, even with long comments.
    const bbox = execFileSync('pdftotext', ['-bbox', '-', '-'], {
      input: pdf,
      maxBuffer: 8 * 1024 * 1024,
    }).toString();
    for (const match of bbox.matchAll(
      /<word xMin="[^"]+" yMin="([^"]+)" xMax="[^"]+" yMax="([^"]+)"/g,
    )) {
      const top = Number(match[1]),
        bottom = Number(match[2]);
      expect(top).toBeGreaterThanOrEqual(42.5);
      expect(bottom).toBeLessThanOrEqual(799.4);
      expect(top < 779 ? bottom <= 779 : top >= 785).toBe(true);
    }
  }, 30000);
});
