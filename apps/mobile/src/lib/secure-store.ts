/**
 * Thin wrapper over expo-secure-store for the API token — the mobile equivalent
 * of the Copilot app's Keychain storage. Token is written with WHEN_UNLOCKED so
 * it's readable on app foreground but never leaves the device unencrypted.
 */
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "df_api_token";
const LAST_WORKSPACE_KEY = "df_last_workspace";

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED,
  });
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function getLastWorkspaceSlug(): Promise<string | null> {
  return SecureStore.getItemAsync(LAST_WORKSPACE_KEY);
}

export async function setLastWorkspaceSlug(slug: string): Promise<void> {
  await SecureStore.setItemAsync(LAST_WORKSPACE_KEY, slug, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED,
  });
}
