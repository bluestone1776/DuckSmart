"use client";

import { ReactNode } from "react";
import clsx from "clsx";

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  rightHeader?: ReactNode;
}

export default function Card({ children, className, title, rightHeader }: CardProps) {
  return (
    <div
      className={clsx(
        "bg-[#141414] rounded-[18px] border border-[#3A3A3A] p-4",
        className
      )}
    >
      {title && (
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-extrabold text-[15px]">{title}</h3>
          {rightHeader && <div>{rightHeader}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
