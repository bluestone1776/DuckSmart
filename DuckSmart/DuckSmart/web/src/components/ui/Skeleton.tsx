"use client";

import clsx from "clsx";

interface SkeletonProps {
  className?: string;
}

export default function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={clsx(
        "bg-[#0E0E0E] animate-pulse rounded-[18px] h-20 w-full",
        className
      )}
    />
  );
}
