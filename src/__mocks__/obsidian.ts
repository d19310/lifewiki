// Mock Obsidian API for testing
export class TFile {
  path: string;
  constructor(path: string) {
    this.path = path;
  }
}

export class TFolder {
  path: string;
  constructor(path: string) {
    this.path = path;
  }
}

export class App {
  vault: Vault;
  metadataCache: MetadataCache;

  constructor() {
    this.vault = new Vault();
    this.metadataCache = new MetadataCache();
  }
}

export class Vault {
  create = jest.fn();
  read = jest.fn();
  modify = jest.fn();
  delete = jest.fn();
  getAbstractFileByPath = jest.fn();
  getMarkdownFiles = jest.fn(() => []);
  on = jest.fn();
}

export class MetadataCache {
  getFileCache = jest.fn();
}

export const VIEW_TYPE_BLOCK_EDITOR = 'lifewiki-block-editor';

// Mock requestUrl for HTTP requests
export const requestUrl = jest.fn();

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}
