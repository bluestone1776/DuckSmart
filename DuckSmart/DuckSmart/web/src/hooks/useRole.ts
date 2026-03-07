"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "./useAuth";

// ---------------------------------------------------------------------------
//  useRole — read the user's role from Firestore `roles/{uid}`
// ---------------------------------------------------------------------------

interface UseRoleReturn {
  role: "admin" | "user" | null;
  isAdmin: boolean;
  loading: boolean;
}

export function useRole(): UseRoleReturn {
  const { user } = useAuth();
  const [role, setRole] = useState<"admin" | "user" | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRole(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchRole() {
      try {
        const snap = await getDoc(doc(db, "roles", user!.uid));
        if (cancelled) return;

        if (snap.exists()) {
          const data = snap.data();
          setRole(data.role === "admin" ? "admin" : "user");
        } else {
          // Document doesn't exist — default to "user"
          setRole("user");
        }
      } catch (err) {
        console.error("useRole: failed to fetch role —", err);
        if (!cancelled) {
          setRole("user");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    setLoading(true);
    fetchRole();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return { role, isAdmin: role === "admin", loading };
}
