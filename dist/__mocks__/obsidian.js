// Mock Obsidian API for testing
export class TFile {
    constructor(path) {
        this.path = path;
    }
}
export class TFolder {
    constructor(path) {
        this.path = path;
    }
}
export class App {
    constructor() {
        this.vault = new Vault();
        this.metadataCache = new MetadataCache();
    }
}
export class Vault {
    constructor() {
        this.create = jest.fn();
        this.read = jest.fn();
        this.modify = jest.fn();
        this.delete = jest.fn();
        this.getAbstractFileByPath = jest.fn();
        this.getMarkdownFiles = jest.fn(() => []);
        this.on = jest.fn();
    }
}
export class MetadataCache {
    constructor() {
        this.getFileCache = jest.fn();
    }
}
export const VIEW_TYPE_BLOCK_EDITOR = 'lifewiki-block-editor';
