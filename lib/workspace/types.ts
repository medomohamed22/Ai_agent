export type WorkspaceFile = {
  path: string;
  content: string;
};

export type ProviderSettings =
  | {
      type: 'gateway';
      model: string;
    }
  | {
      type: 'openai-compatible';
      name: string;
      baseURL: string;
      apiKey: string;
      model: string;
    };
