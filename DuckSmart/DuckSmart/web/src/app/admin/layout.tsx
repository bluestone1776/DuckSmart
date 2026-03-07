"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { logout } from "@/lib/auth";
import {
  Users,
  BarChart3,
  MessageSquare,
  LogOut,
  ArrowLeft,
  Menu,
  X,
  Shield,
} from "lucide-react";
import clsx from "clsx";

const adminNav = [
  { label: "Users", href: "/admin", icon: Users },
  { label: "Analytics", href: "/admin/analytics", icon: BarChart3 },
  { label: "Feedback", href: "/admin/feedback", icon: MessageSquare },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useRole();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const loading = authLoading || roleLoading;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if (!isAdmin) {
      router.replace("/dashboard/history");
    }
  }, [user, isAdmin, loading, router]);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A]">
        <div className="w-10 h-10 border-4 border-[#D9A84C] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 bg-[#0E0E0E] border-r border-[#3A3A3A] h-screen flex-col fixed left-0 top-0">
        <div className="p-5">
          <span className="font-black text-xl">
            <span className="text-white">Duck</span>
            <span className="text-[#D9A84C]">Admin</span>
          </span>
        </div>

        <nav className="flex-1 mt-2">
          {adminNav.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/admin" && pathname?.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex items-center gap-3 px-5 py-3 text-sm font-extrabold transition-colors",
                  isActive
                    ? "text-[#D9A84C] bg-[rgba(217,168,76,0.08)] border-l-2 border-[#D9A84C]"
                    : "text-[#8E8E8E] hover:text-white hover:bg-[#141414] border-l-2 border-transparent"
                )}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}

          <div className="border-t border-[#3A3A3A] my-3 mx-5" />

          <Link
            href="/dashboard/history"
            className="flex items-center gap-3 px-5 py-3 text-sm font-extrabold text-[#8E8E8E] hover:text-white hover:bg-[#141414] transition-colors border-l-2 border-transparent"
          >
            <ArrowLeft size={18} />
            Back to Dashboard
          </Link>
        </nav>

        <div className="p-5 border-t border-[#3A3A3A]">
          <div className="flex items-center gap-3">
            <Shield size={16} className="text-[#D9A84C]" />
            <span className="text-[#8E8E8E] text-sm font-bold truncate">
              {user.email}
            </span>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative z-10 w-60 bg-[#0E0E0E] border-r border-[#3A3A3A] h-screen flex flex-col">
            <div className="p-5 flex items-center justify-between">
              <span className="font-black text-xl">
                <span className="text-white">Duck</span>
                <span className="text-[#D9A84C]">Admin</span>
              </span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            <nav className="flex-1 mt-2">
              {adminNav.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/admin" && pathname?.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={clsx(
                      "flex items-center gap-3 px-5 py-3 text-sm font-extrabold transition-colors",
                      isActive
                        ? "text-[#D9A84C] bg-[rgba(217,168,76,0.08)] border-l-2 border-[#D9A84C]"
                        : "text-[#8E8E8E] hover:text-white hover:bg-[#141414] border-l-2 border-transparent"
                    )}
                  >
                    <Icon size={18} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="lg:ml-60">
        <header className="h-16 bg-[#0A0A0A] border-b border-[#3A3A3A] flex items-center justify-between px-6 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-white cursor-pointer"
            >
              <Menu size={22} />
            </button>
            <span className="font-black text-lg lg:hidden">
              <span className="text-white">Duck</span>
              <span className="text-[#D9A84C]">Admin</span>
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-[#8E8E8E] hover:text-white transition-colors cursor-pointer font-bold text-sm"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </header>

        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
