"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ApiError } from "./api";

type State<T> = { data: T | undefined; error: ApiError | null; loading: boolean };

/**
 * Lee un recurso de la API. Al cambiar la clave mantiene los datos anteriores en pantalla
 * (atenuados) hasta que llegan los nuevos: no hay saltos ni pantallas en blanco.
 */
export function useApi<T>(path: string | null) {
  const [state, setState] = useState<State<T>>({ data: undefined, error: null, loading: Boolean(path) });
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!path) return;
    const mine = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api<T>(path);
      if (mine === seq.current) setState({ data, error: null, loading: false });
    } catch (err) {
      if (mine === seq.current) setState((s) => ({ ...s, error: err as ApiError, loading: false }));
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const mutate = useCallback((data: T) => setState({ data, error: null, loading: false }), []);
  return { ...state, reload: load, mutate };
}
