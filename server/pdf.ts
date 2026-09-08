// Génération des PDF par Typst. Le modèle typst/evaluation.typ est importé par
// un petit source passé sur l'entrée standard du binaire, dans lequel les
// données (server/pdf-data.ts) sont inlinées sous forme de chaîne JSON : aucun
// fichier temporaire, aucune limite de taille d'argument, et `--root` reste le
// répertoire de l'application, seul endroit où le modèle peut lire (logo).
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { typstData } from './pdf-data';
import type { EvaluationRecord } from '../shared/evaluation';

// Binaire à utiliser ; TYPST_BIN permet de pointer une installation locale.
export const typstBinary = () => process.env.TYPST_BIN || 'typst';

// Encode une chaîne en littéral Typst. Les données ne sont jamais interprétées
// comme du balisage : elles arrivent par `json(bytes(...))`, et le modèle les
// affiche comme des valeurs, pas comme du code.
export function typstString(value: string): string {
  const escaped = value.replace(/[\\"\u0000-\u001f\u2028\u2029]/g, (ch) => {
    switch (ch) {
      case '\\':
        return '\\\\';
      case '"':
        return '\\"';
      case '\n':
        return '\\n';
      case '\r':
        return '\\r';
      case '\t':
        return '\\t';
      default:
        return `\\u{${ch.codePointAt(0)!.toString(16)}}`;
    }
  });
  return `"${escaped}"`;
}

export function typstSource(record: EvaluationRecord, studentOnly = false): string {
  const data = typstString(JSON.stringify(typstData(record)));
  return `#import "/typst/evaluation.typ": render\n#render(json(bytes(${data})), student: ${studentOnly})\n`;
}

export async function renderPdf(record: EvaluationRecord, studentOnly = false): Promise<Buffer> {
  const root = process.cwd();
  const args = ['compile', '--root', root, '--font-path', resolve(root, 'assets/fonts'), '-', '-'];
  return new Promise((resolvePdf, reject) => {
    const child = spawn(typstBinary(), args, { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => err.push(chunk));
    child.on('error', (e: NodeJS.ErrnoException) =>
      reject(
        e.code === 'ENOENT'
          ? new Error(
              `Binaire typst introuvable (${typstBinary()}). Installez-le avec scripts/install-typst.sh ou définissez TYPST_BIN.`,
            )
          : e,
      ),
    );
    child.on('close', (code) => {
      if (code === 0) return resolvePdf(Buffer.concat(out));
      reject(new Error(`typst a échoué (code ${code}) :\n${Buffer.concat(err).toString()}`));
    });
    // Un binaire absent ferme stdin avant l'écriture : l'erreur utile est
    // celle de 'error' ou 'close', pas celle du tube.
    child.stdin.on('error', () => {});
    child.stdin.end(typstSource(record, studentOnly));
  });
}
