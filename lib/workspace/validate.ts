function balanced(text: string, open: string, close: string) {
  let depth = 0;
  for (const char of text) {
    if (char === open) depth++;
    if (char === close) depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

export function validateContent(path: string, content: string) {
  const errors: string[] = [];
  const ext = path.split('.').pop()?.toLowerCase();

  if (!balanced(content, '{', '}')) errors.push('Unbalanced curly braces.');
  if (!balanced(content, '(', ')')) errors.push('Unbalanced parentheses.');
  if (!balanced(content, '[', ']')) errors.push('Unbalanced square brackets.');

  if (ext === 'json') {
    try {
      JSON.parse(content);
    } catch (error) {
      errors.push(`Invalid JSON: ${error instanceof Error ? error.message : 'parse error'}`);
    }
  }

  if (ext === 'html' || ext === 'htm') {
    const opens = (content.match(/<html(?:\s|>)/gi) || []).length;
    const closes = (content.match(/<\/html>/gi) || []).length;
    if (opens !== closes) errors.push('HTML appears to have an unmatched <html> tag.');
  }

  return {
    valid: errors.length === 0,
    errors,
    note: 'MVP validation is structural. Add ESLint/TypeScript/Sandbox execution in the next milestone.',
  };
}
