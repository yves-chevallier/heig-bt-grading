import { scryptSync } from 'node:crypto';
import { emptyEvaluation, oralCriteria, type Evaluation } from '../shared/evaluation';
import { readConfig } from '../server/config';
export const password = 'test-password-only-123';
const salt = 'a'.repeat(32);
export const passwordHash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
export const testConfig = () =>
  readConfig({
    NODE_ENV: 'test',
    PUBLIC_URL: 'http://localhost:3000',
    DATABASE_PATH: ':memory:',
    ADMIN_EMAIL: 'admin@example.test',
    ADMIN_PASSWORD_HASH: passwordHash,
  });
export function draft(): Evaluation {
  return {
    ...emptyEvaluation(),
    firstName: 'Camille',
    lastName: 'Müller',
    title: 'Commande d’un système énergétique',
    program: 'ELCI',
    teacher: 'Alex Martin',
    expert: 'Sam Dupont',
    defenseDate: '2026-09-18',
    room: 'A203',
  };
}
export function complete(): Evaluation {
  const data = draft();
  data.weights = [10, 20, 20, 30, 20];
  data.teacherMarks = [5, 5.2, 5.4, 5.6];
  data.expertMarks = [null, null, 5.2, 5.4];
  data.teacherOral.points = oralCriteria.map((c) => c.max);
  data.expertOral.points = oralCriteria.map((c) => c.max);
  data.protocol = {
    proceedings: '',
    presentation: 'Présentation claire et structurée.',
    questions: 'Les réponses sont argumentées.',
    overall: 'Excellente maîtrise du sujet.',
  };
  return data;
}
export function roundingExample(): Evaluation {
  const data = complete();
  data.weights = [10, 20, 15, 30, 25];
  data.teacherMarks = [4.5, 5, 5, 5.5];
  data.expertMarks = [null, null, 5, 5];
  data.teacherOral.points = [4, 4, 4, 4, 4, 4, 4, 4, 5, 0, 0, 0]; // 37 + 10 -> 4.7
  data.expertOral.points = [4, 4, 4, 4, 4, 4, 4, 4, 4, 0, 0, 0]; // 36 + 10 -> 4.6
  return data;
}
