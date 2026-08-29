import { compactDiff } from './diff';
import { validateContent } from './validate';
import type { WorkspaceFile } from './types';

export class Workspace {
  private files = new Map<string, string>();
  private originals = new Map<string, string>();
  private touched = new Set<string>();

  constructor(files: WorkspaceFile[]) {
    for (const file of files) {
      this.files.set(file.path, file.content);
      this.originals.set(file.path, file.content);
    }
  }

  list() {
    return [...this.files.entries()].map(([path, content]) => ({
      path,
      lines: content.split('\n').length,
      size: content.length,
      extension: path.split('.').pop() || '',
    }));
  }

  get(path: string) {
    const value = this.files.get(path);
    if (value === undefined) throw new Error(`File not found: ${path}`);
    return value;
  }

  readRange(path: string, startLine: number, endLine: number) {
    const lines = this.get(path).split('\n');
    const start = Math.max(1, startLine);
    const end = Math.min(lines.length, endLine);
    return lines
      .slice(start - 1, end)
      .map((line, index) => `${start + index}: ${line}`)
      .join('\n');
  }

  search(path: string, query: string, context = 4) {
    const lines = this.get(path).split('\n');
    const q = query.toLowerCase();
    const matches: Array<{ startLine: number; endLine: number; snippet: string }> = [];

    lines.forEach((line, index) => {
      if (!line.toLowerCase().includes(q)) return;
      const start = Math.max(0, index - context);
      const end = Math.min(lines.length - 1, index + context);
      matches.push({
        startLine: start + 1,
        endLine: end + 1,
        snippet: lines
          .slice(start, end + 1)
          .map((value, offset) => `${start + offset + 1}: ${value}`)
          .join('\n'),
      });
    });

    return matches.slice(0, 8);
  }

  applyExactEdits(path: string, edits: Array<{ oldText: string; newText: string }>) {
    let content = this.get(path);
    const results: Array<{ ok: boolean; message: string }> = [];

    for (const edit of edits) {
      if (!edit.oldText) {
        results.push({ ok: false, message: 'oldText cannot be empty.' });
        continue;
      }

      const first = content.indexOf(edit.oldText);
      if (first === -1) {
        results.push({ ok: false, message: 'Exact oldText was not found. Re-read the relevant range.' });
        continue;
      }

      const second = content.indexOf(edit.oldText, first + edit.oldText.length);
      if (second !== -1) {
        results.push({ ok: false, message: 'oldText matched more than once. Use a larger unique snippet.' });
        continue;
      }

      content = content.slice(0, first) + edit.newText + content.slice(first + edit.oldText.length);
      results.push({ ok: true, message: 'Patch applied.' });
    }

    if (results.some((result) => result.ok)) {
      this.files.set(path, content);
      this.touched.add(path);
    }

    return results;
  }

  validate(path: string) {
    return validateContent(path, this.get(path));
  }

  diff(path: string) {
    return compactDiff(this.originals.get(path) ?? '', this.get(path));
  }

  changedFiles() {
    return [...this.touched].map((path) => ({
      path,
      content: this.get(path),
      diff: this.diff(path),
      validation: this.validate(path),
    }));
  }
}
