import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Clock3,
  Code2,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  SearchX,
  ShieldAlert,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
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

function App() {
  const [result, setResult] = useState<ScanResult | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [copiedValue, setCopiedValue] = useState<string | undefined>();

  useEffect(() => {
    void loadScan('catalog:get-current-scan');
  }, []);

  const statusView = getStatusView(isLoading ? undefined : result);
  const mcpEntries = result?.entries.filter((entry) => entry.type === SERVER_CARD_MEDIA_TYPE) ?? [];
  const otherEntries = result?.entries.filter((entry) => entry.type !== SERVER_CARD_MEDIA_TYPE) ?? [];
  const usesUpgradedOrigin = Boolean(result?.pageOrigin && result.origin && result.pageOrigin !== result.origin);

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
    window.setTimeout(() => setCopiedValue(undefined), 1400);
  }

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">Discovery</p>
          <h1>AI Catalog</h1>
        </div>
        <button
          className="refresh-button"
          type="button"
          onClick={() => void loadScan('catalog:refresh-current-scan')}
          disabled={isLoading}
        >
          <RefreshCw aria-hidden size={14} className={isLoading ? 'spin' : undefined} />
          Refresh
        </button>
      </header>

      <section className={`status-band status-${statusView.tone}`}>
        <statusView.Icon aria-hidden size={18} />
        <div>
          <h2>{isLoading ? 'Scanning' : statusView.label}</h2>
          <p>{isLoading ? 'Checking the AI Catalog.' : statusView.description(result)}</p>
        </div>
      </section>

      {error ? <p className="inline-error">{error}</p> : null}

      {result?.endpoint ? (
        <section className="endpoint-row">
          <div>
            <span>AI Catalog</span>
            <code>{result.endpoint}</code>
          </div>
          <IconButton
            label={copiedValue === result.endpoint ? 'Copied catalog URL' : 'Copy catalog URL'}
            onClick={() => void copyValue(result.endpoint!)}
          />
        </section>
      ) : null}

      {result?.host?.displayName ? (
        <p className="host-line">
          {result.host.documentationUrl ? (
            <a href={result.host.documentationUrl} target="_blank" rel="noreferrer">
              {result.host.displayName}
            </a>
          ) : (
            result.host.displayName
          )}
        </p>
      ) : null}

      {mcpEntries.length ? (
        <section className="section">
          <div className="section-heading">
            <h3>MCP Servers</h3>
            <span>{mcpEntries.length}</span>
          </div>
          <div className="card-list">
            {mcpEntries.map((entry, index) => (
              <CardSummary
                key={`${entry.identifier ?? entry.sourceUrl ?? 'mcp'}-${index}`}
                entry={entry}
                copiedValue={copiedValue}
                onCopy={copyValue}
              />
            ))}
          </div>
        </section>
      ) : null}

      {otherEntries.length ? (
        <section className="section">
          <div className="section-heading">
            <h3>Other artifacts</h3>
            <span>{otherEntries.length}</span>
          </div>
          <div className="card-list">
            {otherEntries.map((entry, index) => (
              <OtherEntry key={`${entry.identifier ?? entry.type}-${index}`} entry={entry} />
            ))}
          </div>
        </section>
      ) : null}

      {result?.warnings.length ? (
        <section className="section">
          <div className="section-heading">
            <h3>Catalog warnings</h3>
            <span>{result.warnings.length}</span>
          </div>
          <WarningList warnings={result.warnings} />
        </section>
      ) : null}

      {result?.errorMessage && result.status !== 'found' && result.status !== 'found-with-warnings' ? (
        <p className="muted-message">{result.errorMessage}</p>
      ) : null}

      {usesUpgradedOrigin ? <p className="muted-message">Discovery used HTTPS for {result?.pageOrigin}.</p> : null}

      {result ? (
        <p className="fine-print">
          {result.fromCache ? 'Cached' : 'Fresh'} · {formatTime(result.fetchedAt)}
        </p>
      ) : null}
    </main>
  );
}

interface CardSummaryProps {
  entry: CatalogEntry;
  copiedValue?: string;
  onCopy: (value: string) => Promise<void>;
}

function CardSummary({ entry, copiedValue, onCopy }: CardSummaryProps) {
  const serverCard = entry.serverCard;
  const websiteHref = getHttpUrl(serverCard?.websiteUrl);
  const repositoryHref = getHttpUrl(serverCard?.repository?.url);
  const iconSrc = serverCard ? getSafeIconSrc(serverCard) : undefined;
  const description = entry.description || serverCard?.description;

  return (
    <section className="card-summary">
      <div className="title-row">
        <div className="title-copy">
          {iconSrc ? <img className="server-icon" src={iconSrc} alt="" /> : null}
          <div>
            <p className="eyebrow">{entry.identifier || 'MCP Server'}</p>
            <h3>{entry.displayName || serverCard?.title || serverCard?.name || identifierLabel(entry.identifier) || 'Unreadable server card'}</h3>
          </div>
        </div>
        {websiteHref || repositoryHref ? (
          <div className="title-actions">
            {websiteHref ? (
              <a className="external-link" href={websiteHref} target="_blank" rel="noreferrer" title="Open website">
                <ExternalLink aria-hidden size={14} />
              </a>
            ) : null}
            {repositoryHref ? (
              <a className="external-link" href={repositoryHref} target="_blank" rel="noreferrer" title="Open repository">
                <Code2 aria-hidden size={14} />
              </a>
            ) : null}
          </div>
        ) : null}
      </div>

      {description ? <p className="description">{description}</p> : null}

      {serverCard ? (
        <dl className="metadata-grid">
          <div>
            <dt>Name</dt>
            <dd>{serverCard.name || 'Missing'}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{serverCard.version || 'Missing'}</dd>
          </div>
        </dl>
      ) : null}

      {entry.sourceUrl ? (
        <div className="card-source">
          <code>{entry.sourceUrl}</code>
          <IconButton
            label={copiedValue === entry.sourceUrl ? 'Copied server card URL' : 'Copy server card URL'}
            onClick={() => void onCopy(entry.sourceUrl!)}
          />
        </div>
      ) : (
        <p className="inline-label">Inline in the AI Catalog</p>
      )}

      {serverCard?.remotes?.length ? (
        <div className="server-remotes">
          <div className="section-heading">
            <h3>Remotes</h3>
            <span>{serverCard.remotes.length}</span>
          </div>
          <div className="remote-list">
            {serverCard.remotes.map((remote, index) => (
              <RemoteRow
                key={`${remote.type}-${remote.url}-${index}`}
                remote={remote}
                copiedValue={copiedValue}
                onCopy={onCopy}
              />
            ))}
          </div>
        </div>
      ) : null}

      {entry.errorMessage ? <p className="card-error">{entry.errorMessage}</p> : null}

      {entry.warnings.length ? <WarningList warnings={entry.warnings} /> : null}
    </section>
  );
}

interface RemoteRowProps {
  remote: RemoteEndpoint;
  copiedValue?: string;
  onCopy: (value: string) => Promise<void>;
}

function RemoteRow({ remote, copiedValue, onCopy }: RemoteRowProps) {
  return (
    <article className="remote-row">
      <div className="remote-main">
        <div className="remote-copy-row">
          <span className="pill">{remote.type || 'unknown'}</span>
          {remote.url ? (
            <IconButton
              label={copiedValue === remote.url ? 'Copied remote URL' : 'Copy remote URL'}
              onClick={() => void onCopy(remote.url)}
            />
          ) : null}
        </div>
        <code>{remote.url || 'Missing URL'}</code>
        {remote.supportedProtocolVersions?.length ? (
          <p className="remote-meta">{remote.supportedProtocolVersions.join(', ')}</p>
        ) : null}
        {remote.headers?.length ? (
          <div className="chip-row">
            {remote.headers.map((header) => (
              <span className="pill" key={header.name}>
                {header.name}
                {header.isRequired ? ' · required' : ''}
                {header.isSecret ? ' · secret' : ''}
              </span>
            ))}
          </div>
        ) : null}
        {remote.variables?.length ? (
          <div className="chip-row">
            {remote.variables.map((variable) => (
              <span className="pill" key={variable.name}>
                {`{${variable.name}}`}
                {variable.isRequired ? ' · required' : ''}
                {variable.default ? ` · ${variable.default}` : ''}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function OtherEntry({ entry }: { entry: CatalogEntry }) {
  const href = getHttpUrl(entry.sourceUrl);
  return (
    <article className="card-summary">
      <div className="title-row">
        <div>
          <p className="eyebrow">{artifactLabel(entry.type)}</p>
          <h3>{entry.displayName || identifierLabel(entry.identifier) || entry.type}</h3>
        </div>
        {href ? (
          <a className="external-link" href={href} target="_blank" rel="noreferrer" title="Open artifact">
            <ExternalLink aria-hidden size={14} />
          </a>
        ) : null}
      </div>
      {entry.description ? <p className="description">{entry.description}</p> : null}
      {entry.inline ? <p className="inline-label">Inline in the AI Catalog</p> : null}
      {entry.warnings.length ? <WarningList warnings={entry.warnings} /> : null}
    </article>
  );
}

function WarningList({ warnings }: { warnings: { code: string; message: string }[] }) {
  return (
    <ul className="warning-list">
      {warnings.map((warning, index) => (
        <li key={`${warning.code}-${index}`}>
          <AlertTriangle aria-hidden size={15} />
          <span>{warning.message}</span>
        </li>
      ))}
    </ul>
  );
}

interface IconButtonProps {
  label: string;
  onClick: () => void;
}

function IconButton({ label, onClick }: IconButtonProps) {
  return (
    <button className="icon-button" type="button" aria-label={label} title={label} onClick={onClick}>
      <Clipboard aria-hidden size={15} />
    </button>
  );
}

interface StatusView {
  label: string;
  description: (result: ScanResult | undefined) => string;
  tone: 'ok' | 'warning' | 'neutral' | 'error';
  Icon: LucideIcon;
}

function catalogSummary(result: ScanResult | undefined): string {
  const entries = result?.entries ?? [];
  const mcp = entries.filter((entry) => entry.type === SERVER_CARD_MEDIA_TYPE).length;
  const other = entries.length - mcp;
  const mcpLabel = mcp === 1 ? '1 MCP server' : `${mcp} MCP servers`;
  const otherLabel = other === 1 ? '1 other artifact' : `${other} other artifacts`;
  if (mcp > 0 && other > 0) return `${mcpLabel} and ${otherLabel}.`;
  if (mcp > 0) return `${mcpLabel}.`;
  if (other > 0) return `${other === 1 ? '1 artifact' : `${other} artifacts`}. No MCP servers.`;
  return 'Checking the AI Catalog.';
}

function getStatusView(result: ScanResult | undefined): StatusView {
  switch (result?.status as ScanStatus | undefined) {
    case 'found':
      return {
        label: 'Found',
        description: (scan) => catalogSummary(scan),
        tone: 'ok',
        Icon: CheckCircle2,
      };
    case 'found-with-warnings':
      return {
        label: 'Found with warnings',
        description: (scan) => catalogSummary(scan),
        tone: 'warning',
        Icon: ShieldAlert,
      };
    case 'not-found':
      return {
        label: 'Not found',
        description: () => 'This origin does not publish an AI Catalog.',
        tone: 'neutral',
        Icon: SearchX,
      };
    case 'invalid-json':
      return {
        label: 'Invalid JSON',
        description: () => 'The AI Catalog endpoint responded, but the body is not JSON.',
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
        description: () => 'Discovery did not respond in time.',
        tone: 'error',
        Icon: Clock3,
      };
    case 'network-error':
      return {
        label: 'Network error',
        description: () => 'The discovery request could not be completed.',
        tone: 'error',
        Icon: WifiOff,
      };
    case 'unsupported':
      return {
        label: 'Unsupported page',
        description: () => 'This page cannot be scanned for web discovery metadata.',
        tone: 'neutral',
        Icon: SearchX,
      };
    default:
      return {
        label: 'Scanning',
        description: () => 'Checking the AI Catalog.',
        tone: 'neutral',
        Icon: LoaderCircle,
      };
  }
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(timestamp);
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
