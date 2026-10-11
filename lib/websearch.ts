/**
 * Search availability requires the helper model; automatic search only sets the composer's initial switch.
 * Turning auto search off still permits manual search.
 */

import { autoWebSearchActive, getProviderSettings } from "./providers";

export function isWebSearchAvailable(): boolean {
  return getProviderSettings().helperEnabled;
}

export function getAutoWebSearch(): boolean {
  return autoWebSearchActive();
}
