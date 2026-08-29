function commonPrefix(a: string[], b: string[]) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function commonSuffix(a: string[], b: string[], prefix: number) {
  let i = 0;
  while (
    i < a.length - prefix &&
    i < b.length - prefix &&
    a[a.length - 1 - i] === b[b.length - 1 - i]
  ) {
    i++;
  }
  return i;
}

export function compactDiff(before: string, after: string) {
  if (before === after) return 'No changes.';

  const a = before.split('\n');
  const b = after.split('\n');
  const prefix = commonPrefix(a, b);
  const suffix = commonSuffix(a, b, prefix);
  const removed = a.slice(prefix, a.length - suffix);
  const added = b.slice(prefix, b.length - suffix);
  const start = prefix + 1;

  return [
    `@@ around line ${start} @@`,
    ...removed.map((line) => `- ${line}`),
    ...added.map((line) => `+ ${line}`),
  ].join('\n');
}
