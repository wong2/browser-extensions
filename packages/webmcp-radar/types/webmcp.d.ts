export {};

declare global {
  interface Document {
    readonly modelContext?: WebMcpDocumentModelContext;
  }

  interface WebMcpDocumentModelContext extends EventTarget {
    getTools(options?: WebMcpGetToolsOptions): Promise<WebMcpPageTool[]>;
    ontoolchange: ((this: WebMcpDocumentModelContext, event: Event) => unknown) | null;
  }

  interface WebMcpGetToolsOptions {
    fromOrigins?: string[];
  }

  interface WebMcpPageToolAnnotations {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  }

  interface WebMcpPageTool {
    name: string;
    title?: string;
    description?: string;
    inputSchema?: Record<string, unknown> | string;
    annotations?: WebMcpPageToolAnnotations;
    origin?: string;
    window?: WindowProxy | null;
  }
}
