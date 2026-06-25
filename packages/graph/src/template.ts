export function resolveInputTemplate(
  template: string,
  context: { taskText: string; steps: Record<string, { output: unknown }> },
): string {
  let resolved = template.replaceAll('{{taskText}}', context.taskText);

  for (const [stepId, step] of Object.entries(context.steps)) {
    const output = step.output;
    const answer =
      output && typeof output === 'object' && output !== null && 'answer' in output
        ? String((output as { answer: unknown }).answer)
        : JSON.stringify(output);
    resolved = resolved.replaceAll(`{{steps.${stepId}.output.answer}}`, answer);
    resolved = resolved.replaceAll(`{{steps.${stepId}.output}}`, JSON.stringify(output));
  }

  return resolved;
}
