"use client";

import { ReactNode } from "react";
import clsx from "clsx";

interface StatCardProps {
  label: string;
  value: string | number;
  color?: "green" | "red" | "yellow" | "white";
  icon?: ReactNode;
}

const colorMap: Record<string, string> = {
  green: "text-[#2ECC71]",
  red: "text-[#D94C4C]",
  yellow: "text-[#D9A84C]",
  white: "text-[#FFFFFF]",
};

export default function StatCard({ label, value, color = "green", icon }: StatCardProps) {
  return (
    <div className="bg-[#0E0E0E] border border-[#2C2C2C] rounded-[18px] p-5 relative">
      {icon && (
        <div className="absolute top-5 right-5 text-[#8E8E8E]">{icon}</div>
      )}
      <p className="text-[#7A7A7A] text-xs font-black uppercase tracking-wider">
        {label}
      </p>
      <p className={clsx("text-3xl font-black mt-2", colorMap[color] || colorMap.white)}>
        {value}
      </p>
    </div>
  );
}
