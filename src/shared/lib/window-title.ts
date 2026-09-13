/**
 * Updates the browser tab title.
 *
 * The user-visible title is rendered by the in-app TitleBar; this helper keeps
 * the tab label (and window/taskbar title) in sync with the current screen.
 */
export function setWindowTitle(title: string): void {
  document.title = title;
}
