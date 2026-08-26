import type {
  JsonValue,
  ToolAnnotations,
  ToolInfo,
} from '@/utils/protocol';

export type ClassifiedToolError =
  | {
      status: 'blocked';
      reason: 'permissions-policy' | 'origin-isolation';
      errorName: 'NotAllowedError' | 'SecurityError';
      message?: string;
    }
  | {
      status: 'restricted';
      reason: 'document-inactive' | 'scan-failed';
      errorName?: string;
      message?: string;
    };

interface IndexedTool extends Omit<ToolInfo, 'key' | 'index'> {
  sourceIndex: number;
}

export function normalizeTools(
  tools: readonly WebMcpPageTool[],
  fallbackOrigin: string,
): ToolInfo[] {
  const normalized = tools.flatMap<IndexedTool>((tool, sourceIndex) => {
    const name = readString(tool, 'name')?.trim();
    if (!name) return [];

    const title = readString(tool, 'title');
    const description = readString(tool, 'description');
    const inputSchema = normalizeJsonValue(readProperty(tool, 'inputSchema'));
    const annotations = normalizeAnnotations(readProperty(tool, 'annotations'));
    const origin = resolveToolOrigin(tool, fallbackOrigin);

    return [{
      sourceIndex,
      name,
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(inputSchema !== undefined ? { inputSchema } : {}),
      ...(annotations ? { annotations } : {}),
      origin,
    }];
  });

  normalized.sort((left, right) => (
    left.name.localeCompare(right.name, 'en', { sensitivity: 'base' })
    || left.origin.localeCompare(right.origin)
    || left.sourceIndex - right.sourceIndex
  ));

  return normalized.map(({ sourceIndex: _sourceIndex, ...tool }, index) => ({
    ...tool,
    index,
    key: JSON.stringify([tool.origin, tool.name, index]),
  }));
}

export function classifyToolError(error: unknown): ClassifiedToolError {
  const errorName = readErrorName(error);
  const message = readErrorMessage(error);

  if (errorName === 'NotAllowedError') {
    return {
      status: 'blocked',
      reason: 'permissions-policy',
      errorName,
      ...(message ? { message } : {}),
    };
  }

  if (errorName === 'SecurityError') {
    return {
      status: 'blocked',
      reason: 'origin-isolation',
      errorName,
      ...(message ? { message } : {}),
    };
  }

  if (errorName === 'InvalidStateError') {
    return {
      status: 'restricted',
      reason: 'document-inactive',
      errorName,
      ...(message ? { message } : {}),
    };
  }

  return {
    status: 'restricted',
    reason: 'scan-failed',
    ...(errorName ? { errorName } : {}),
    ...(message ? { message } : {}),
  };
}

function normalizeAnnotations(value: unknown): ToolAnnotations | undefined {
  if (!isRecord(value)) return undefined;

  const readOnlyHint = value.readOnlyHint;
  const untrustedContentHint = value.untrustedContentHint;
  const annotations: ToolAnnotations = {};

  if (typeof readOnlyHint === 'boolean') annotations.readOnlyHint = readOnlyHint;
  if (typeof untrustedContentHint === 'boolean') {
    annotations.untrustedContentHint = untrustedContentHint;
  }

  return Object.keys(annotations).length > 0 ? annotations : undefined;
}

function normalizeJsonValue(value: unknown): JsonValue | undefined {
  if (typeof value === 'string') {
    try {
      return normalizeJsonValue(JSON.parse(value)) ?? value;
    } catch {
      return value;
    }
  }

  return cloneJsonValue(value, new WeakSet<object>());
}

function cloneJsonValue(
  value: unknown,
  seen: WeakSet<object>,
): JsonValue | undefined {
  if (value === null) return null;
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'object') return undefined;
  if (seen.has(value)) return undefined;

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const result: JsonValue[] = [];
      for (const item of value) {
        const normalized = cloneJsonValue(item, seen);
        if (normalized !== undefined) result.push(normalized);
      }
      return result;
    }

    const result: { [key: string]: JsonValue } = {};
    for (const [key, item] of Object.entries(value)) {
      const normalized = cloneJsonValue(item, seen);
      if (normalized !== undefined) {
        Object.defineProperty(result, key, {
          value: normalized,
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
    }
    return result;
  } catch {
    return undefined;
  } finally {
    seen.delete(value);
  }
}

function resolveToolOrigin(tool: WebMcpPageTool, fallbackOrigin: string): string {
  const explicitOrigin = readString(tool, 'origin');
  if (explicitOrigin) return explicitOrigin;

  try {
    const ownerWindow = readProperty(tool, 'window');
    if (ownerWindow && typeof ownerWindow === 'object' && 'location' in ownerWindow) {
      const origin = (ownerWindow as WindowProxy).location.origin;
      if (origin) return origin;
    }
  } catch {
    // Cross-origin WindowProxy access can throw. The explicit origin normally covers it.
  }

  return fallbackOrigin;
}

function readProperty(value: object, key: string): unknown {
  try {
    return (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

function readString(value: object, key: string): string | undefined {
  const property = readProperty(value, key);
  return typeof property === 'string' ? property : undefined;
}

function readErrorName(error: unknown): string | undefined {
  return isRecord(error) && typeof error.name === 'string' ? error.name : undefined;
}

function readErrorMessage(error: unknown): string | undefined {
  return isRecord(error) && typeof error.message === 'string' ? error.message : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
