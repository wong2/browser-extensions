import {
  WEBMCP_MESSAGE,
  isScanPageMessage,
  type ContentSignalMessage,
  type PageScanResult,
  type ScanPageMessage,
  type ScanPageResponse,
} from '@/utils/protocol';
import { classifyToolError, normalizeTools } from '@/utils/tools';

const TOOL_CHANGE_DEBOUNCE_MS = 100;

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main(ctx) {
    let toolChangeTimer: number | undefined;

    const sendSignal = async (reason: ContentSignalMessage['reason']) => {
      const message: ContentSignalMessage = {
        type: WEBMCP_MESSAGE.contentSignal,
        reason,
        pageUrl: location.href,
      };

      try {
        await browser.runtime.sendMessage(message);
      } catch {
        // A missing/invalid receiver is represented as restricted by the next live scan.
      }
    };

    const onToolChange = () => {
      if (toolChangeTimer !== undefined) clearTimeout(toolChangeTimer);
      toolChangeTimer = ctx.setTimeout(() => {
        toolChangeTimer = undefined;
        void sendSignal('toolchange');
      }, TOOL_CHANGE_DEBOUNCE_MS);
    };

    const onMessage = (message: unknown): Promise<ScanPageResponse> | undefined => {
      if (!isScanPageMessage(message)) return undefined;
      return handleScanRequest(message);
    };

    browser.runtime.onMessage.addListener(onMessage);

    const modelContext = document.modelContext;
    if (modelContext) modelContext.addEventListener('toolchange', onToolChange);

    ctx.onInvalidated(() => {
      browser.runtime.onMessage.removeListener(onMessage);
      if (toolChangeTimer !== undefined) clearTimeout(toolChangeTimer);
      modelContext?.removeEventListener('toolchange', onToolChange);
    });

    void sendSignal('ready');
  },
});

async function handleScanRequest(message: ScanPageMessage): Promise<ScanPageResponse> {
  return {
    requestId: message.requestId,
    result: await scanDocument(message.fromOrigins),
  };
}

async function scanDocument(fromOrigins: string[]): Promise<PageScanResult> {
  const pageUrl = location.href;
  const pageOrigin = safePageOrigin();
  const scannedAt = Date.now();
  const modelContext = document.modelContext;

  if (!modelContext) {
    return {
      status: 'unsupported',
      reason: 'api-unavailable',
      pageUrl,
      pageOrigin,
      scannedAt,
      fromOrigins,
      fallbackUsed: false,
      tools: [],
    };
  }

  let fallbackUsed = false;

  try {
    let pageTools: WebMcpPageTool[];
    try {
      pageTools = await modelContext.getTools({ fromOrigins });
    } catch {
      fallbackUsed = true;
      pageTools = await modelContext.getTools();
    }

    return {
      status: 'supported',
      pageUrl,
      pageOrigin,
      scannedAt,
      fromOrigins,
      fallbackUsed,
      tools: normalizeTools(pageTools, pageOrigin),
    };
  } catch (error) {
    return {
      ...classifyToolError(error),
      pageUrl,
      pageOrigin,
      scannedAt,
      fromOrigins,
      fallbackUsed,
      tools: [],
    };
  }
}

function safePageOrigin(): string {
  try {
    return location.origin;
  } catch {
    return '';
  }
}
