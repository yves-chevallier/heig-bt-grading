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
const pdftotext = (pdf: Buffer, ...options: string[]) =>
  execFileSync('pdftotext', [...options, '-', '-'], {
    input: pdf,
    maxBuffer: 8 * 1024 * 1024,
  }).toString();
const pages = (pdf: Buffer) =>
  pdftotext(pdf, '-layout')
    .split('\f')
    .filter((p) => p.trim());
const compact = (text: string) => text.replace(/\s+/g, ' ');
// Les intitulés sont composés en capitales par le modèle : on compare sans casse.
const has = (text: string, expected: string) =>
  compact(text).toLowerCase().includes(compact(expected).toLowerCase());
const expectHas = (text: string, ...items: string[]) => {
  for (const item of items) expect(has(text, item), `attendu : ${item}`).toBe(true);
};
const expectLacks = (text: string, ...items: string[]) => {
  for (const item of items) expect(has(text, item), `inattendu : ${item}`).toBe(false);
};
// Flux de contenu décompressés, pour inspecter les opérateurs graphiques.
const streams = (pdf: Buffer) =>
  [...pdf.toString('latin1').matchAll(/<<[^<>]*\/Length (\d+)[^<>]*>>\s*stream\r?\n/g)].flatMap(
    (m) => {
      try {
        const start = m.index! + m[0].length;
        return [inflateSync(pdf.subarray(start, start + Number(m[1]))).toString('latin1')];
      } catch {
        return [];
      }
    },
  );
// Le rouge HEIG-VD (#da291c) posé comme couleur de remplissage du texte.
const brandFills = (pdf: Buffer) =>
  streams(pdf).reduce(
    (n, s) => n + (s.match(/0\.8549\d* 0\.1607\d* 0\.1098\d* scn\b/g)?.length ?? 0),
    0,
  );

describe('PDF Typst (typst et Poppler requis)', () => {
  it('réunit les cinq feuilles, les décisions, l’échelle, les remarques et signatures sur la première page', async () => {
    const data = roundingExample();
    data.remarks = 'Travail solide et bien documenté, défense convaincante.';
    data.congratulations = true;
    const pdf = await renderPdf(record(data));
    const sheets = pages(pdf);
    expect(sheets).toHaveLength(5);
    expectHas(
      sheets[0],
      'Grille d’évaluation',
      'Titre du travail de bachelor',
      'Enseignant·e',
      'Expert·e',
      '5.0',
      '4.965',
      'C · Bien',
      'Félicitations du jury',
      'Proposition de prix',
      'Travail confidentiel',
      'Diffusion du travail sur tb.heig-vd.ch',
      'Échelle d’évaluation',
      '5.8–6.0',
      '1.0–3.4',
      'Remarques du jury',
      'Travail solide et bien documenté, défense convaincante.',
      'Signature de l’enseignant·e responsable',
      'Signature de l’expert·e',
      'Brouillon · Évaluation non verrouillée · Version 1',
    );
    expect(sheets[0]).toContain('GE');
    expectLacks(sheets[0], 'ELCI', 'min.');
    expectHas(sheets[1], 'Protocole d’évaluation orale', 'Note commune de la soutenance 4.7');
    expectHas(sheets[2], 'Évaluation Enseignant·e', 'Note reportée : 4.7');
    expectHas(sheets[3], 'Évaluation Expert·e', 'Note reportée : 4.6');
    // Signatures : grille du jury et feuille de résultats seulement.
    for (const i of [1, 2, 3]) expectLacks(sheets[i], 'Signature');
    expectHas(sheets[4], 'Travail de Bachelor', 'Félicitations du jury', 'Signature de l’expert·e');
    expect(compact(sheets[4])).toBe(compact(pages(await renderPdf(record(data), true))[0]));
    // Pagination des feuilles du jury ; la feuille de résultats en est exclue.
    expectHas(sheets[0], 'Page 1 sur 4');
    expectHas(sheets[3], 'Page 4 sur 4');
    expectHas(sheets[4], 'Feuille de résultats');
    expect(sheets[4]).not.toMatch(/Page \d+ sur \d+/);
    // Logo vectoriel, jamais tramé.
    expect(pdf.toString('latin1')).not.toContain('/Subtype /Image');
  });
  it('exporte une feuille étudiante indépendante sans décisions, diffusion ni pagination', async () => {
    const data = roundingExample();
    data.confidential = true;
    data.award = true;
    const sheets = pages(await renderPdf(record(data), true));
    expect(sheets).toHaveLength(1);
    expectLacks(
      sheets[0],
      'Décisions du jury',
      'Diffusion',
      'tb.heig-vd.ch',
      'Proposition de prix',
      'Travail confidentiel',
      'Félicitations du jury',
    );
    expect(sheets[0]).not.toMatch(/Page \d+ sur \d+/);
    expect(sheets[0]).not.toContain('5.5'); // Teacher's individual work grade.
    expect(sheets[0]).toContain('5.3');
    expect(sheets[0]).toContain('5.0');
    expectHas(sheets[0], 'Signature de l’expert·e');
  });
  it('met en rouge les notes insuffisantes seulement', async () => {
    const passing = await renderPdf(record(roundingExample()));
    const data = roundingExample();
    data.teacherMarks = [4.5, 3.5, 3.8, 4.2];
    data.expertMarks = [null, null, 3.6, 4.0];
    const failing = await renderPdf(record(data));
    // Notes 3.5, 3.5, 3.8, 3.6, 3.7 sur la grille, 3.5 et 3.7 sur la feuille
    // de résultats : chacune pose la couleur de marque.
    expect(brandFills(failing)).toBeGreaterThanOrEqual(brandFills(passing) + 7);
    expectHas(pages(failing)[0], '4.110 · E · Passable', '3.7');
  });
  it('rend une évaluation incomplète, notes manquantes en tirets', async () => {
    const data = roundingExample();
    data.teacherMarks[0] = null;
    data.expertOral.points[3] = null;
    const sheets = pages(await renderPdf(record(data)));
    expect(sheets).toHaveLength(5);
    expectHas(sheets[0], 'Évaluation globale 100 % —');
    expectHas(sheets[3], 'Note reportée : —');
  });
  it('affiche les textes tels quels, sans les interpréter comme du balisage Typst', async () => {
    const data = roundingExample();
    data.remarks =
      'Note "entre guillemets" \\ #strong[gras] *étoiles* _souligné_ $x^2$ <balise> // fin';
    data.title = 'Titre avec `code` et @arobase\nsur deux lignes';
    const sheet = compact(pages(await renderPdf(record(data), true))[0]);
    expect(sheet).toContain(
      'Note "entre guillemets" \\ #strong[gras] *étoiles* _souligné_ $x^2$ <balise> // fin',
    );
    expect(sheet).toContain('Titre avec `code` et @arobase sur deux lignes');
  });
  it('conserve intégralement les longs commentaires et protège marges et pieds de page', async () => {
    const data = roundingExample();
    const long = 'Observation détaillée du jury sur la démarche et les résultats. '.repeat(180);
    data.remarks = `${long} FIN_REMARQUES`;
    data.protocol.proceedings = `${long} FIN_DEROULEMENT`;
    data.protocol.questions = `${long} FIN_QUESTIONS`;
    data.teacherOral.comments = data.teacherOral.comments.map((_, i) => `${long} FIN_CRITERE_${i}`);
    data.teacher = 'Enseignant avec un nom très long '.repeat(8).trim();
    const pdf = await renderPdf(record(data));
    const sheets = pages(pdf);
    const whole = compact(sheets.join(' '));
    expect(sheets.length).toBeGreaterThan(5);
    for (const marker of [
      'FIN_REMARQUES',
      'FIN_DEROULEMENT',
      'FIN_QUESTIONS',
      ...Array.from({ length: 12 }, (_, i) => `FIN_CRITERE_${i}`),
    ])
      expect(whole).toContain(marker);
    expectHas(whole, 'Note reportée : 4.7', 'Signature de l’expert·e');
    // Les feuilles du jury sont numérotées jusqu'à la feuille de résultats.
    const total = sheets.length - pages(await renderPdf(record(data), true)).length;
    expectHas(sheets[0], `Page 1 sur ${total}`);
    expectHas(sheets[total - 1], `Page ${total} sur ${total}`);
    expectHas(sheets[total], 'Travail de Bachelor');
    // Marges de 15 mm respectées : le corps reste au-dessus de la zone du pied
    // de page, et le pied de page reste dans la marge inférieure.
    const bbox = pdftotext(pdf, '-bbox');
    const bodyBottom = 841.89 - 42.52;
    for (const match of bbox.matchAll(
      /<word xMin="([^"]+)" yMin="([^"]+)" xMax="([^"]+)" yMax="([^"]+)"/g,
    )) {
      const [left, top, right, bottom] = match.slice(1).map(Number);
      expect(left).toBeGreaterThanOrEqual(42.5);
      expect(right).toBeLessThanOrEqual(595.28 - 42.5);
      // pdftotext mesure depuis l'ascendante de la police, un peu au-dessus
      // de la hauteur de capitale que Typst cale sur la marge.
      expect(top).toBeGreaterThanOrEqual(42.5 - 6);
      if (top < bodyBottom) expect(bottom).toBeLessThanOrEqual(bodyBottom + 0.5);
      else expect(bottom).toBeLessThanOrEqual(841.89 - 20);
    }
  }, 30000);
});
