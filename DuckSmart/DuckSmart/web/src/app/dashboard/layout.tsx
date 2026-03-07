"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { logout } from "@/lib/auth";
import Sidebar from "@/components/layout/Sidebar";
import { LogOut, Menu, X } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const { isAdmin } = useRole();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A]">
        <div className="w-10 h-10 border-4 border-[#2ECC71] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar isAdmin={isAdmin} />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative z-10">
            <Sidebar isAdmin={isAdmin} />
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-[-48px] text-white bg-[#141414] border border-[#3A3A3A] rounded-full p-2 cursor-pointer hover:bg-[#1a1a1a]"
              aria-label="Close sidebar"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="lg:ml-60">
        {/* Header */}
        <header className="h-16 bg-[#0A0A0A] border-b border-[#3A3A3A] flex items-center justify-between px-6 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-white cursor-pointer hover:opacity-70 transition-opacity"
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>
            <span className="font-black text-lg lg:hidden">
              <span className="text-white">Duck</span>
              <span className="text-[#2ECC71]">Smart</span>
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-[#8E8E8E] font-bold text-sm hidden sm:block">
              {user.email}
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-[#8E8E8E] hover:text-white transition-colors cursor-pointer font-bold text-sm"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
