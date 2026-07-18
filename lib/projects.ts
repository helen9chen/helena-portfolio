import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { getDb } from "./firebase";
import type { Lang } from "./i18n";

export type ProjectCat = "branding" | "marketing" | "design";
export type ProjectPh = "ph-sage" | "ph-moss" | "ph-brown" | "ph-clay";

export const MAX_PROJECT_IMAGES = 12;

// Only zh/ja need explicit overrides — English lives in the base
// `title`/`desc` fields so every project works without any translation.
export interface ProjectTranslation {
  title?: string;
  desc?: string;
}
export type ProjectTranslations = Partial<Record<"zh" | "ja", ProjectTranslation>>;

export interface Project {
  id?: string;
  title: string;
  tag: string;
  cat: ProjectCat;
  ph: ProjectPh;
  slot: string;
  desc: string;
  url?: string;
  /** @deprecated kept for older documents — use `images[0]` instead */
  image?: string;
  images?: string[];
  translations?: ProjectTranslations;
  order?: number;
}

// A project's images regardless of whether it was saved before or after
// multi-image support (older docs only have the single `image` field).
export function projectImages(p: Project): string[] {
  if (p.images && p.images.length) return p.images.slice(0, MAX_PROJECT_IMAGES);
  return p.image ? [p.image] : [];
}

// Falls back to the base (English) text whenever a translation is missing.
export function localizedTitle(p: Project, lang: Lang): string {
  if (lang === "en") return p.title;
  return p.translations?.[lang]?.title || p.title;
}
export function localizedDesc(p: Project, lang: Lang): string {
  if (lang === "en") return p.desc;
  return p.translations?.[lang]?.desc || p.desc;
}

// Shown until projects exist in Firestore (and whenever Firebase isn't configured).
export const defaultProjects: Project[] = [
  { title: "Aozora Studio Identity", tag: "Branding", cat: "branding", ph: "ph-sage", slot: "identity system", desc: "A warm, paper-soft brand identity for a small ceramics studio." },
  { title: "Matcha & Co. Rebrand", tag: "Branding", cat: "branding", ph: "ph-moss", slot: "logo & marks", desc: "A gentle rebrand — wordmark, palette and packaging for a tea house." },
  { title: "Slow Living Launch", tag: "Marketing", cat: "marketing", ph: "ph-sage", slot: "launch campaign", desc: "Go-to-market campaign for a mindful home-goods label." },
  { title: "Meadow Field Notes", tag: "Marketing", cat: "marketing", ph: "ph-brown", slot: "email & ads", desc: "Lifecycle emails and ad creative for a wellness newsletter." },
  { title: "Seasons of the Pond", tag: "Social", cat: "design", ph: "ph-clay", slot: "social series", desc: "A seasonal social series following one little frog through the year." },
  { title: "Pond Diaries", tag: "Social", cat: "design", ph: "ph-brown", slot: "content series", desc: "An ongoing content series of small, quiet daily observations." },
  { title: "Koke Reader App", tag: "Product", cat: "design", ph: "ph-moss", slot: "product design", desc: "A slow-reading app designed for focus, calm and ease." },
  { title: "Meadow Wellness Site", tag: "Product", cat: "design", ph: "ph-sage", slot: "web product", desc: "End-to-end design for a wellness site — calm flows, gentle color." },
  { title: "Café Notebook Zine", tag: "Graphic", cat: "design", ph: "ph-clay", slot: "editorial design", desc: "Editorial and print graphic design for a neighborhood café zine." },
  { title: "Little Frog Press", tag: "Graphic", cat: "design", ph: "ph-brown", slot: "print & marks", desc: "Logo, seals and stationery for an independent picture-book press." },
];

export async function fetchProjects(): Promise<Project[] | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const snap = await getDocs(
      query(collection(db, "projects"), orderBy("order", "asc"))
    );
    if (snap.empty) return null;
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Project, "id">) }));
  } catch {
    return null;
  }
}
