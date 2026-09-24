interface RuleSource {
  id: number;
  fromScheme?: string;
  fromHost: string;
  fromPath: string;
  isWildcard: boolean;
}

export interface UrlRedirectRule extends RuleSource {
  type: 'url';
  toScheme?: string;
  toHost: string;
  toPath: string;
}

export interface QueryRedirectRule extends RuleSource {
  type: 'query';
  queryParam: string;
}

export type RedirectRule = UrlRedirectRule | QueryRedirectRule;

interface ParsedUrl {
  scheme?: string;
  host: string;
  path: string;
}

function parseUrl(raw: string): ParsedUrl {
  const protocolMatch = raw.match(/^(https?):\/\//);
  const scheme = protocolMatch ? protocolMatch[1] : undefined;
  const withoutProtocol = scheme ? raw.slice(scheme.length + 3) : raw;
  const slashIndex = withoutProtocol.indexOf('/');
  if (slashIndex === -1) {
    return { scheme, host: withoutProtocol, path: '/' };
  }
  return {
    scheme,
    host: withoutProtocol.slice(0, slashIndex),
    path: withoutProtocol.slice(slashIndex),
  };
}

/**
 * Parse a path pattern like /package/:slug or /package/:slug*
 * into a regex string and a substitution template.
 *
 * Named segments (:name) match a single path segment [^/]+
 * Wildcard named segments (:name*) match the rest of the path .+
 */
function buildPathRegexAndTemplate(
  fromPath: string,
  toPath: string,
  groupOffset: number = 0
): { pathRegex: string; pathSubstitution: string } {
  // Collect named groups from the from-pattern
  const paramRegex = /:(\w+)(\*)?/g;
  let groupIndex = 1 + groupOffset;
  const groupMap: Record<string, number> = {};

  const pathRegex = fromPath.replace(paramRegex, (_, name, wildcard) => {
    groupMap[name] = groupIndex++;
    return wildcard ? '(.+)' : '([^/]+)';
  });

  const pathSubstitution = toPath.replace(paramRegex, (_, name, _wildcard) => {
    const idx = groupMap[name];
    return idx !== undefined ? `\\${idx}` : '';
  });

  return { pathRegex, pathSubstitution };
}

export function parseRules(text: string): RedirectRule[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const rules: RedirectRule[] = [];

  for (const [i, line] of lines.entries()) {
    if (line.startsWith('#')) continue;
    const parts = line.split('=>').map((s) => s.trim());
    if (parts.length !== 2) continue;

    const [fromText, toText] = parts;
    if (fromText === undefined || toText === undefined) continue;

    const from = parseUrl(fromText);
    if (toText.startsWith('query:')) {
      const queryParam = toText.slice('query:'.length);
      if (!queryParam || /\s/.test(queryParam)) continue;
      rules.push({
        id: i + 1,
        type: 'query',
        fromScheme: from.scheme,
        fromHost: from.host,
        fromPath: from.path,
        isWildcard: from.path.includes(':') && from.path.includes('*'),
        queryParam,
      });
      continue;
    }
    const to = parseUrl(toText);

    const hasWildcard = from.path.includes(':') && from.path.includes('*');

    rules.push({
      id: i + 1,
      type: 'url',
      fromScheme: from.scheme,
      fromHost: from.host,
      fromPath: from.path,
      toScheme: to.scheme,
      toHost: to.host,
      toPath: to.path,
      isWildcard: hasWildcard,
    });
  }

  return rules;
}

export function buildDNRRules(
  rules: RedirectRule[]
): Browser.declarativeNetRequest.Rule[] {
  return rules.filter((rule) => rule.type === 'url').map((rule) => {
    // When no fromScheme, capture it with (https?) as group 1, shifting path groups by 1
    const captureScheme = !rule.fromScheme;
    const groupOffset = captureScheme ? 1 : 0;

    const { pathRegex, pathSubstitution } = buildPathRegexAndTemplate(
      rule.fromPath,
      rule.toPath,
      groupOffset
    );

    const schemePart = captureScheme
      ? '(https?)'
      : escapeRegex(rule.fromScheme!);
    const regexFilter = `^${schemePart}://${escapeRegex(rule.fromHost)}${pathRegex}$`;

    // Build substitution scheme
    let schemePrefix: string;
    if (rule.toScheme) {
      schemePrefix = `${rule.toScheme}://`;
    } else if (captureScheme) {
      schemePrefix = '\\1://';
    } else {
      schemePrefix = `${rule.fromScheme}://`;
    }
    const regexSubstitution = `${schemePrefix}${rule.toHost}${pathSubstitution}`;

    return {
      id: rule.id,
      priority: 1,
      action: {
        type: browser.declarativeNetRequest.RuleActionType.REDIRECT,
        redirect: {
          regexSubstitution,
        },
      },
      condition: {
        regexFilter,
        resourceTypes: [
          browser.declarativeNetRequest.ResourceType.MAIN_FRAME,
        ],
      },
    } as Browser.declarativeNetRequest.Rule;
  });
}

/** Resolve one query redirect, decoding the parameter exactly once. */
export function getQueryRedirectUrl(rawUrl: string, rules: RedirectRule[]): string | undefined {
  let source: URL;
  try {
    source = new URL(rawUrl);
  } catch {
    return;
  }
  if (!['http:', 'https:'].includes(source.protocol)) return;

  for (const rule of rules) {
    if (rule.type !== 'query') continue;
    if (rule.fromScheme && source.protocol !== `${rule.fromScheme}:`) continue;
    if (source.host.toLowerCase() !== rule.fromHost.toLowerCase()) continue;

    // Match only the pathname; parameter order and extra query values don't matter.
    const pattern = rule.fromPath.split(/(:\w+\*?)/).map((part) => {
      if (/^:\w+\*$/.test(part)) return '.+';
      if (/^:\w+$/.test(part)) return '[^/]+';
      return escapeRegex(part);
    }).join('');
    if (!new RegExp(`^${pattern}$`).test(source.pathname)) continue;

    const value = source.searchParams.get(rule.queryParam);
    if (!value) continue;
    try {
      const target = new URL(value);
      if (!['http:', 'https:'].includes(target.protocol)) continue;
      if (target.href === source.href) continue;
      return target.href;
    } catch {
      // Missing, relative, or malformed destinations leave navigation unchanged.
    }
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const STORAGE_KEY = 'redirector_rules';
