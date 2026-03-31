/** Carrega logo de public/logo para data URL (impressões em iframe / ficheiro guardado). */

const LOGO_CANDIDATES = ["/logo/logo.png", "/logo/logo.jpg", "/logo/logo.webp"] as const;

export async function resolvePrintLogoDataUrl(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const base = new URL(import.meta.env.BASE_URL || "/", window.location.origin).href;

  for (const path of LOGO_CANDIDATES) {
    const url = new URL(path.replace(/^\//, ""), base).href;
    try {
      const res = await fetch(url, { cache: "default" });
      if (!res.ok) continue;
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (ct.includes("text/html")) continue;
      const blob = await res.blob();
      if (!blob.size) continue;
      return await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(new Error("read"));
        r.readAsDataURL(blob);
      });
    } catch {
      /* tenta próximo formato */
    }
  }
  return null;
}
