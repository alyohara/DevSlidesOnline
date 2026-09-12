/** Dialog visibility slice (§6.4). */
import { ui } from "./ui-object.svelte";
import type { UpdateInfo } from "$lib/lib/tauri-api";

export function setIsGoToSlideOpen(v: boolean) {
  ui.isGoToSlideOpen = v;
}
export function setIsSettingsOpen(v: boolean) {
  ui.isSettingsOpen = v;
}
export function setIsCommandOpen(v: boolean) {
  ui.isCommandOpen = v;
}
export function setIsShortcutsOpen(v: boolean) {
  ui.isShortcutsOpen = v;
}
export function toggleShortcutsOpen() {
  ui.isShortcutsOpen = !ui.isShortcutsOpen;
}
export function setIsAboutOpen(v: boolean) {
  ui.isAboutOpen = v;
}
export function setIsUpdateOpen(v: boolean) {
  ui.isUpdateOpen = v;
}
export function setUpdateInfo(info: UpdateInfo | null) {
  ui.updateInfo = info;
}
