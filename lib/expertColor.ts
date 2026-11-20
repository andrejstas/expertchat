// "violet" intentionally excluded — clashes with the brand accent colour.
const PALETTE = ["emerald", "amber", "rose", "sky", "orange", "teal", "fuchsia"] as const;
type Color = (typeof PALETTE)[number];

export function expertColor(id: string): Color {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export interface ColorClasses {
  bg: string;
  soft: string;
  border: string;
  text: string;
  ring: string;
  tintBg: string;
  glow: string;
}

export function expertColorClasses(id: string): ColorClasses {
  switch (expertColor(id)) {
    case "emerald":
      return {
        bg: "bg-emerald-500", soft: "bg-emerald-500/10", border: "border-emerald-500/40",
        text: "text-emerald-300", ring: "ring-emerald-500/40",
        tintBg: "bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent",
        glow: "shadow-[0_0_24px_-4px_rgba(16,185,129,0.55)]",
      };
    case "amber":
      return {
        bg: "bg-amber-500", soft: "bg-amber-500/10", border: "border-amber-500/40",
        text: "text-amber-300", ring: "ring-amber-500/40",
        tintBg: "bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent",
        glow: "shadow-[0_0_24px_-4px_rgba(245,158,11,0.55)]",
      };
    case "rose":
      return {
        bg: "bg-rose-500", soft: "bg-rose-500/10", border: "border-rose-500/40",
        text: "text-rose-300", ring: "ring-rose-500/40",
        tintBg: "bg-gradient-to-br from-rose-500/15 via-rose-500/5 to-transparent",
        glow: "shadow-[0_0_24px_-4px_rgba(244,63,94,0.55)]",
      };
    case "sky":
      return {
        bg: "bg-sky-500", soft: "bg-sky-500/10", border: "border-sky-500/40",
        text: "text-sky-300", ring: "ring-sky-500/40",
        tintBg: "bg-gradient-to-br from-sky-500/15 via-sky-500/5 to-transparent",
        glow: "shadow-[0_0_24px_-4px_rgba(14,165,233,0.55)]",
      };
    case "orange":
      return {
        bg: "bg-orange-500", soft: "bg-orange-500/10", border: "border-orange-500/40",
        text: "text-orange-300", ring: "ring-orange-500/40",
        tintBg: "bg-gradient-to-br from-orange-500/15 via-orange-500/5 to-transparent",
        glow: "shadow-[0_0_24px_-4px_rgba(249,115,22,0.55)]",
      };
    case "teal":
      return {
        bg: "bg-teal-500", soft: "bg-teal-500/10", border: "border-teal-500/40",
        text: "text-teal-300", ring: "ring-teal-500/40",
        tintBg: "bg-gradient-to-br from-teal-500/15 via-teal-500/5 to-transparent",
        glow: "shadow-[0_0_24px_-4px_rgba(20,184,166,0.55)]",
      };
    case "fuchsia":
      return {
        bg: "bg-fuchsia-500", soft: "bg-fuchsia-500/10", border: "border-fuchsia-500/40",
        text: "text-fuchsia-300", ring: "ring-fuchsia-500/40",
        tintBg: "bg-gradient-to-br from-fuchsia-500/15 via-fuchsia-500/5 to-transparent",
        glow: "shadow-[0_0_24px_-4px_rgba(217,70,239,0.55)]",
      };
  }
}

export function expertInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
