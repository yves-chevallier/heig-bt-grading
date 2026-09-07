import PDFDocument from 'pdfkit';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  calculate,
  hasExpertGrade,
  criteria,
  oralCriteria,
  protocolFields,
  programCode,
  formatGrade,
  gradeLabel,
  type EvaluationRecord,
  type Oral,
} from '../shared/evaluation';

const M = (1.5 * 72) / 2.54; // 1.5 cm margins on all sides; PDF units are points.
const TOP = M;
const FOOTER_Y = 841.89 - M - 12;
const SIGNATURE_Y = FOOTER_Y - 59;
const W = 595.28 - 2 * M;
const C = {
  ink: '#242424',
  muted: '#595959',
  line: '#c4c4c4',
  light: '#f4f4f4',
};
// This fixed asset contains only filled paths and polygons. Preserve the original vectors.
const svg = readFileSync(resolve('assets/heig-vd.svg'), 'utf8');
const logoPaths = [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map((m) => m[1]);
for (const polygon of svg.matchAll(/<polygon\b[^>]*\bpoints="([^"]+)"/g)) {
  const p = polygon[1]
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  logoPaths.push(
    `M${p[0]},${p[1]} ${p.slice(2).reduce((s, n, i) => s + (i % 2 ? `${n} ` : `L${n},`), '')}Z`,
  );
}

type Annex = { label: string; content: string; student: boolean };
export async function renderPdf(record: EvaluationRecord, studentOnly = false): Promise<Buffer> {
  return new Promise((resolvePdf, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      bufferPages: true,
      autoFirstPage: false,
      info: {
        Title: `Évaluation TB — ${record.data.firstName} ${record.data.lastName}`,
        Author: 'HEIG-VD · Département TIN',
      },
    });
    const buffers: Buffer[] = [];
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolvePdf(Buffer.concat(buffers)));
    doc.on('error', reject);
    doc.registerFont('Regular', resolve('assets/fonts/DejaVuSans.ttf'));
    doc.registerFont('Bold', resolve('assets/fonts/DejaVuSans-Bold.ttf'));
    const data = record.data,
      result = calculate(data);
    const annexes: Annex[] = [];
    const independentPages = new Set<number>();
    let studentPage = false;
    const font = (size = 9, bold = false) => doc.font(bold ? 'Bold' : 'Regular').fontSize(size);
    function height(value: string, width: number, size = 9, bold = false) {
      return font(size, bold).heightOfString(value, { width, lineGap: 1 });
    }
    function text(
      value: string,
      x: number,
      y: number,
      width: number,
      size = 9,
      bold = false,
      color = C.ink,
      align: 'left' | 'center' | 'right' = 'left',
    ) {
      font(size, bold).fillColor(color).text(value, x, y, { width, lineGap: 1, align });
    }
    function line(x: number, y: number, width: number, color = C.line) {
      doc
        .lineWidth(0.5)
        .strokeColor(color)
        .moveTo(x, y)
        .lineTo(x + width, y)
        .stroke();
    }
    function verticals(xs: number[], y: number, h: number) {
      for (const x of xs)
        doc
          .lineWidth(0.5)
          .strokeColor(C.line)
          .moveTo(x, y)
          .lineTo(x, y + h)
          .stroke();
    }
    function box(x: number, y: number, width: number, h: number, fill = '#ffffff') {
      doc.lineWidth(0.5).rect(x, y, width, h).fillAndStroke(fill, C.line);
    }
    // Find a fitting prefix without losing any text; also handles unbroken strings.
    function split(value: string, width: number, maxHeight: number, size: number, bold = false) {
      if (height(value, width, size, bold) <= maxHeight) return [value, ''];
      let lo = 0,
        hi = value.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (height(value.slice(0, mid), width, size, bold) <= maxHeight) lo = mid;
        else hi = mid - 1;
      }
      const space = value.lastIndexOf(' ', lo);
      const cut = space > lo * 0.7 ? space : Math.max(1, lo);
      return [value.slice(0, cut).trimEnd(), value.slice(cut).trimStart()];
    }
    function preview(
      value: string,
      label: string,
      x: number,
      y: number,
      width: number,
      h: number,
      size = 8,
      bold = false,
    ) {
      value = value.trim();
      if (!value) return;
      if (height(value, width, size, bold) <= h) {
        text(value, x, y, width, size, bold);
        return;
      }
      const visible = split(value, width, h - 12, size, bold)[0];
      const existing = annexes.findIndex(
        (a) => a.label === label && a.content === value && a.student === studentPage,
      );
      const number =
        existing < 0 ? annexes.push({ label, content: value, student: studentPage }) : existing + 1;
      if (visible) text(visible, x, y, width, size, bold);
      text(`Texte intégral en annexe ${number}.`, x, y + h - 10, width, 7, false, C.ink);
    }
    function check(
      label: string,
      checked: boolean,
      x: number,
      y: number,
      width: number,
      disabled = false,
    ) {
      box(x, y + 1, 9, 9, disabled ? C.light : '#ffffff');
      if (checked)
        doc
          .lineWidth(1.3)
          .strokeColor(disabled ? C.muted : C.ink)
          .moveTo(x + 1.8, y + 5)
          .lineTo(x + 4, y + 7.3)
          .lineTo(x + 7.7, y + 2.8)
          .stroke();
      text(label, x + 15, y, width - 15, 8, false, disabled ? C.muted : C.ink);
    }
    function page(heading: string, tag: string, student = false) {
      doc.addPage();
      studentPage = student;
      if (student) independentPages.add(doc.bufferedPageRange().count - 1);
      doc
        .save()
        .translate(M, TOP)
        .scale(56 / 1911.5);
      for (const path of logoPaths) doc.path(path).fill(C.ink);
      doc.restore();
      text(heading, M + 80, TOP, W - 80, 18, true, C.ink, 'right');
      text(`Département TIN · ${tag}`, M + 80, TOP + 29, W - 80, 8, false, C.muted, 'right');
      const identityY = TOP + 52;
      text('Titre du TB', M, identityY, W, 6.5, true, C.muted);
      const titleHeight = Math.min(29, height(data.title, W, 11, true));
      preview(
        data.title,
        'Titre du travail de bachelor',
        M,
        identityY + 11,
        W,
        titleHeight,
        11,
        true,
      );
      const studentY = identityY + 11 + titleHeight + 10;
      text('Étudiant·e', M, studentY, 340, 6.5, true, C.muted);
      preview(
        `${data.firstName} ${data.lastName}`,
        'Identité de l’étudiant·e',
        M,
        studentY + 11,
        340,
        20,
        11,
        true,
      );
      text('Filière / orientation', M + 367, studentY, W - 367, 6.5, true, C.muted);
      preview(
        `${programCode(data.program)}${data.orientation ? ` / ${data.orientation}` : ''}`,
        'Filière / orientation',
        M + 367,
        studentY + 11,
        W - 367,
        20,
        9,
      );
      const juryY = studentY + 34;
      const fields = [
        ['Enseignant·e responsable', data.teacher, 0, 186],
        ['Expert·e', data.expert, 196, 154],
        [
          'Soutenance / salle',
          `${data.defenseDate.split('-').reverse().join('.')}${data.room ? ` · ${data.room}` : ''}`,
          367,
          W - 367,
        ],
      ] as const;
      for (const [label, value, x, width] of fields) {
        text(label, M + x, juryY, width, 6.5, true, C.muted);
        preview(value, label, M + x, juryY + 11, width, 22, 8);
      }
      return juryY + 49;
    }
    function signatures(y: number) {
      const half = (W - 24) / 2;
      text('Signature de l’enseignant·e responsable', M, y, half, 7, true);
      text('Signature de l’expert·e', M + half + 24, y, half, 7, true);
      line(M, y + 37, half);
      line(M + half + 24, y + 37, half);
    }
    function grid(student: boolean) {
      let y = page(
        student ? 'Travail de Bachelor' : 'Grille d’évaluation',
        student ? 'Résultats du jury' : 'Appréciation du jury',
        student,
      );
      const markWidth = 56;
      const widths = student
        ? [W - 2 * markWidth, markWidth, markWidth]
        : [W - 4 * markWidth, markWidth, markWidth, markWidth, markWidth];
      const criterionWidth = widths[0] - 16;
      const offsets = widths.map((_, i) => M + widths.slice(0, i).reduce((a, b) => a + b, 0));
      const labels = student
        ? ['Critères d’évaluation', 'Pondération', 'Note finale']
        : ['Critères d’évaluation', 'Pondération', 'Enseignant·e', 'Expert·e', 'Note finale'];
      doc.rect(M, y, W, 22).fill(C.light);
      line(M, y, W);
      labels.forEach((label, i) =>
        text(label, offsets[i] + 3, y + 7, widths[i] - 6, 6.5, true, C.ink, i ? 'center' : 'left'),
      );
      verticals(offsets.slice(1), y, 22);
      y += 22;
      line(M, y, W);
      for (const [i, criterion] of criteria.entries()) {
        const group =
          i === 0
            ? 'Évaluation intermédiaire'
            : i === 1
              ? 'Évaluation en fin de projet'
              : i === 4
                ? 'Soutenance orale'
                : '';
        const titleH = height(`${i + 1}. ${criterion.title}`, criterionWidth, 8.5, true);
        const descH = height(criterion.description, criterionWidth, 7.5);
        const h = Math.max(36, 10 + titleH + descH + (group ? 10 : 0));
        verticals(offsets.slice(1), y, h);
        let ty = y + 5;
        if (group) {
          text(group, M + 8, ty, criterionWidth, 7, false, C.muted);
          ty += 10;
        }
        text(`${i + 1}. ${criterion.title}`, M + 8, ty, criterionWidth, 8.5, true);
        text(criterion.description, M + 8, ty + titleH + 2, criterionWidth, 7.5, false, C.muted);
        text(
          `${data.weights[i]} %`,
          offsets[1],
          y + h / 2 - 11,
          widths[1],
          10,
          true,
          C.ink,
          'center',
        );
        text(
          `min. ${criterion.minimum} %`,
          offsets[1],
          y + h / 2 + 4,
          widths[1],
          6.5,
          false,
          C.muted,
          'center',
        );
        if (!student) {
          text(
            formatGrade(result.teacher[i]),
            offsets[2],
            y + h / 2 - 6,
            widths[2],
            10,
            false,
            C.ink,
            'center',
          );
          text(
            hasExpertGrade(i) ? formatGrade(result.expert[i]) : '',
            offsets[3],
            y + h / 2 - 6,
            widths[3],
            10,
            false,
            hasExpertGrade(i) ? C.ink : C.muted,
            'center',
          );
        }
        text(
          formatGrade(result.means[i]),
          offsets.at(-1)!,
          y + h / 2 - 7,
          widths.at(-1)!,
          11,
          true,
          C.ink,
          'center',
        );
        y += h;
        line(M, y, W);
      }
      doc.rect(M, y, W, 39).fill(C.light);
      line(M, y, W);
      line(M, y + 39, W);
      verticals(offsets.slice(1), y, 39);
      text('Évaluation globale', M + 8, y + 7, criterionWidth, 9, true);
      text(
        result.weighted === null
          ? 'Évaluation incomplète'
          : `Avant arrondi final : ${result.weighted.toFixed(3)} · ${gradeLabel(result.final)}`,
        M + 8,
        y + 23,
        criterionWidth,
        7,
        false,
        C.muted,
      );
      text(`${result.totalWeight} %`, offsets[1], y + 13, markWidth, 9, true, C.ink, 'center');
      text(formatGrade(result.final), offsets.at(-1)!, y + 7, markWidth, 16, true, C.ink, 'center');
      y += 50;
      if (!student) {
        text('Décisions du jury', M, y, 210, 7.5, true);
        check('Félicitations du jury', data.congratulations, M, y + 18, 210);
        check('Proposition de prix', data.award, M, y + 35, 210);
        check('Travail confidentiel', data.confidential, M, y + 52, 210);
        check(
          'Diffusion du travail sur tb.heig-vd.ch',
          result.publicationAllowed,
          M,
          y + 69,
          210,
          data.confidential,
        );
      } else if (data.congratulations) {
        text('Félicitations du jury', M, y, W, 10, true);
        y += 25;
      }
      const scaleX = student ? M : M + 220;
      text('Échelle d’évaluation', scaleX, y, student ? W : W - 220, 7.5, true);
      const scale = [
        ['5.8–6.0', 'A', 'Excellent'],
        ['5.3–5.7', 'B', 'Très bien'],
        ['4.8–5.2', 'C', 'Bien'],
        ['4.3–4.7', 'D', 'Satisfaisant'],
        ['4.0–4.2', 'E', 'Passable'],
        ['3.5–3.9', 'FX', 'Échec'],
        ['1.0–3.4', 'F', 'Échec'],
      ];
      scale.forEach(([range, letter, label], i) => {
        const active = gradeLabel(result.final).startsWith(`${letter} ·`);
        if (student) {
          const cell = W / 7,
            x = M + i * cell;
          if (active) doc.rect(x, y + 16, cell - 4, 28).fill(C.light);
          text(range, x, y + 18, cell - 7, 7, active);
          text(`${letter} · ${label}`, x, y + 31, cell - 7, 7, active);
        } else {
          const cell = (W - 220) / 2,
            x = scaleX + (i < 4 ? 0 : cell),
            sy = y + 18 + (i < 4 ? i : i - 4) * 13;
          if (active) doc.rect(x, sy - 2, cell - 6, 13).fill(C.light);
          text(range, x, sy, 49, 7, active);
          text(letter, x + 51, sy, 17, 7, true);
          text(label, x + 72, sy, cell - 78, 7, active);
        }
      });
      y += student ? 52 : 94;
      text('Remarques du jury', M, y, W, 7.5, true);
      const remarksH = Math.max(27, SIGNATURE_Y - 11 - (y + 15));
      box(M, y + 15, W, remarksH);
      if (data.remarks.trim())
        preview(data.remarks, 'Remarques du jury', M + 8, y + 21, W - 16, remarksH - 12, 8);
      signatures(Math.max(SIGNATURE_Y, y + 15 + remarksH + 11));
    }
    function protocol() {
      let y = page('Protocole d’évaluation orale', 'Synthèse du jury');
      doc.rect(M, y, W, 34).fill(C.light);
      text('Note commune de la soutenance', M + 10, y + 10, W - 110, 9, true);
      text(formatGrade(result.means[4]), M + W - 90, y + 6, 78, 16, true, C.ink, 'right');
      y += 44;
      text(
        'Indiquer les points positifs et négatifs, les questions posées et les principaux éléments de réponse. Une prise de notes abrégée suffit.',
        M,
        y,
        W,
        8,
        false,
        C.muted,
      );
      y += 34;
      for (const field of protocolFields) {
        text(field.title, M, y, W, 9, true);
        if (field.key === 'proceedings') {
          box(M, y + 19, W, 81);
          if (data.protocol[field.key].trim())
            preview(data.protocol[field.key], field.title, M + 9, y + 27, W - 18, 65, 9);
          else for (let ly = y + 44; ly < y + 96; ly += 20) line(M + 9, ly, W - 18, '#e5e5e5');
          y += 110;
        } else {
          const content = data.protocol[field.key].trim() || '(aucune note)';
          const contentHeight = Math.min(65, height(content, W, 9));
          preview(content, field.title, M, y + 19, W, contentHeight, 9);
          y += 45 + contentHeight;
        }
      }
      signatures(SIGNATURE_Y);
    }
    function oralSheet(oral: Oral, role: string, grade: number | null) {
      let y = page(`Évaluation ${role}`, 'Grille individuelle');
      const pointX = M + 257,
        maxX = M + 301,
        commentX = M + 340;
      const rowHeights = oralCriteria.map((c) => Math.max(28, height(c.title, 241, 8) + 10));
      // Keep the total and signature spaces on the sheet even when every comment is long.
      let spare = Math.max(0, SIGNATURE_Y - 59 - y - 68 - rowHeights.reduce((a, b) => a + b, 0));
      rowHeights.forEach((base, i) => {
        const extra = Math.min(
          spare,
          Math.max(0, Math.min(43, height(oral.comments[i], W - 356, 7.3)) + 10 - base),
        );
        rowHeights[i] += extra;
        spare -= extra;
      });
      for (const group of ['expression', 'subject']) {
        doc.rect(M, y, W, 25).fill(C.light);
        text(
          group === 'expression'
            ? 'Maîtrise de l’expression orale · 20 points'
            : 'Maîtrise du sujet présenté · 30 points',
          M + 7,
          y + 8,
          250,
          8,
          true,
          C.ink,
        );
        text('Points', pointX, y + 8, 44, 7, true, C.ink, 'center');
        text('Max.', maxX, y + 8, 39, 7, true, C.ink, 'center');
        text('Remarques', commentX + 7, y + 8, W - 347, 7, true, C.ink);
        verticals([pointX, maxX, commentX], y, 25);
        y += 25;
        oralCriteria.forEach((criterion, i) => {
          if (criterion.group !== group) return;
          const h = rowHeights[i];
          verticals([pointX, maxX, commentX], y, h);
          text(criterion.title, M + 8, y + 5, 241, 8);
          text(
            oral.points[i] === null ? '—' : String(oral.points[i]),
            pointX,
            y + h / 2 - 6,
            44,
            10,
            true,
            C.ink,
            'center',
          );
          text(String(criterion.max), maxX, y + h / 2 - 5, 39, 9, false, C.muted, 'center');
          preview(
            oral.comments[i],
            `${role} · ${criterion.title}`,
            commentX + 8,
            y + 5,
            W - 356,
            h - 10,
            7.3,
          );
          y += h;
        });
        y += 9;
      }
      const subtotal = oral.points.some((p) => p === null)
        ? null
        : Math.round(oral.points.reduce<number>((s, p) => s + (p ?? 0), 0) * 10) / 10;
      doc.rect(M, y, W, 45).fill(C.light);
      text(`Critères : ${subtotal ?? '—'} / 50   +   Présence : 10 / 10`, M + 9, y + 8, 340, 8);
      text(
        `Total : ${subtotal === null ? '—' : Math.round((subtotal + 10) * 10) / 10} / 60`,
        M + 9,
        y + 25,
        340,
        9,
        true,
      );
      text(
        `Note reportée : ${formatGrade(grade)}`,
        M + 342,
        y + 9,
        W - 352,
        12,
        true,
        C.ink,
        'right',
      );
      text(
        'Total ÷ 10 · arrondi au dixième',
        M + 342,
        y + 28,
        W - 352,
        6.8,
        false,
        C.muted,
        'right',
      );
      signatures(Math.max(y + 59, SIGNATURE_Y));
    }
    grid(studentOnly);
    if (!studentOnly) {
      protocol();
      oralSheet(data.teacherOral, 'Enseignant·e', result.teacher[4]);
      oralSheet(data.expertOral, 'Expert·e', result.expert[4]);
      grid(true);
    }
    // Full texts live on numbered continuation pages, never hidden or truncated.
    // Snapshot: repeated identity previews on these pages must not enqueue more annexes.
    const pending = [...annexes];
    for (const [i, annex] of pending.entries()) {
      let content = annex.content,
        continued = false;
      do {
        const y = page(
          `Annexe ${i + 1}${continued ? ' · suite' : ''}`,
          'Remarques complémentaires',
          annex.student,
        );
        text(annex.label, M, y, W, 11, true);
        const labelH = height(annex.label, W, 11, true);
        const [part, rest] = split(content, W, FOOTER_Y - 20 - y - labelH - 15, 9);
        text(part, M, y + labelH + 15, W, 9);
        content = rest;
        continued = true;
      } while (content);
    }
    const range = doc.bufferedPageRange();
    let juryPageNumber = 0;
    const juryPageCount = range.count - independentPages.size;
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      line(M, FOOTER_Y - 8, W);
      const status = record.lockedAt
        ? `Verrouillée le ${new Date(record.lockedAt).toLocaleDateString('fr-CH', { timeZone: 'Europe/Zurich' })}`
        : 'Brouillon · Évaluation non verrouillée';
      text(`${status} · Version ${record.version}`, M, FOOTER_Y, W - 70, 6.5, false, C.muted);
      if (!independentPages.has(i))
        text(
          `${++juryPageNumber} / ${juryPageCount}`,
          M + W - 60,
          FOOTER_Y - 2,
          60,
          8,
          false,
          C.muted,
          'right',
        );
    }
    doc.end();
  });
}
