/**
 * Polyfills for Node.js modules used by LangGraph
 * These are minimal implementations for browser environments
 */

// AsyncLocalStorage - provides context storage without async_hooks
// For browser/Obsidian environment, we use a simple Map-based storage
export class AsyncLocalStorage<T> {
	private storage = new Map<string, T>();

	run<R>(store: T, callback: (...args: any[]) => R, ...args: any[]): R {
		const id = Math.random().toString(36);
		this.storage.set(id, store);
		try {
			return callback(...args);
		} finally {
			this.storage.delete(id);
		}
	}

	getStore(): T | undefined {
		// In a single-threaded browser context, we just return undefined
		// This is a simplification - proper implementation would need context tracking
		return undefined;
	}

	enterWith(_store: T): void {
		// No-op for browser compatibility
	}
}

// Mock for node:async_hooks
export const createHook = () => {};
export const AsyncResource = class AsyncResource {
	constructor() {}
	bind<T>(_fn: T): T {
		return _fn;
	}
	runInAsyncScope<T>(_fn: (...args: any[]) => T, _this?: any, ..._args: any[]): T {
		return _fn.call(_this, ..._args);
	}
};
