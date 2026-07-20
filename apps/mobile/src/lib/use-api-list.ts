import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";

import { apiErrorMessage, isAuthError } from "@/lib/api";
import { useSession } from "@/lib/session";

/**
 * Shared fetch-a-list state for read-only browse screens: initial load,
 * pull-to-refresh, error capture, and automatic sign-out on a revoked token.
 * Reloads whenever `deps` change (e.g. the workspace slug in the route).
 */
export function useApiList<T>(fetcher: () => Promise<T[]>, deps: DependencyList) {
  const { signOut } = useSession();
  // Keep the latest fetcher without making it a load() dependency, so changing
  // route params re-runs via `deps` rather than recreating the callback.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await fetcherRef.current());
    } catch (err) {
      if (isAuthError(err)) {
        await signOut();
        return;
      }
      setError(apiErrorMessage(err, "Couldn't load this content. Pull to retry."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [signOut]);

  const dependencyKey = JSON.stringify(deps);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setLoading(true);
      void load();
    });
    return () => cancelAnimationFrame(frame);
  }, [dependencyKey, load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  return { data, loading, refreshing, error, onRefresh };
}
