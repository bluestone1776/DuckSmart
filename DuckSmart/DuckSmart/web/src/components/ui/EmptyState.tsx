"use client";

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
}

export default function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      {icon && <span className="text-4xl mb-4">{icon}</span>}
      <h3 className="text-white font-black text-lg">{title}</h3>
      <p className="text-[#7A7A7A] font-bold text-sm mt-2 max-w-md text-center">
        {description}
      </p>
    </div>
  );
}
