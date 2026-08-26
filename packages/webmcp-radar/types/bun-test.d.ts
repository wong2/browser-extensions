declare module 'bun:test' {
  interface Matchers {
    not: Matchers;
    toBe(expected: unknown): void;
    toContain(expected: unknown): void;
    toEqual(expected: unknown): void;
    toHaveLength(expected: number): void;
    toMatchObject(expected: object): void;
    toThrow(): void;
  }

  export function describe(name: string, callback: () => void): void;
  export function expect(value: unknown): Matchers;
  export function test(name: string, callback: () => void | Promise<void>): void;
}
