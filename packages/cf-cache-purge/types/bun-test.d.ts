declare module 'bun:test' {
  interface Matchers {
    not: Matchers;
    resolves: Matchers;
    rejects: Matchers;
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toThrow(expected?: string | RegExp): void;
  }

  export function describe(name: string, callback: () => void): void;
  export function expect(value: unknown): Matchers;
  export function test(name: string, callback: () => void | Promise<void>): void;
}
