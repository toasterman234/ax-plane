import type { EvalCriterion } from '@axplane/eval';
import type { ForgeIntake } from './intake-schema';

export type ForgeEvalCaseDraft = {
  name: string;
  taskText: string;
  criteria: EvalCriterion[];
  sortOrder: number;
};

function snippet(text: string, maxLen = 48): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  const slice = trimmed.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > 16 ? slice.slice(0, lastSpace) : slice).trim();
}

function primaryCriteria(intake: ForgeIntake): EvalCriterion[] {
  const criteria: EvalCriterion[] = [{ type: 'run_completed' }];
  const anchor = snippet(intake.successExample ?? intake.success);
  if (anchor.length >= 3) {
    criteria.push({
      type: 'output_contains',
      field: 'answer',
      text: anchor,
      caseInsensitive: true,
    });
  }
  if (intake.judgment === 'exact' && intake.successExample) {
    criteria.push({
      type: 'output_contains',
      field: 'answer',
      text: snippet(intake.successExample, 80),
      caseInsensitive: false,
    });
  }
  return criteria;
}

function paraphraseTask(task: string, variant: number): string {
  const prefixes = [
    'Please help with the following:',
    'Operator request:',
    'Handle this task:',
  ];
  return `${prefixes[variant % prefixes.length]} ${task}`;
}

export function seedEvalCases(intake: ForgeIntake): ForgeEvalCaseDraft[] {
  const cases: ForgeEvalCaseDraft[] = [];
  const goldenTask = intake.successExample?.trim()
    ? `${intake.task}\n\nExample of a good response:\n${intake.successExample}`
    : intake.task;

  cases.push({
    name: 'Golden path',
    taskText: goldenTask,
    criteria: primaryCriteria(intake),
    sortOrder: 0,
  });

  cases.push({
    name: 'Honors failure constraint',
    taskText: `${intake.task}\n\nConstraint: ${intake.failure}`,
    criteria: [
      { type: 'run_completed' },
      {
        type: 'output_contains',
        field: 'answer',
        text: snippet(intake.success, 32),
        caseInsensitive: true,
      },
    ],
    sortOrder: 1,
  });

  cases.push({
    name: 'Paraphrase A',
    taskText: paraphraseTask(intake.task, 0),
    criteria: [{ type: 'run_completed' }],
    sortOrder: 2,
  });

  cases.push({
    name: 'Paraphrase B',
    taskText: paraphraseTask(intake.task, 1),
    criteria: [{ type: 'run_completed' }],
    sortOrder: 3,
  });

  if (intake.tools.includes('read')) {
    cases.push({
      name: 'Uses read tooling',
      taskText: `${intake.task}\n\nUse available read/search tools when helpful.`,
      criteria: [
        { type: 'run_completed' },
        { type: 'event_type', eventType: 'run.started' },
      ],
      sortOrder: 4,
    });
  }

  if (intake.volume === 'high') {
    cases.push({
      name: 'Terse response',
      taskText: `${intake.task}\n\nKeep the answer concise.`,
      criteria: [{ type: 'run_completed' }],
      sortOrder: 5,
    });
  }

  return cases.slice(0, 8);
}
