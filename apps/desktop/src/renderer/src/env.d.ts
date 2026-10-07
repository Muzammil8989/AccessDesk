/// <reference types="vite/client" />
import type { AccessDeskApi } from '../../shared/ipc';

declare global {
  interface Window {
    accessdesk: AccessDeskApi;
  }
}
