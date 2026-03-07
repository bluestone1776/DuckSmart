"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user) {
      router.replace("/dashboard/history");
    } else {
      router.replace("/login");
    }
  }, [user, loading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-[#2ECC71] border-t-transparent rounded-full animate-spin" />
        <p className="text-[#8E8E8E] font-bold text-sm">Loading...</p>
      </div>
    </div>
  );
}
