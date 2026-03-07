"use client";

import clsx from "clsx";

interface BadgeProps {
  label: string;
  color?: "green" | "red" | "yellow";
  className?: string;
}

export default function Badge({ label, color = "green", className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black border",
        color === "green" && "bg-[#0E1A12] border-[#2ECC71] text-[#2ECC71]",
        color === "red" && "bg-[rgba(217,76,76,0.12)] border-[#D94C4C] text-[#D94C4C]",
        color === "yellow" && "bg-[rgba(217,168,76,0.12)] border-[#D9A84C] text-[#D9A84C]",
        className
      )}
    >
      {label}
    </span>
  );
}
