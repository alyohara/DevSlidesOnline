import type { Database } from "bun:sqlite";
import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { nowMs } from "./models";

export const SESSION_COOKIE = "devslides_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface AuthUser {
  id: string;
  username: string;
}

export interface SessionRow {
  token: string;
  user_id: string;
  created_at: number;
  expires_at: number;
}

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }

  static error(message: string): ApiError {
    return new ApiError(500, "ERROR", message);
  }

  static validation(message: string): ApiError {
    return new ApiError(400, "VALIDATION", message);
  }

  static notFound(message: string): ApiError {
    return new ApiError(404, "NOT_FOUND", message);
  }

  static cancelled(message: string): ApiError {
    return new ApiError(202, "CANCELLED", message);
  }
}

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash);
}

export function validUsername(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length < 3) {
    throw ApiError.validation("Username must be at least 3 characters long");
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) {
    throw ApiError.validation(
      "Username may only contain letters, numbers, dots, dashes and underscores",
    );
  }
  if (trimmed.length > 40) {
    throw ApiError.validation("Username must be at most 40 characters long");
  }
  return trimmed;
}

export function validPassword(password: string): void {
  if (typeof password !== "string" || password.length < 8) {
    throw ApiError.validation("Password must be at least 8 characters long");
  }
  if (password.length > 128) {
    throw ApiError.validation("Password must be at most 128 characters long");
  }
}

export function findUserByUsername(db: Database, username: string): { id: string; username: string; password_hash: string } | null {
  return (db
    .query("SELECT id, username, password_hash FROM users WHERE username = ?")
    .get(username) as { id: string; username: string; password_hash: string } | undefined) ?? null;
}

export function findUserById(db: Database, userId: string): { id: string; username: string } | null {
  return (db
    .query("SELECT id, username FROM users WHERE id = ?")
    .get(userId) as { id: string; username: string } | undefined) ?? null;
}

export function createSession(db: Database, userId: string): string {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const now = nowMs();
  db.query(
    "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  ).run(token, userId, now, now + SESSION_TTL_MS);
  return token;
}

function resolveSession(db: Database, token: string | undefined): AuthUser | null {
  if (!token) return null;
  const now = nowMs();
  const row = db
    .query(
      `SELECT s.user_id, u.username FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`,
    )
    .get(token, now) as { user_id: string; username: string } | undefined;
  if (!row) return null;
  return { id: row.user_id, username: row.username };
}

export function deleteSession(db: Database, token: string | undefined): void {
  if (!token) return;
  db.query("DELETE FROM sessions WHERE token = ?").run(token);
}

/** Hono middleware — sets c.get("auth") to the logged-in user or 401s. */
export function requireAuth(db: Database): MiddlewareHandler {
  return async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    const user = resolveSession(db, token);
    if (!user) {
      return c.json({ code: "UNAUTHORIZED", message: "Not signed in" }, 401);
    }
    c.set("userId", user.id);
    c.set("username", user.username);
    await next();
  };
}

export function authHelper(db: Database) {
  return {
    issueLoginCookie(c: Context, userId: string): void {
      const token = createSession(db, userId);
      setCookie(c, SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: "Lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: SESSION_TTL_MS / 1000,
      });
    },
    clearLoginCookie(c: Context): void {
      deleteCookie(c, SESSION_COOKIE, { path: "/" });
    },
    currentUser(c: Context): AuthUser {
      const userId = c.get("userId");
      const username = c.get("username");
      return { id: userId, username };
    },
  };
}