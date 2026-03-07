"use client";

import { Menu } from "lucide-react";

interface HeaderProps {
  title?: string;
  onMenuClick?: () => void;
}

export default function Header({ title, onMenuClick }: HeaderProps) {
  return (
    <header className="h-16 bg-[#0A0A0A] border-b border-[#3A3A3A] flex items-center justify-between px-6">
      {/* Left side */}
      <div className="flex items-center gap-4">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            className="lg:hidden text-white cursor-pointer hover:opacity-70 transition-opacity"
            aria-label="Toggle menu"
          >
            <Menu size={22} />
          </button>
        )}
        {title && <h1 className="text-white font-black text-lg">{title}</h1>}
      </div>

      {/* Right side - user avatar / sign out placeholder */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-[#141414] border border-[#3A3A3A]" />
      </div>
    </header>
  );
}
