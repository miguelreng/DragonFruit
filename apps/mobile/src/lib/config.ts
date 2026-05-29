/**
 * Runtime configuration for the mobile client.
 *
 * The host is overridable at build time via EXPO_PUBLIC_API_URL so we can point
 * a dev build at a local/staging backend without code changes. Everything else
 * derives from it.
 */

const DEFAULT_APP_HOST = "https://app.dragonfruit.sh";

/** Web app origin — serves both the auth handoff and the REST API. */
export const APP_HOST = (process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_APP_HOST).replace(/\/+$/, "");

/** REST API base. Data endpoints live under `/api` (e.g. `/api/workspaces/`). */
export const API_URL = `${APP_HOST}/api`;

/** Custom URL scheme registered by this app (see app.json `scheme`). */
export const AUTH_SCHEME = "dragonfruit";

/**
 * Deep link the backend redirects to with `?api_token=…` once a session exists.
 * Must be whitelisted server-side in ALLOWED_NATIVE_REDIRECT_SCHEMES.
 */
export const AUTH_CALLBACK_URL = `${AUTH_SCHEME}://auth/callback`;

/**
 * Entry point for the native auth handoff. If the browser session is logged in
 * it mints an APIToken and redirects to AUTH_CALLBACK_URL; if not, it bounces
 * through the normal web sign-in and returns here afterward.
 */
export const NATIVE_LOGIN_START_URL = `${APP_HOST}/auth/native/start/?callback=${encodeURIComponent(
  AUTH_CALLBACK_URL
)}`;
