"use client";

import clsx from "clsx";

interface ChipProps {
  label: string;
  selected: boolean;
  onClick: () => void;
}

export default function Chip({ label, selected, onClick }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "rounded-full border px-3.5 py-2 text-[13px] font-bold cursor-pointer transition-colors",
        selected
          ? "bg-[#0E1A12] border-[#2ECC71] text-[#2ECC71]"
          : "bg-[#141414] border-[#3A3A3A] text-white hover:border-[#8E8E8E]"
      )}
    >
      {label}
    </button>
  );
}
