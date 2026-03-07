"use client";

import { useCallback, useEffect, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "./useAuth";
import type { MapPin } from "@/lib/types";

// ---------------------------------------------------------------------------
//  usePins — fetch all pins from `users/{uid}/pins`
// ---------------------------------------------------------------------------

interface UsePinsReturn {
  pins: MapPin[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function usePins(uid?: string): UsePinsReturn {
  const { user } = useAuth();
  const resolvedUid = uid ?? user?.uid;

  const [pins, setPins] = useState<MapPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => {
    setFetchKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!resolvedUid) {
      setPins([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    async function fetchPins() {
      setLoading(true);
      setError(null);

      try {
        const q = query(
          collection(db, "users", resolvedUid!, "pins"),
          orderBy("createdAt", "desc"),
        );
        const snap = await getDocs(q);
        if (cancelled) return;

        const results = snap.docs.map((d) => ({
          ...d.data(),
          id: d.id,
        })) as MapPin[];

        setPins(results);
      } catch (err) {
        console.error("usePins: fetch failed —", err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to fetch pins");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchPins();

    return () => {
      cancelled = true;
    };
  }, [resolvedUid, fetchKey]);

  return { pins, loading, error, refetch };
}
