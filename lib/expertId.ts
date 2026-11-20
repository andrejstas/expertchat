export function isValidExpertId(id: unknown): id is string {
  return typeof id === "string" && id !== "readme" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) && id.length <= 60;
}

export function slugifyExpertId(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
