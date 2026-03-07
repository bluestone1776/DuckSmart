"use client";

import { forwardRef, InputHTMLAttributes } from "react";
import clsx from "clsx";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, className, id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div>
        {label && (
          <label
            htmlFor={inputId}
            className="text-[#8E8E8E] text-xs font-black mb-2 block"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={clsx(
            "bg-[#0E0E0E] border border-[#3A3A3A] rounded-[14px] px-3 py-2.5 text-white font-extrabold w-full",
            "placeholder:text-[#6D6D6D]",
            "focus:outline-none focus:border-[#2ECC71]",
            className
          )}
          {...props}
        />
      </div>
    );
  }
);

Input.displayName = "Input";

export default Input;
