"use client";

import { ReactNode, useEffect } from "react";
import clsx from "clsx";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export default function Modal({ open, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleEsc);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="bg-black/80 absolute inset-0"
        onClick={onClose}
      />

      {/* Content */}
      <div
        className={clsx(
          "relative bg-[#141414] rounded-[18px] border border-[#3A3A3A] p-6",
          "max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto"
        )}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-white text-lg cursor-pointer hover:opacity-70 transition-opacity"
          aria-label="Close modal"
        >
          &#x2715;
        </button>

        {/* Title */}
        {title && (
          <h2 className="text-white font-black text-lg mb-4 pr-8">{title}</h2>
        )}

        {children}
      </div>
    </div>
  );
}
