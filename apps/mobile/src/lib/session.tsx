/**
 * Session state + the native auth handoff.
 *
 * Sign-in flow (mirrors the desktop Copilot handoff):
 *   1. Open an in-app browser at the backend's /auth/native/start/ endpoint.
 *   2. The backend reuses the web session — logging in there if needed — then
 *      redirects to `dragonfruit://auth/callback?api_token=…`.
 *   3. openAuthSessionAsync resolves with that URL; we parse the token, stash it
 *      in the keychain, and fetch the current user to confirm it works.
 *
 * On launch we rehydrate from the keychain and validate the token by fetching
 * the current user; a 401/403 means the token was revoked, so we sign out.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { AUTH_CALLBACK_URL, NATIVE_LOGIN_START_URL } from "./config";
import { getCurrentUser, isAuthError, type CurrentUser } from "./api";
import { clearCalendarWidget } from "./calendar-widget";
import { clearShareBookmarkConfig, syncShareBookmarkConfig } from "./share-bookmark";
import { clearToken, getToken, setToken } from "./secure-store";

// Required so the auth session can settle when returning to the app (no-op on
// native, needed for web redirect targets).
WebBrowser.maybeCompleteAuthSession();

type SignInResult = { ok: true } | { ok: false; reason: "cancelled" | "no-token" | "error"; message?: string };

type SessionValue = {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: CurrentUser | null;
  signIn: () => Promise<SignInResult>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

function extractApiToken(url: string): string | null {
  const token = Linking.parse(url).queryParams?.api_token;
  if (typeof token === "string" && token.length > 0) return token;
  return null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<CurrentUser | null>(null);

  // Rehydrate + validate on launch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getToken();
      if (!token) {
        if (!cancelled) setIsLoading(false);
        return;
      }
      try {
        const me = await getCurrentUser();
        if (!cancelled) setUser(me);
        void syncShareBookmarkConfig();
      } catch (error) {
        if (isAuthError(error)) await clearToken();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (): Promise<SignInResult> => {
    try {
      const result = await WebBrowser.openAuthSessionAsync(NATIVE_LOGIN_START_URL, AUTH_CALLBACK_URL);
      if (result.type !== "success" || !result.url) {
        return { ok: false, reason: "cancelled" };
      }
      const token = extractApiToken(result.url);
      if (!token) return { ok: false, reason: "no-token" };

      await setToken(token);
      const me = await getCurrentUser();
      setUser(me);
      void syncShareBookmarkConfig();
      return { ok: true };
    } catch (error) {
      // A token that won't authenticate is as good as no token.
      if (isAuthError(error)) await clearToken();
      return { ok: false, reason: "error", message: error instanceof Error ? error.message : undefined };
    }
  }, []);

  const signOut = useCallback(async () => {
    await clearToken();
    clearCalendarWidget();
    clearShareBookmarkConfig();
    setUser(null);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ isLoading, isAuthenticated: user !== null, user, signIn, signOut }),
    [isLoading, user, signIn, signOut]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used within a SessionProvider");
  return value;
}
