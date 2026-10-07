import {
  SERVER_CARD_SCHEMA_URL,
  type RemoteEndpoint,
  type RemoteVariable,
  type ScanWarning,
  type ServerCard,
  type ServerCardIcon,
} from './types';

const NAME_PATTERN = /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/;
const REMOTE_URL_PATTERN = /^(https?:\/\/[^\s]+|\{[a-zA-Z_][a-zA-Z0-9_]*\}[^\s]*)$/;
const REMOTE_TYPES = new Set(['streamable-http', 'sse']);
const SCHEMA_PATTERN = /^https:\/\/static\.modelcontextprotocol\.io\/schemas\/v1\/server-card\.schema\.json$/;

export function parseServerCard(value: unknown): { card?: ServerCard; warnings: ScanWarning[] } {
  const warnings: ScanWarning[] = [];

  if (!isPlainObject(value)) {
    return {
      warnings: [
        {
          code: 'schema',
          message: 'Server Card must be a JSON object.',
        },
      ],
    };
  }

  const card: ServerCard = {};
  const schema = readString(value.$schema);
  if (!schema) {
    warnings.push({ code: 'required-field', message: 'Missing required field: $schema.' });
  } else if (!SCHEMA_PATTERN.test(schema)) {
    warnings.push({
      code: 'schema',
      message: `$schema must be ${SERVER_CARD_SCHEMA_URL}.`,
    });
  } else {
    card.$schema = schema;
  }

  const name = readString(value.name);
  if (!name) {
    warnings.push({ code: 'required-field', message: 'Missing required field: name.' });
  } else {
    card.name = name;
    if (name.length < 3 || name.length > 200 || !NAME_PATTERN.test(name)) {
      warnings.push({
        code: 'schema',
        message: 'name must be a reverse-DNS identifier with one slash, such as com.example/weather.',
      });
    }
  }

  const version = readString(value.version);
  if (!version) {
    warnings.push({ code: 'required-field', message: 'Missing required field: version.' });
  } else {
    card.version = version;
    if (version.length > 255) {
      warnings.push({ code: 'schema', message: 'version must be 255 characters or fewer.' });
    } else if (isVersionRange(version)) {
      warnings.push({ code: 'schema', message: 'version must be a concrete version, not a range.' });
    }
  }

  const description = readString(value.description);
  if (!description) {
    warnings.push({ code: 'required-field', message: 'Missing required field: description.' });
  } else {
    card.description = description;
    if (description.length > 100) {
      warnings.push({ code: 'schema', message: 'description must be 100 characters or fewer.' });
    }
  }

  const title = readString(value.title);
  if (value.title !== undefined && !title) {
    warnings.push({ code: 'schema', message: 'title must be a non-empty string when present.' });
  } else if (title) {
    card.title = title;
    if (title.length > 100) {
      warnings.push({ code: 'schema', message: 'title must be 100 characters or fewer.' });
    }
  }

  if (value.websiteUrl !== undefined) {
    if (typeof value.websiteUrl !== 'string' || !isHttpUrl(value.websiteUrl)) {
      warnings.push({ code: 'schema', message: 'websiteUrl must be an HTTP(S) URL.' });
    } else {
      card.websiteUrl = value.websiteUrl;
    }
  }

  if (value.repository !== undefined) {
    if (!isPlainObject(value.repository)) {
      warnings.push({ code: 'schema', message: 'repository must be an object when present.' });
    } else {
      card.repository = sanitizeRepository(value.repository, warnings);
    }
  }

  if (value.icons !== undefined) {
    if (!Array.isArray(value.icons)) {
      warnings.push({ code: 'schema', message: 'icons must be an array when present.' });
    } else {
      const icons = value.icons
        .filter(isPlainObject)
        .map((icon) => sanitizeIcon(icon, warnings))
        .filter((icon): icon is ServerCardIcon => Boolean(icon));
      if (icons.length > 0) card.icons = icons;
    }
  }

  if (value.remotes !== undefined && !Array.isArray(value.remotes)) {
    warnings.push({ code: 'remote', message: 'remotes must be an array when present.' });
  } else if (Array.isArray(value.remotes)) {
    card.remotes = value.remotes.map((remote, index) => sanitizeRemote(remote, index, warnings));
  }

  return { card, warnings };
}

function sanitizeRepository(
  value: Record<string, unknown>,
  warnings: ScanWarning[],
): ServerCard['repository'] {
  const repository: NonNullable<ServerCard['repository']> = {};

  if (typeof value.url !== 'string' || !isHttpUrl(value.url)) {
    warnings.push({ code: 'schema', message: 'repository.url must be an HTTP(S) URL.' });
  } else {
    repository.url = value.url;
  }

  if (!readString(value.source)) {
    warnings.push({ code: 'schema', message: 'repository.source is required.' });
  } else {
    repository.source = readString(value.source);
  }

  const subfolder = readString(value.subfolder);
  if (value.subfolder !== undefined && !subfolder) {
    warnings.push({ code: 'schema', message: 'repository.subfolder must be a string when present.' });
  } else if (subfolder) {
    repository.subfolder = subfolder;
  }

  const id = readString(value.id);
  if (id) repository.id = id;

  return repository;
}

function sanitizeIcon(value: Record<string, unknown>, warnings: ScanWarning[]): ServerCardIcon | undefined {
  if (typeof value.src !== 'string' || !isRenderableIconSrc(value.src)) {
    warnings.push({
      code: 'schema',
      message: 'An icon was omitted because its src is not an HTTP(S) URL or a raster data URI.',
    });
    return undefined;
  }

  const icon: ServerCardIcon = { src: value.src };
  if (Array.isArray(value.sizes)) {
    icon.sizes = value.sizes.filter((size): size is string => typeof size === 'string');
  }
  if (typeof value.mimeType === 'string') icon.mimeType = value.mimeType;
  if (value.theme === 'light' || value.theme === 'dark') icon.theme = value.theme;
  return icon;
}

function sanitizeRemote(value: unknown, index: number, warnings: ScanWarning[]): RemoteEndpoint {
  const label = `Remote #${index + 1}`;
  if (!isPlainObject(value)) {
    warnings.push({ code: 'remote', message: `${label} must be an object.` });
    return { type: '', url: '' };
  }

  const type = readString(value.type) ?? '';
  const url = readString(value.url) ?? '';
  const remote: RemoteEndpoint = { type, url };

  if (!REMOTE_TYPES.has(type)) {
    warnings.push({
      code: 'remote',
      message: `${label} type must be streamable-http or sse.`,
    });
  }

  if (!url) {
    warnings.push({ code: 'remote', message: `${label} is missing url.` });
  } else if (!REMOTE_URL_PATTERN.test(url)) {
    warnings.push({
      code: 'remote',
      message: `${label} URL must be an HTTP(S) URL or a {template} variable.`,
    });
  }

  if (value.supportedProtocolVersions !== undefined) {
    if (!Array.isArray(value.supportedProtocolVersions)) {
      warnings.push({ code: 'remote', message: `${label} supportedProtocolVersions must be an array.` });
    } else {
      remote.supportedProtocolVersions = value.supportedProtocolVersions.filter(
        (version): version is string => typeof version === 'string',
      );
    }
  }

  if (value.headers !== undefined) {
    if (!Array.isArray(value.headers)) {
      warnings.push({ code: 'remote', message: `${label} headers must be an array.` });
    } else {
      remote.headers = value.headers.filter(isPlainObject).flatMap((header) => {
        const name = readString(header.name);
        if (!name) return [];
        const requirement: NonNullable<RemoteEndpoint['headers']>[number] = { name };
        const description = readString(header.description);
        if (description) requirement.description = description;
        if (header.isRequired === true) requirement.isRequired = true;
        if (header.isSecret === true) requirement.isSecret = true;
        return [requirement];
      });
    }
  }

  if (value.variables !== undefined) {
    if (!isPlainObject(value.variables)) {
      warnings.push({ code: 'remote', message: `${label} variables must be an object.` });
    } else {
      remote.variables = Object.entries(value.variables).flatMap(([name, input]) => {
        if (!isPlainObject(input)) return [];
        const variable: RemoteVariable = { name };
        const description = readString(input.description);
        if (description) variable.description = description;
        if (input.isRequired === true) variable.isRequired = true;
        if (input.isSecret === true) variable.isSecret = true;
        if (input.isSecret !== true) {
          const fallback = readString(input.default);
          if (fallback) variable.default = fallback;
        }
        return [variable];
      });
    }
  }

  return remote;
}

function isVersionRange(version: string): boolean {
  return /[\^~><*]/.test(version) || /(^|\.)[xX](\.|$)/.test(version);
}

function isRenderableIconSrc(src: string): boolean {
  if (/^data:image\/svg/i.test(src)) return false;
  if (/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(src)) return true;
  return isHttpUrl(src);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password;
  } catch {
    return false;
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
