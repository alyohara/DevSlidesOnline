/**
 * Updates the window title.
 *
 * macOS traffic-light bug: with `titleBarStyle: "overlay"` + `hiddenTitle`
 * + a custom `trafficLightPosition` in tauri.conf.json, calling native
 * `Window.setTitle()` at runtime makes wry/tao rebuild the titlebar layout
 * and snap the traffic lights back to their default top-left position —
 * visible as a jump right after the UI finishes loading (Dashboard/editor
 * call `setWindowTitle()` from a mount `$effect`).
 *
 * Therefore only `document.title` is updated here; the native title stays
 * at the value configured in tauri.conf.json. The user-visible title is
 * rendered by the in-app TitleBar anyway.
 */
export function setWindowTitle(title: string): void {
  document.title = title;
}
