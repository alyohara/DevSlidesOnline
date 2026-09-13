/**
 * Update checks — query the latest GitHub release directly from the browser
 * (the DevSlidesOnline repo) and surface the result:
 *   - startup probe: silent — never nags on network failure, only opens the
 *     dialog when a real update exists;
 *   - Help → "Check for Updates…": always gives the user an answer.
 */
import { api, type UpdateInfo } from "$lib/lib/tauri-api";
import { notify } from "$lib/lib/toast";
import { setIsUpdateOpen, setUpdateInfo } from "$lib/stores/ui-state.svelte";

export function updateCheckSupported(): boolean {
  return typeof api.checkForUpdates === "function";
}

/** Startup probe: offline or failed checks stay silent. */
export async function checkForUpdatesSilently(): Promise<void> {
  if (!updateCheckSupported()) return;
  let info: UpdateInfo;
  try {
    info = await api.checkForUpdates();
  } catch {
    return;
  }
  if (!info.updateAvailable || info.checkError || !info.releaseUrl) return;
  setUpdateInfo(info);
  setIsUpdateOpen(true);
}

/** Menu trigger: the user asked, so every outcome gets feedback. */
export async function checkForUpdatesFromMenu(): Promise<void> {
  let info: UpdateInfo;
  try {
    info = await api.checkForUpdates();
  } catch (err) {
    notify.error(`Couldn't check for updates — ${messageOf(err)}`);
    return;
  }
  if (info.checkError) {
    notify.error(`Couldn't check for updates — ${info.checkError}`);
    return;
  }
  if (info.updateAvailable && info.releaseUrl) {
    setUpdateInfo(info);
    setIsUpdateOpen(true);
    return;
  }
  notify.success(
    `DevSlides ${info.currentVersion} is up to date`,
    info.latestVersion
      ? { description: `Latest release: ${info.latestVersion}` }
      : undefined,
  );
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
