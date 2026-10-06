/// <reference types="vite/client" />
import type { AccessDeskApi } from '../../shared/ipc';

declare global {
  interface Window {
    /** Exposed by the preload script. This is the only way the UI reaches the main process. */
    accessdesk: AccessDeskApi;
  }
}
