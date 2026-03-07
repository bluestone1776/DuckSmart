"use client";

import { ReactNode, ButtonHTMLAttributes } from "react";
import clsx from "clsx";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  children: ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
}

export default function Button({
  children,
  variant = "primary",
  disabled,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={clsx(
        "rounded-[14px] px-4 py-3 font-black text-sm transition-all",
        variant === "primary" &&
          "bg-[#0E1A12] border border-[#2ECC71] text-[#2ECC71] hover:brightness-125",
        variant === "secondary" &&
          "bg-[#0E0E0E] border border-[#3A3A3A] text-white hover:brightness-125",
        disabled && "opacity-50 cursor-not-allowed hover:brightness-100",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
