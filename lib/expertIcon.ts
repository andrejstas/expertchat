import { expertColor, expertInitials } from "./expertColor";

// Tailwind 400 → 600 for each palette colour, matching the app icon's gradient style.
const GRADIENTS: Record<ReturnType<typeof expertColor>, [string, string]> = {
  emerald: ["#34d399", "#059669"],
  amber: ["#fbbf24", "#d97706"],
  rose: ["#fb7185", "#e11d48"],
  sky: ["#38bdf8", "#0284c7"],
  orange: ["#fb923c", "#ea580c"],
  teal: ["#2dd4bf", "#0d9488"],
  fuchsia: ["#e879f9", "#c026d3"],
};

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function expertIconSvg(id: string, name: string): string {
  const [from, to] = GRADIENTS[expertColor(id)];
  const initials = escapeXml(expertInitials(name));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${from}"/>
      <stop offset="1" stop-color="${to}"/>
    </linearGradient>
    <linearGradient id="hl" x1="0" y1="0" x2="0" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.18"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="7" fill="url(#bg)"/>
  <rect width="32" height="32" rx="7" fill="url(#hl)"/>
  <text x="16" y="16" dy="0.36em" text-anchor="middle" fill="#ffffff"
    font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Arial, sans-serif"
    font-size="${initials.length > 1 ? 15 : 18}" font-weight="700" letter-spacing="-0.5">${initials}</text>
</svg>
`;
}
