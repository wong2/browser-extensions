export function hostnameFromInput(input: string): string | null {
  const raw = input.trim().toLowerCase();
  if (!raw) return null;

  try {
    const url = raw.includes('://') ? new URL(raw) : new URL(`https://${raw}`);
    const host = url.hostname.replace(/\.$/, '');
    if (!host || host === 'localhost' || isIp(host)) return null;
    return host;
  } catch {
    return null;
  }
}

function isIp(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
}
