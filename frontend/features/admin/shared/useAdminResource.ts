"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface AdminResource<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

export function useAdminResource<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  dependencies: readonly unknown[]
): AdminResource<T> {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    loaderRef.current(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason : new Error("请求失败"));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
    // The dependency list is deliberately supplied by the caller, mirroring useEffect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);
  return { data, loading, error, reload };
}
