/**
 * Session mock for app-level harness tests that mount the real App shell.
 *
 * The production App.svelte gates everything behind `getSession()`; in jsdom
 * the auth bootstrap never runs, so this mock exposes a permanently
 * authenticated session and no-op auth helpers.
 */
export type SessionStatus = "loading" | "authenticated" | "guest";

export function getSession() {
  return { status: "authenticated", user: { username: "harness-user" } };
}

export async function initSession(): Promise<void> {}
export async function login(): Promise<void> {}
export async function register(): Promise<void> {}
export async function logout(): Promise<void> {}