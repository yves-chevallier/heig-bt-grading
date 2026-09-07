import { z } from 'zod';
import { evaluationSchema, type Evaluation, type EvaluationRecord } from './evaluation';

export const expertInputSchema = z
  .object({
    reportMark: evaluationSchema.shape.expertMarks.element,
    workMark: evaluationSchema.shape.expertMarks.element,
    expertOral: evaluationSchema.shape.expertOral,
  })
  .strict();
export type ExpertInput = z.infer<typeof expertInputSchema>;
export const expertInput = (data: Evaluation): ExpertInput => ({
  reportMark: data.expertMarks[2],
  workMark: data.expertMarks[3],
  expertOral: data.expertOral,
});
export type ExpertEvaluation = {
  identity: Pick<
    Evaluation,
    | 'firstName'
    | 'lastName'
    | 'title'
    | 'program'
    | 'orientation'
    | 'teacher'
    | 'expert'
    | 'defenseDate'
    | 'room'
  >;
  data: ExpertInput;
  revision: string;
  lockedAt: EvaluationRecord['lockedAt'];
};
