import { tool } from 'ai';
import { z } from 'zod';
import { Workspace } from '@/lib/workspace/workspace';

export function createWorkspaceTools(workspace: Workspace) {
  return {
    inspectWorkspace: tool({
      description: 'List workspace files with lightweight metadata. Use this first.',
      inputSchema: z.object({}),
      execute: async () => workspace.list(),
    }),

    searchFile: tool({
      description: 'Search a file for text and return small matching snippets with line numbers.',
      inputSchema: z.object({
        path: z.string(),
        query: z.string().min(1),
        context: z.number().int().min(1).max(12).default(4),
      }),
      execute: async ({ path, query, context }) => workspace.search(path, query, context),
    }),

    readFileRange: tool({
      description: 'Read only a line range from a file. Keep ranges small and focused.',
      inputSchema: z.object({
        path: z.string(),
        startLine: z.number().int().positive(),
        endLine: z.number().int().positive(),
      }),
      execute: async ({ path, startLine, endLine }) => {
        if (endLine - startLine > 180) {
          return { error: 'Range too large. Read at most 180 lines; prefer 20-80.' };
        }
        return workspace.readRange(path, startLine, endLine);
      },
    }),

    applyPatch: tool({
      description: 'Apply minimal exact text replacements to an existing file. oldText must be unique and copied exactly from the file.',
      inputSchema: z.object({
        path: z.string(),
        edits: z.array(
          z.object({
            oldText: z.string().min(1),
            newText: z.string(),
          }),
        ).min(1).max(8),
      }),
      execute: async ({ path, edits }) => workspace.applyExactEdits(path, edits),
    }),

    validateFile: tool({
      description: 'Run lightweight structural validation on a file after editing it.',
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => workspace.validate(path),
    }),

    getDiff: tool({
      description: 'Show a compact diff between the original and current file. Use before finishing.',
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => workspace.diff(path),
    }),
  };
}
