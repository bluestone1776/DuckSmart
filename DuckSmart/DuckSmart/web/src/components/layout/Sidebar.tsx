"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useAuth } from "@/hooks/useAuth";
import {
  Clock,
  MapPin,
  Cloud,
  BarChart3,
  Search,
  Settings,
  Shield,
  User,
} from "lucide-react";

interface SidebarProps {
  isAdmin?: boolean;
}

const navItems = [
  { label: "History", href: "/dashboard/history", icon: Clock },
  { label: "Map", href: "/dashboard/map", icon: MapPin },
  { label: "Weather", href: "/dashboard/weather", icon: Cloud },
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { label: "Species Guide", href: "/dashboard/species", icon: Search },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

export default function Sidebar({ isAdmin }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <aside className="w-60 bg-[#0E0E0E] border-r border-[#3A3A3A] h-screen flex flex-col fixed left-0 top-0">
      {/* Brand */}
      <div className="p-5">
        <span className="font-black text-xl">
          <span className="text-white">Duck</span>
          <span className="text-[#2ECC71]">Smart</span>
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 mt-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 px-5 py-3 text-sm font-extrabold transition-colors",
                isActive
                  ? "text-[#2ECC71] bg-[#0E1A12] border-l-2 border-[#2ECC71]"
                  : "text-[#8E8E8E] hover:text-white hover:bg-[#141414] border-l-2 border-transparent"
              )}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}

        {isAdmin && (
          <>
            <div className="border-t border-[#3A3A3A] my-3 mx-5" />
            <Link
              href="/admin"
              className={clsx(
                "flex items-center gap-3 px-5 py-3 text-sm font-extrabold transition-colors",
                pathname === "/admin" || pathname?.startsWith("/admin/")
                  ? "text-[#2ECC71] bg-[#0E1A12] border-l-2 border-[#2ECC71]"
                  : "text-[#8E8E8E] hover:text-white hover:bg-[#141414] border-l-2 border-transparent"
              )}
            >
              <Shield size={18} />
              Admin
            </Link>
          </>
        )}
      </nav>

      {/* User info */}
      <div className="p-5 border-t border-[#3A3A3A]">
        <Link
          href="/dashboard/settings"
          className="flex items-center gap-3 group"
        >
          <div className="w-8 h-8 rounded-full bg-[#0E1A12] border border-[#2ECC71] flex items-center justify-center overflow-hidden flex-shrink-0">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <User size={14} className="text-[#2ECC71]" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-bold truncate group-hover:text-[#2ECC71] transition-colors">
              {user?.displayName || "Hunter"}
            </p>
            <p className="text-[#6D6D6D] text-[10px] font-bold truncate">
              {user?.email}
            </p>
          </div>
        </Link>
      </div>
    </aside>
  );
}
