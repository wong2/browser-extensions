import {
  AlertTriangle,
  Check,
  ChevronRight,
  Clock3,
  Code2,
  Copy,
  ExternalLink,
  Globe,
  LoaderCircle,
  Lock,
  RefreshCw,
  SearchX,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { Children, useEffect, useState, type ReactNode } from 'react';
import { artifactLabel, identifierLabel, requiresAuth, transportLabel } from '@/utils/catalog';
import {
  SERVER_CARD_MEDIA_TYPE,
  type CatalogEntry,
  type RemoteEndpoint,
  type RuntimeMessage,
  type ScanResult,
  type ScanStatus,
  type ScanWarning,
  type ServerCard,
} from '@/utils/types';
import './App.css';

const SPEC_URL = 'https://github.com/modelcontextprotocol/experimental-ext-server-card';

type CopyHandler = (value: string) => Promise<void>;

interface CopyProps {
  copiedValue?: string;
  onCopy: CopyHandler;
}

function App() {
  const [result, setResult] = useState<ScanResult | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [copiedValue, setCopiedValue] = useState<string | undefined>();

  useEffect(() => {
    void loadScan('catalog:get-current-scan');
  }, []);

  const isFound = result?.status === 'found' || result?.status === 'found-with-warnings';
  const mcpEntries = result?.entries.filter((entry) => entry.type === SERVER_CARD_MEDIA_TYPE) ?? [];
  const otherEntries = result?.entries.filter((entry) => entry.type !== SERVER_CARD_MEDIA_TYPE) ?? [];
  const siteHost = getHost(result?.origin ?? result?.pageUrl);
  const copy = { copiedValue, onCopy: copyValue };

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

  const refreshTitle = result
    ? `Refresh (${result.fromCache ? 'cached' : 'fetched'} at ${formatTime(result.fetchedAt)})`
    : 'Refresh';

  return (
    <main className="app" aria-busy={isLoading}>
      <header className="topbar">
        <div className="brand">
          <h1>{siteHost ?? 'AI Catalog'}</h1>
          {result?.host?.displayName ? (
            <p className="site-line">
              {result.host.documentationUrl ? (
                <a href={result.host.documentationUrl} target="_blank" rel="noreferrer">
                  {result.host.displayName}
                </a>
              ) : (
                result.host.displayName
              )}
            </p>
          ) : null}
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label={refreshTitle}
          title={refreshTitle}
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

        {!result && isLoading ? <LoadingState /> : null}

        {result && (!isFound || !result.entries.length) ? <StatusPanel result={result} {...copy} /> : null}

        {mcpEntries.length ? (
          <EntryGroup title="MCP servers" count={mcpEntries.length}>
            {mcpEntries.map((entry, index) => (
              <ServerEntry
                key={`${entry.identifier ?? entry.sourceUrl ?? 'mcp'}-${index}`}
                entry={entry}
                defaultOpen={mcpEntries.length === 1}
                {...copy}
              />
            ))}
          </EntryGroup>
        ) : null}

        {otherEntries.length ? (
          <EntryGroup title="Other artifacts" count={otherEntries.length}>
            {otherEntries.map((entry, index) => (
              <OtherEntry key={`${entry.identifier ?? entry.type}-${index}`} entry={entry} {...copy} />
            ))}
          </EntryGroup>
        ) : null}

        {result && isFound ? <CatalogDetails result={result} {...copy} /> : null}
      </div>
    </main>
  );
}

function StatusPanel({ result, copiedValue, onCopy }: { result: ScanResult } & CopyProps) {
  const view = getStatusView(result);
  const isFound = result.status === 'found' || result.status === 'found-with-warnings';
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

      {!isFound && result.endpoint ? <EndpointRow endpoint={result.endpoint} copiedValue={copiedValue} onCopy={onCopy} /> : null}

      {detail ? <p className="status-detail">{detail}</p> : null}

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

function EndpointRow({ endpoint, openable, copiedValue, onCopy }: { endpoint: string; openable?: boolean } & CopyProps) {
  const parts = splitUrl(endpoint);
  const href = getHttpUrl(endpoint);
  return (
    <div className="endpoint">
      <code title={endpoint}>
        {parts ? (
          <>
            <span className="url-origin">{parts.origin}</span>
            {parts.rest}
          </>
        ) : (
          endpoint
        )}
      </code>
      <CopyButton value={endpoint} label="catalog URL" copiedValue={copiedValue} onCopy={onCopy} />
      {openable && href ? <LinkButton href={href} label="Open catalog JSON" /> : null}
    </div>
  );
}

function CatalogDetails({ result, copiedValue, onCopy }: { result: ScanResult } & CopyProps) {
  const usesUpgradedOrigin = Boolean(result.pageOrigin && result.origin && result.pageOrigin !== result.origin);
  return (
    <details className="disclosure catalog-details">
      <DisclosureSummary label="Catalog details" warnings={result.warnings.length} />
      <div className="disclosure-body">
        {result.endpoint ? <EndpointRow endpoint={result.endpoint} openable copiedValue={copiedValue} onCopy={onCopy} /> : null}
        <dl className="facts">
          {result.specVersion ? <Fact label="Spec" value={result.specVersion} /> : null}
          <Fact label={result.fromCache ? 'Cached' : 'Fetched'} value={formatTime(result.fetchedAt)} />
          {usesUpgradedOrigin ? <Fact label="Origin" value={`Checked over HTTPS for ${result.pageOrigin}`} /> : null}
        </dl>
        {result.warnings.length ? <WarningList warnings={result.warnings} /> : null}
      </div>
    </details>
  );
}

function TechnicalDetails({ warnings, children }: { warnings: ScanWarning[]; children: ReactNode }) {
  return (
    <details className="disclosure">
      <DisclosureSummary label="Technical details" warnings={warnings.length} />
      <div className="disclosure-body">
        <dl className="facts">{children}</dl>
        {warnings.length ? <WarningList warnings={warnings} /> : null}
      </div>
    </details>
  );
}

function DisclosureSummary({ label, warnings }: { label: string; warnings: number }) {
  return (
    <summary>
      <ChevronRight aria-hidden size={13} className="chevron" />
      {label}
      {warnings ? (
        <span className="warning-count">
          <AlertTriangle aria-hidden size={12} />
          {pluralize(warnings, 'warning')}
        </span>
      ) : null}
    </summary>
  );
}

function LoadingState() {
  return (
    <div className="group" aria-label="Scanning for an AI Catalog">
      <div className="skeleton skeleton-title" />
      <div className="entry-list">
        {[0, 1, 2].map((index) => (
          <div className="skeleton-row" key={index}>
            <div className="skeleton-lines">
              <div className="skeleton" />
              <div className="skeleton" />
            </div>
          </div>
        ))}
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
      <ul className="entry-list">{Children.map(children, (child) => <li>{child}</li>)}</ul>
    </section>
  );
}

interface EntryShellProps {
  iconSrc?: string;
  title: string;
  meta: ReactNode;
  tone?: 'warning' | 'error';
  defaultOpen?: boolean;
  children: ReactNode;
}

function EntryShell({ iconSrc, title, meta, tone, defaultOpen, children }: EntryShellProps) {
  return (
    <details className="entry" open={defaultOpen}>
      <summary>
        {iconSrc ? <ServerIcon src={iconSrc} /> : null}
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

function ServerEntry({ entry, defaultOpen, copiedValue, onCopy }: { entry: CatalogEntry; defaultOpen: boolean } & CopyProps) {
  const serverCard = entry.serverCard;
  const websiteHref = getHttpUrl(serverCard?.websiteUrl);
  const repositoryHref = getHttpUrl(serverCard?.repository?.url);
  const description = entry.description || serverCard?.description;
  const remotes = serverCard?.remotes ?? [];
  const protocols = [...new Set(remotes.flatMap((remote) => remote.supportedProtocolVersions ?? []))].sort().reverse();
  const title =
    entry.displayName || serverCard?.title || serverCard?.name || identifierLabel(entry.identifier) || 'Unnamed server';
  const tone = entry.errorMessage ? 'error' : entry.warnings.length ? 'warning' : undefined;

  const meta = entry.errorMessage
    ? 'Server Card unavailable'
    : remotes.length
      ? joinMeta([
          [...new Set(remotes.map((remote) => transportLabel(remote.type)))].join(' / '),
          remotes.some(requiresAuth) ? 'Auth required' : undefined,
        ])
      : 'No remote endpoint';

  return (
    <EntryShell
      iconSrc={serverCard ? getSafeIconSrc(serverCard) : undefined}
      title={title}
      meta={meta}
      tone={tone}
      defaultOpen={defaultOpen}
    >
      {description ? <p className="description">{description}</p> : null}

      {entry.errorMessage ? <p className="entry-error">{entry.errorMessage}</p> : null}

      {remotes.length ? (
        <ul className="remotes">
          {remotes.map((remote, index) => (
            <RemoteRow key={`${remote.type}-${remote.url}-${index}`} remote={remote} copiedValue={copiedValue} onCopy={onCopy} />
          ))}
        </ul>
      ) : null}

      {websiteHref || repositoryHref ? (
        <div className="action-row">
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

      <TechnicalDetails warnings={entry.warnings}>
        {entry.identifier ? <Fact label="ID" value={<code>{entry.identifier}</code>} /> : null}
        {serverCard ? <Fact label="Name" value={serverCard.name || <span className="missing">Missing</span>} /> : null}
        {serverCard ? <Fact label="Version" value={serverCard.version || <span className="missing">Missing</span>} /> : null}
        {protocols.length ? <Fact label="Protocol" value={protocols.join(', ')} /> : null}
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
      </TechnicalDetails>
    </EntryShell>
  );
}

function RemoteRow({ remote, copiedValue, onCopy }: { remote: RemoteEndpoint } & CopyProps) {
  const chips = [
    ...(remote.headers ?? []).map((header) => ({
      key: `h-${header.name}`,
      label: header.name,
      secret: header.isSecret,
      note: header.isRequired ? 'required' : undefined,
      description: header.description,
    })),
    ...(remote.variables ?? []).map((variable) => ({
      key: `v-${variable.name}`,
      label: `{${variable.name}}`,
      secret: variable.isSecret,
      note: variable.default ? `= ${variable.default}` : variable.isRequired ? 'required' : undefined,
      description: variable.description,
    })),
  ];

  return (
    <li className="remote">
      <div className="remote-line">
        <span className="tag">{transportLabel(remote.type)}</span>
        <code title={remote.url}>{remote.url || 'Missing URL'}</code>
        {remote.url ? <CopyButton value={remote.url} label="server URL" copiedValue={copiedValue} onCopy={onCopy} /> : null}
      </div>
      {chips.length ? (
        <div className="chip-row">
          {chips.map((chip) => (
            <span className="chip" key={chip.key} title={chip.description}>
              {chip.secret ? <Lock aria-label="Secret" size={11} /> : null}
              {chip.label}
              {chip.note ? <span className="chip-note">{chip.note}</span> : null}
            </span>
          ))}
        </div>
      ) : null}
    </li>
  );
}

function OtherEntry({ entry, copiedValue, onCopy }: { entry: CatalogEntry } & CopyProps) {
  const href = getHttpUrl(entry.sourceUrl);
  const tone = entry.errorMessage ? 'error' : entry.warnings.length ? 'warning' : undefined;

  return (
    <EntryShell
      title={entry.displayName || identifierLabel(entry.identifier) || entry.type}
      meta={joinMeta([artifactLabel(entry.type), entry.version ? `v${entry.version}` : undefined])}
      tone={tone}
    >
      {entry.description ? <p className="description">{entry.description}</p> : null}
      {entry.errorMessage ? <p className="entry-error">{entry.errorMessage}</p> : null}
      {href ? (
        <div className="action-row">
          <a className="text-link" href={href} target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden size={13} />
            Open
          </a>
        </div>
      ) : null}
      <TechnicalDetails warnings={entry.warnings}>
        {entry.identifier ? <Fact label="ID" value={<code>{entry.identifier}</code>} /> : null}
        <Fact label="Type" value={<code>{entry.type}</code>} />
        <Fact
          label="Source"
          value={
            entry.sourceUrl ? (
              <span className="copy-line">
                <code>{entry.sourceUrl}</code>
                <CopyButton value={entry.sourceUrl} label="artifact URL" copiedValue={copiedValue} onCopy={onCopy} />
              </span>
            ) : (
              'Inline in the AI Catalog'
            )
          }
        />
      </TechnicalDetails>
    </EntryShell>
  );
}

function ServerIcon({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? null : <img className="server-icon" src={src} alt="" onError={() => setFailed(true)} />;
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function WarningList({ warnings }: { warnings: ScanWarning[] }) {
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

function CopyButton({ value, label, copiedValue, onCopy }: { value: string; label: string } & CopyProps) {
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
  tone: 'warning' | 'neutral' | 'error';
  Icon: LucideIcon;
}

function getStatusView(result: ScanResult): StatusView {
  switch (result.status as ScanStatus) {
    case 'found':
    case 'found-with-warnings':
      return { label: 'Empty catalog', description: () => 'The AI Catalog has no entries.', tone: 'neutral', Icon: SearchX };
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

function splitUrl(value: string): { origin: string; rest: string } | undefined {
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
