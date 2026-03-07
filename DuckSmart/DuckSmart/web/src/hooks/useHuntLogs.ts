"use client";

import { useCallback, useEffect, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "./useAuth";
import type { HuntLog } from "@/lib/types";

// ---------------------------------------------------------------------------
//  useHuntLogs — fetch all hunt logs from `users/{uid}/logs`
// ---------------------------------------------------------------------------

interface UseHuntLogsReturn {
  logs: HuntLog[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useHuntLogs(uid?: string): UseHuntLogsReturn {
  const { user } = useAuth();
  const resolvedUid = uid ?? user?.uid;

  const [logs, setLogs] = useState<HuntLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => {
    setFetchKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!resolvedUid) {
      setLogs([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    async function fetchLogs() {
      setLoading(true);
      setError(null);

      try {
        const q = query(
          collection(db, "users", resolvedUid!, "logs"),
          orderBy("createdAt", "desc"),
        );
        const snap = await getDocs(q);
        if (cancelled) return;

        const results = snap.docs.map((d) => ({
          ...d.data(),
          id: d.id,
        })) as HuntLog[];

        setLogs(results);
      } catch (err) {
        console.error("useHuntLogs: fetch failed —", err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to fetch hunt logs");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchLogs();

    return () => {
      cancelled = true;
    };
  }, [resolvedUid, fetchKey]);

  return { logs, loading, error, refetch };
}
