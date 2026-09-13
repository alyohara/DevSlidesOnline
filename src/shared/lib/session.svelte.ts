/**
 * Session state for DevSlidesOnline.
 *
 * The server owns authentication via an HttpOnly session cookie
 * (`devslides_session`, 30-day TTL). This module is the single client-side
 * source of truth for "is someone logged in", refreshed on startup through
 * `GET /api/auth/me` and kept honest by the 401 handler — any protected
 * request that comes back unauthenticated flips the state back to `guest`.
 */
interface SessionUser {
  username: string;
}

type SessionStatus = "loading" | "authenticated" | "guest";

export interface SessionState {
  status: SessionStatus;
  user: SessionUser | null;
}

const session = $state<SessionState>({
  status: "loading",
  user: null,
});

export function getSession(): SessionState {
  return session;
}

function serverBase(): string {
  return (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
}

interface AuthErrorShape {
  message?: string;
}

async function authRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${serverBase()}${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const shape = (await res.json()) as AuthErrorShape;
      if (shape.message) message = shape.message;
    } catch {
      /* not JSON */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

interface SessionMe {
  user: { username: string } | null;
}

/** Restores the session from the cookie (if any) on app boot. */
export async function initSession(): Promise<void> {
  try {
    const me = await authRequest<SessionMe>("GET", "/api/auth/me");
    session.user = me?.user?.username ? { username: me.user.username } : null;
  } catch {
    session.user = null;
  }
  session.status = session.user ? "authenticated" : "guest";
}

export async function login(username: string, password: string): Promise<void> {
  const me = await authRequest<SessionUser>("POST", "/api/auth/login", {
    username,
    password,
  });
  session.user = { username: me.username };
  session.status = "authenticated";
}

export async function register(
  username: string,
  password: string,
): Promise<void> {
  const me = await authRequest<SessionUser>("POST", "/api/auth/register", {
    username,
    password,
  });
  session.user = { username: me.username };
  session.status = "authenticated";
}

export async function logout(): Promise<void> {
  try {
    await authRequest<void>("POST", "/api/auth/logout");
  } catch {
    /* stale cookie — still clear locally */
  } finally {
    session.user = null;
    session.status = "guest";
  }
}

// A protected request failed with 401 — session expired while the app ran.
if (typeof window !== "undefined") {
  window.addEventListener("devslides:session-expired", () => {
    session.user = null;
    session.status = "guest";
  });
}
