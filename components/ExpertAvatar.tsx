"use client";

import { useState } from "react";
import { expertColorClasses, expertInitials } from "@/lib/expertColor";

const DICEBEAR_STYLE = "lorelei";

export function ExpertAvatar({
  id,
  name,
  className = "w-8 h-8 rounded-md",
  textSizeClass = "text-[11px]",
}: {
  id: string;
  name: string;
  className?: string;
  textSizeClass?: string;
}) {
  const [errored, setErrored] = useState(false);
  const colors = expertColorClasses(id);
  const url = `https://api.dicebear.com/9.x/${DICEBEAR_STYLE}/svg?seed=${encodeURIComponent(id)}`;

  if (errored) {
    return (
      <div
        className={`${className} ${colors.bg} flex items-center justify-center font-semibold text-white ${textSizeClass}`}
      >
        {expertInitials(name)}
      </div>
    );
  }

  return (
    <div className={`${className} ${colors.soft} overflow-hidden`}>
      <img
        src={url}
        alt={name}
        className="w-full h-full block"
        onError={() => setErrored(true)}
      />
    </div>
  );
}
