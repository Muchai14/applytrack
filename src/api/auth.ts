export interface Account {
  id: string;
  username: string;
}
export interface SessionResult {
  user: Account | null;
}
export const SESSION_EXPIRED = "applytrack:session-expired";
export function createAuthApi(base = "") {
  async function call(
    path: string,
    body?: { username: string; password: string } | Record<string, never>,
  ): Promise<SessionResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(
        base.replace(/\/$/, "") + "/api/auth/" + path,
        {
          method: body === undefined ? "GET" : "POST",
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
          headers:
            body === undefined
              ? undefined
              : {
                  "Content-Type": "application/json",
                  "X-Requested-With": "ApplyTrack",
                },
          body: body === undefined ? undefined : JSON.stringify(body),
        },
      );
      if (!response.ok) {
        const messages: Record<number, string> = {
          401: "Incorrect username or password.",
          403: "Request verification failed. Refresh the page and try again.",
          409: "That username is already taken.",
          422: "Check your username and password length.",
          429: "Too many attempts. Please try again later.",
        };
        throw new Error(
          messages[response.status] ||
            "Could not reach your account. Please try again.",
        );
      }
      return response.status === 204
        ? { user: null }
        : ((await response.json()) as SessionResult);
    } finally {
      clearTimeout(timeout);
    }
  }
  return {
    session: () => call("me"),
    register: (username: string, password: string) =>
      call("register", { username, password }),
    login: (username: string, password: string) =>
      call("login", { username, password }),
    logout: () => call("logout", {}),
  };
}
export const authApi = createAuthApi(import.meta.env.VITE_API_BASE_URL || "");
