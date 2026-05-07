// V67 — Internal Metadata Watermark (IMW)
import { AUTHOR_NAME, WATERMARK_SHORT, ENGINE_SIGNATURE, getMetadata } from '../services/watermark';

export interface EngineMetadata {
  author: string;
  watermark: string;
  engine_signature: string;
  version: string;
}

export const ENGINE_METADATA: EngineMetadata = getMetadata();

// Expose in diagnostics only during development (not rendered in UI)
if (import.meta.env.DEV) {
  (window as any).PATHMAP_METADATA = ENGINE_METADATA;
}
