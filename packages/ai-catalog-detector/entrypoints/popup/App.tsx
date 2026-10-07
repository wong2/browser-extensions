import {
  AlertTriangle,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Code2,
  Copy,
  ExternalLink,
  FileBraces,
  Globe,
  Library,
  LoaderCircle,
  Lock,
  Puzzle,
  RefreshCw,
  SearchX,
  Server,
  ShieldAlert,
  WifiOff,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { Children, useEffect, useState, type ReactNode } from 'react';
import { artifactLabel, identifierLabel } from '@/utils/catalog';
import {
  SERVER_CARD_MEDIA_TYPE,
  type CatalogEntry,
  type RemoteEndpoint,
  type RuntimeMessage,
  type ScanResult,
  type ScanStatus,
  type ServerCard,
} from '@/utils/types';
import './App.css';

const SPEC_URL = 'https://github.com/modelcontextprotocol/experimental-ext-server-card';

type CopyHandler = (value: string) => Promise<void>;

function App() {
  const [result, setResult] = useState<ScanResult | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [copiedValue, setCopiedValue] = useState<string | undefined>();

  useEffect(() => {
    void loadScan('catalog:get-current-scan');
  }, []);

  const mcpEntries = result?.entries.filter((entry) => entry.type === SERVER_CARD_MEDIA_TYPE) ?? [];
  const otherEntries = result?.entries.filter((entry) => entry.type !== SERVER_CARD_MEDIA_TYPE) ?? [];
  const usesUpgradedOrigin = Boolean(result?.pageOrigin && result.origin && result.pageOrigin !== result.origin);
  const siteHost = getHost(result?.origin ?? result?.pageUrl);

  async function loadScan(type: RuntimeMessage['type']) {
    setIsLoading(true);
    setError(undefined);

    try {
      const response = (await browser.runtime.sendMessage({ type } satisfies RuntimeMessage)) as ScanResult;
      setResult(response);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to scan the active tab.');
    } finally {
      setIsLoading(false);
    }
  }

  async function copyValue(value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedValue(value);
    window.setTimeout(() => setCopiedValue((current) => (current === value ? undefined : current)), 1400);
  }

  return (
    <main className="app" aria-busy={isLoading}>
      <header className="topbar">
        <div className="brand">
          <h1>AI Catalog</h1>
          {siteHost || result?.host?.displayName ? (
            <p className="site-line">
              {siteHost ? <span className="site-host">{siteHost}</span> : null}
              {result?.host?.displayName ? (
                result.host.documentationUrl ? (
                  <a href={result.host.documentationUrl} target="_blank" rel="noreferrer">
                    {result.host.displayName}
                  </a>
                ) : (
                  <span>{result.host.displayName}</span>
                )
              ) : null}
            </p>
          ) : null}
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Refresh"
          title="Refresh, bypassing the cache"
          onClick={() => void loadScan('catalog:refresh-current-scan')}
          disabled={isLoading}
        >
          <RefreshCw aria-hidden size={15} className={isLoading ? 'spin' : undefined} />
        </button>
      </header>

      <div className="content">
        {error ? (
          <p className="inline-error" role="alert">
            <AlertTriangle aria-hidden size={15} />
            <span>{error}</span>
          </p>
        ) : null}

        {result ? (
          <StatusPanel result={result} copiedValue={copiedValue} onCopy={copyValue} />
        ) : isLoading ? (
          <LoadingState />
        ) : null}

        {mcpEntries.length ? (
          <EntryGroup title="MCP servers" count={mcpEntries.length}>
            {mcpEntries.map((entry, index) => (
              <ServerEntry
                key={`${entry.identifier ?? entry.sourceUrl ?? 'mcp'}-${index}`}
                entry={entry}
                defaultOpen={mcpEntries.length === 1}
                copiedValue={copiedValue}
                onCopy={copyValue}
              />
            ))}
          </EntryGroup>
        ) : null}

        {otherEntries.length ? (
          <EntryGroup title="Other artifacts" count={otherEntries.length}>
            {otherEntries.map((entry, index) => (
              <OtherEntry
                key={`${entry.identifier ?? entry.type}-${index}`}
                entry={entry}
                copiedValue={copiedValue}
                onCopy={copyValue}
              />
            ))}
          </EntryGroup>
        ) : null}
      </div>

      {result && result.status !== 'unsupported' ? (
        <footer className="footer">
          <span>
            {result.fromCache ? 'Cached' : 'Fetched'} at {formatTime(result.fetchedAt)}
          </span>
          {usesUpgradedOrigin ? <span title={`The page is ${result.pageOrigin}`}>Checked over HTTPS</span> : null}
        </footer>
      ) : null}
    </main>
  );
}

interface StatusPanelProps {
  result: ScanResult;
  copiedValue?: string;
  onCopy: CopyHandler;
}

function StatusPanel({ result, copiedValue, onCopy }: StatusPanelProps) {
  const view = getStatusView(result);
  const isFound = result.status === 'found' || result.status === 'found-with-warnings';
  const endpointHref = getHttpUrl(result.endpoint);
  const endpointParts = splitUrl(result.endpoint);
  const detail =
    !isFound && result.errorMessage && result.errorMessage !== `HTTP ${result.httpStatus}` ? result.errorMessage : undefined;

  return (
    <section className={`status status-${view.tone}`} aria-live="polite">
      <div className="status-head">
        <span className="status-icon">
          <view.Icon aria-hidden size={16} />
        </span>
        <div>
          <h2>{view.label}</h2>
          <p>{view.description(result)}</p>
        </div>
      </div>

      {result.endpoint ? (
        <div className="endpoint">
          <code title={result.endpoint}>
            {endpointParts ? (
              <>
                <span className="url-origin">{endpointParts.origin}</span>
                {endpointParts.rest}
              </>
            ) : (
              result.endpoint
            )}
          </code>
          <CopyButton value={result.endpoint} label="catalog URL" copiedValue={copiedValue} onCopy={onCopy} />
          {isFound && endpointHref ? <LinkButton href={endpointHref} label="Open catalog JSON" /> : null}
        </div>
      ) : null}

      {detail ? <p className="status-detail">{detail}</p> : null}

      {result.warnings.length ? <WarningList warnings={result.warnings} /> : null}

      {result.status === 'not-found' ? (
        <p className="status-hint">
          Sites publish one to list their MCP servers and agents.{' '}
          <a href={SPEC_URL} target="_blank" rel="noreferrer">
            How it works
          </a>
        </p>
      ) : null}
    </section>
  );
}

function LoadingState() {
  return (
    <div className="loading" aria-label="Scanning for an AI Catalog">
      <section className="status status-neutral">
        <div className="status-head">
          <span className="status-icon">
            <LoaderCircle aria-hidden size={16} className="spin" />
          </span>
          <div>
            <h2>Scanning</h2>
            <p>Looking for an AI Catalog on this site.</p>
          </div>
        </div>
      </section>
      <div className="group">
        <div className="skeleton skeleton-title" />
        <div className="entry-list">
          {[0, 1, 2].map((index) => (
            <div className="skeleton-row" key={index}>
              <div className="skeleton skeleton-avatar" />
              <div className="skeleton-lines">
                <div className="skeleton" />
                <div className="skeleton" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EntryGroup({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="group">
      <h2 className="group-title">
        {title}
        <span className="count">{count}</span>
      </h2>
      <ul className="entry-list">
        {Children.map(children, (child) => <li>{child}</li>)}
      </ul>
    </section>
  );
}

interface EntryShellProps {
  avatar: ReactNode;
  title: string;
  meta: ReactNode;
  tone?: 'warning' | 'error';
  defaultOpen?: boolean;
  children: ReactNode;
}

function EntryShell({ avatar, title, meta, tone, defaultOpen, children }: EntryShellProps) {
  return (
    <details className="entry" open={defaultOpen}>
      <summary>
        {avatar}
        <span className="entry-text">
          <span className="entry-title">{title}</span>
          <span className={`entry-meta${tone === 'error' ? ' tone-error' : ''}`}>{meta}</span>
        </span>
        {tone ? (
          <AlertTriangle aria-label={tone === 'error' ? 'Error' : 'Has warnings'} size={14} className={`entry-flag tone-${tone}`} />
        ) : null}
        <ChevronRight aria-hidden size={15} className="chevron" />
      </summary>
      <div className="entry-body">{children}</div>
    </details>
  );
}

interface EntryProps {
  entry: CatalogEntry;
  copiedValue?: string;
  onCopy: CopyHandler;
}

function ServerEntry({ entry, defaultOpen, copiedValue, onCopy }: EntryProps & { defaultOpen: boolean }) {
  const serverCard = entry.serverCard;
  const websiteHref = getHttpUrl(serverCard?.websiteUrl);
  const repositoryHref = getHttpUrl(serverCard?.repository?.url);
  const iconSrc = serverCard ? getSafeIconSrc(serverCard) : undefined;
  const description = entry.description || serverCard?.description;
  const remotes = serverCard?.remotes ?? [];
  const title =
    entry.displayName || serverCard?.title || serverCard?.name || identifierLabel(entry.identifier) || 'Unnamed server';
  const version = serverCard?.version || entry.version;
  const tone = entry.errorMessage ? 'error' : entry.warnings.length ? 'warning' : undefined;

  const meta = entry.errorMessage
    ? 'Server Card unavailable'
    : joinMeta([
        serverCard?.name && serverCard.name !== title ? serverCard.name : undefined,
        version ? `v${version}` : undefined,
        remotes.length ? pluralize(remotes.length, 'remote') : undefined,
      ]) || entry.identifier || 'MCP Server';

  return (
    <EntryShell
      avatar={<Avatar src={iconSrc} Icon={Server} />}
      title={title}
      meta={meta}
      tone={tone}
      defaultOpen={defaultOpen}
    >
      {description ? <p className="description">{description}</p> : null}

      {entry.errorMessage ? <p className="entry-error">{entry.errorMessage}</p> : null}

      <dl className="facts">
        {entry.identifier ? <Fact label="ID" value={<code>{entry.identifier}</code>} /> : null}
        {serverCard ? <Fact label="Name" value={serverCard.name || <span className="missing">Missing</span>} /> : null}
        {serverCard ? <Fact label="Version" value={serverCard.version || <span className="missing">Missing</span>} /> : null}
        <Fact
          label="Card"
          value={
            entry.sourceUrl ? (
              <span className="copy-line">
                <code>{entry.sourceUrl}</code>
                <CopyButton value={entry.sourceUrl} label="Server Card URL" copiedValue={copiedValue} onCopy={onCopy} />
              </span>
            ) : (
              'Inline in the AI Catalog'
            )
          }
        />
      </dl>

      {websiteHref || repositoryHref ? (
        <div className="link-row">
          {websiteHref ? (
            <a className="text-link" href={websiteHref} target="_blank" rel="noreferrer">
              <Globe aria-hidden size={13} />
              Website
            </a>
          ) : null}
          {repositoryHref ? (
            <a className="text-link" href={repositoryHref} target="_blank" rel="noreferrer">
              <Code2 aria-hidden size={13} />
              Repository
            </a>
          ) : null}
        </div>
      ) : null}

      {remotes.length ? (
        <div className="remotes">
          <h3>
            Remotes <span className="count">{remotes.length}</span>
          </h3>
          <ul>
            {remotes.map((remote, index) => (
              <RemoteRow key={`${remote.type}-${remote.url}-${index}`} remote={remote} copiedValue={copiedValue} onCopy={onCopy} />
            ))}
          </ul>
        </div>
      ) : null}

      {entry.warnings.length ? <WarningList warnings={entry.warnings} /> : null}
    </EntryShell>
  );
}

function RemoteRow({ remote, copiedValue, onCopy }: { remote: RemoteEndpoint; copiedValue?: string; onCopy: CopyHandler }) {
  return (
    <li className="remote">
      <div className="remote-head">
        <span className="tag">{remote.type || 'unknown'}</span>
        {remote.url ? <CopyButton value={remote.url} label="remote URL" copiedValue={copiedValue} onCopy={onCopy} /> : null}
      </div>
      <code className="remote-url">{remote.url || 'Missing URL'}</code>
      {remote.supportedProtocolVersions?.length ? (
        <p className="remote-meta">Protocol {remote.supportedProtocolVersions.join(', ')}</p>
      ) : null}
      {remote.headers?.length || remote.variables?.length ? (
        <div className="chip-row">
          {remote.headers?.map((header) => (
            <span className="chip" key={`h-${header.name}`} title={header.description}>
              {header.isSecret ? <Lock aria-label="Secret" size={11} /> : null}
              {header.name}
              {header.isRequired ? <span className="chip-note">required</span> : null}
            </span>
          ))}
          {remote.variables?.map((variable) => (
            <span className="chip" key={`v-${variable.name}`} title={variable.description}>
              {variable.isSecret ? <Lock aria-label="Secret" size={11} /> : null}
              {`{${variable.name}}`}
              {variable.isRequired ? <span className="chip-note">required</span> : null}
              {variable.default ? <span className="chip-note">= {variable.default}</span> : null}
            </span>
          ))}
        </div>
      ) : null}
    </li>
  );
}

function OtherEntry({ entry, copiedValue, onCopy }: EntryProps) {
  const href = getHttpUrl(entry.sourceUrl);
  const tone = entry.errorMessage ? 'error' : entry.warnings.length ? 'warning' : undefined;

  return (
    <EntryShell
      avatar={<Avatar Icon={artifactIcon(entry.type)} />}
      title={entry.displayName || identifierLabel(entry.identifier) || entry.type}
      meta={joinMeta([artifactLabel(entry.type), entry.version ? `v${entry.version}` : undefined, entry.inline ? 'inline' : undefined])}
      tone={tone}
    >
      {entry.description ? <p className="description">{entry.description}</p> : null}
      {entry.errorMessage ? <p className="entry-error">{entry.errorMessage}</p> : null}
      <dl className="facts">
        {entry.identifier ? <Fact label="ID" value={<code>{entry.identifier}</code>} /> : null}
        <Fact label="Type" value={<code>{entry.type}</code>} />
        <Fact
          label="Source"
          value={
            entry.sourceUrl ? (
              <span className="copy-line">
                <code>{entry.sourceUrl}</code>
                <CopyButton value={entry.sourceUrl} label="artifact URL" copiedValue={copiedValue} onCopy={onCopy} />
                {href ? <LinkButton href={href} label="Open artifact" /> : null}
              </span>
            ) : (
              'Inline in the AI Catalog'
            )
          }
        />
      </dl>
      {entry.warnings.length ? <WarningList warnings={entry.warnings} /> : null}
    </EntryShell>
  );
}

function Avatar({ src, Icon }: { src?: string; Icon: LucideIcon }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="avatar">
      {src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} /> : <Icon aria-hidden size={16} />}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function WarningList({ warnings }: { warnings: { code: string; message: string }[] }) {
  return (
    <ul className="warning-list">
      {warnings.map((warning, index) => (
        <li key={`${warning.code}-${index}`}>
          <AlertTriangle aria-hidden size={13} />
          <span>{warning.message}</span>
        </li>
      ))}
    </ul>
  );
}

interface CopyButtonProps {
  value: string;
  label: string;
  copiedValue?: string;
  onCopy: CopyHandler;
}

function CopyButton({ value, label, copiedValue, onCopy }: CopyButtonProps) {
  const copied = copiedValue === value;
  const text = copied ? `Copied ${label}` : `Copy ${label}`;
  return (
    <button
      className={`icon-button small${copied ? ' is-copied' : ''}`}
      type="button"
      aria-label={text}
      title={text}
      onClick={() => void onCopy(value)}
    >
      {copied ? <Check aria-hidden size={14} /> : <Copy aria-hidden size={13} />}
    </button>
  );
}

function LinkButton({ href, label }: { href: string; label: string }) {
  return (
    <a className="icon-button small" href={href} target="_blank" rel="noreferrer" aria-label={label} title={label}>
      <ExternalLink aria-hidden size={13} />
    </a>
  );
}

interface StatusView {
  label: string;
  description: (result: ScanResult) => string;
  tone: 'ok' | 'warning' | 'neutral' | 'error';
  Icon: LucideIcon;
}

function catalogSummary(result: ScanResult): string {
  const mcp = result.entries.filter((entry) => entry.type === SERVER_CARD_MEDIA_TYPE).length;
  const other = result.entries.length - mcp;
  if (!mcp && !other) return 'The catalog has no entries.';
  return joinMeta([
    mcp ? pluralize(mcp, 'MCP server') : 'No MCP servers',
    other ? pluralize(other, mcp ? 'other artifact' : 'artifact') : undefined,
  ]);
}

function getStatusView(result: ScanResult): StatusView {
  switch (result.status as ScanStatus) {
    case 'found':
      return { label: 'AI Catalog found', description: catalogSummary, tone: 'ok', Icon: CheckCircle2 };
    case 'found-with-warnings':
      return { label: 'Found, with warnings', description: catalogSummary, tone: 'warning', Icon: ShieldAlert };
    case 'not-found':
      return {
        label: 'No AI Catalog',
        description: (scan) => `This site does not publish one${scan.httpStatus ? ` (HTTP ${scan.httpStatus})` : ''}.`,
        tone: 'neutral',
        Icon: SearchX,
      };
    case 'invalid-json':
      return {
        label: 'Invalid JSON',
        description: () => 'The catalog endpoint responded, but the body is not JSON.',
        tone: 'error',
        Icon: AlertTriangle,
      };
    case 'invalid-catalog':
      return {
        label: 'Invalid catalog',
        description: () => 'The endpoint responded, but it is not a usable AI Catalog.',
        tone: 'error',
        Icon: AlertTriangle,
      };
    case 'timeout':
      return {
        label: 'Timed out',
        description: () => 'The site did not respond in time. Try refreshing.',
        tone: 'error',
        Icon: Clock3,
      };
    case 'network-error':
      return {
        label: 'Network error',
        description: () => 'The catalog request could not be completed. Try refreshing.',
        tone: 'error',
        Icon: WifiOff,
      };
    case 'unsupported':
      return {
        label: 'Nothing to scan',
        description: () => 'Open an http or https page to look for an AI Catalog.',
        tone: 'neutral',
        Icon: SearchX,
      };
    default:
      return { label: 'Scanning', description: () => 'Looking for an AI Catalog on this site.', tone: 'neutral', Icon: LoaderCircle };
  }
}

function artifactIcon(type: string): LucideIcon {
  if (type.includes('agent-card')) return Bot;
  if (type.includes('agent-skills')) return Wrench;
  if (type.includes('agent-plugins')) return Puzzle;
  if (type.includes('ai-catalog')) return Library;
  if (type.includes('markdown') || type.endsWith('+md')) return BookOpen;
  return FileBraces;
}

function joinMeta(parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join(' · ');
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

function getHost(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.host : undefined;
  } catch {
    return undefined;
  }
}

function splitUrl(value: string | undefined): { origin: string; rest: string } | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return { origin: url.host, rest: value.slice(value.indexOf(url.host) + url.host.length) };
  } catch {
    return undefined;
  }
}

function getHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function getSafeIconSrc(card: ServerCard): string | undefined {
  for (const icon of card.icons ?? []) {
    if (/^data:image\/svg/i.test(icon.src)) continue;
    if (icon.mimeType?.toLowerCase() === 'image/svg+xml') continue;
    if (/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(icon.src)) return icon.src;
    if (!isHttpUrl(icon.src)) continue;
    if (icon.mimeType && !['image/png', 'image/jpeg', 'image/webp'].includes(icon.mimeType.toLowerCase())) continue;
    return icon.src;
  }
  return undefined;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export default App;
