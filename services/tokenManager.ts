
let globalApiKey: string | null = null;

export const tokenManager = {
  setKey: (key: string | null) => {
    globalApiKey = key;
  },
  getKey: (): string | null => {
    return globalApiKey;
  },
  clearKey: () => {
    globalApiKey = null;
  }
};
