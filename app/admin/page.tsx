"use client";

import { useCallback, useEffect, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { firebaseConfigured, getDb, sha256Hex } from "@/lib/firebase";
import {
  defaultProjects,
  fetchProjectPhotos,
  MAX_PHOTO_BYTES,
  MAX_PROJECT_IMAGES,
  projectImages,
  type Project,
  type ProjectCat,
  type ProjectPh,
} from "@/lib/projects";
import { fileToCompressedDataUrl } from "@/lib/image";

function formatKB(bytes: number): string {
  return Math.round(bytes / 1024) + " KB";
}

// Replaces a project's `photos` subcollection with the given ordered list of
// image URLs. Each photo is its own document so it gets its own budget under
// Firestore's 1 MiB-per-document cap instead of all 12 sharing one pool.
async function syncProjectPhotos(db: Firestore, projectId: string, images: string[]) {
  const photosRef = collection(db, "projects", projectId, "photos");
  const existing = await getDocs(photosRef);
  const batch = writeBatch(db);
  existing.docs.forEach((d) => batch.delete(d.ref));
  images.forEach((url, i) => {
    batch.set(doc(photosRef), { url, order: i });
  });
  await batch.commit();
}

type EditLang = "en" | "zh" | "ja";
const EDIT_LANGS: { code: EditLang; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "zh", label: "中" },
  { code: "ja", label: "日" },
];

const PH_OPTIONS: ProjectPh[] = ["ph-sage", "ph-moss", "ph-brown", "ph-clay"];
const CAT_OPTIONS: ProjectCat[] = ["branding", "marketing", "design"];
const SWATCH: Record<ProjectPh, string> = {
  "ph-sage": "#C9D2AF",
  "ph-moss": "#B7C29A",
  "ph-brown": "#CFBDA4",
  "ph-clay": "#DAC5AE",
};

const EMPTY: Project = {
  title: "",
  tag: "",
  cat: "branding",
  ph: "ph-sage",
  slot: "",
  desc: "",
  url: "",
  images: [],
};

interface Message {
  id: string;
  name?: string;
  email?: string;
  message?: string;
  createdAt?: { toDate?: () => Date };
}

export default function AdminPage() {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [projects, setProjects] = useState<Project[]>([]);
  const [legacyIds, setLegacyIds] = useState<Set<string>>(new Set());
  const [migrating, setMigrating] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [editing, setEditing] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [editLang, setEditLang] = useState<EditLang>("en");

  const db = getDb();

  // --- auth ---

  useEffect(() => {
    (async () => {
      if (!db) {
        setChecking(false);
        return;
      }
      try {
        if (sessionStorage.getItem("kaeru-admin") === "1") {
          setAuthed(true);
        }
        const snap = await getDoc(doc(db, "settings", "admin"));
        if (!snap.exists() || !snap.data()?.passwordHash) setNeedsSetup(true);
      } catch (e) {
        setError("Could not reach Firestore. Check your Firebase config and rules.");
        console.error(e);
      }
      setChecking(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return;
    setError("");
    try {
      const snap = await getDoc(doc(db, "settings", "admin"));
      const hash = snap.data()?.passwordHash as string | undefined;
      if (!hash) {
        setNeedsSetup(true);
        return;
      }
      if ((await sha256Hex(password)) === hash) {
        sessionStorage.setItem("kaeru-admin", "1");
        setAuthed(true);
        setPassword("");
      } else {
        setError("Wrong password.");
      }
    } catch (e) {
      setError("Could not verify the password. Check Firestore rules.");
      console.error(e);
    }
  };

  const setupPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return;
    setError("");
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== password2) return setError("Passwords don't match.");
    try {
      // Never overwrite an existing password from this screen.
      const snap = await getDoc(doc(db, "settings", "admin"));
      if (snap.exists() && snap.data()?.passwordHash) {
        setNeedsSetup(false);
        return setError("A password already exists. Please sign in.");
      }
      await setDoc(doc(db, "settings", "admin"), {
        passwordHash: await sha256Hex(password),
      });
      sessionStorage.setItem("kaeru-admin", "1");
      setNeedsSetup(false);
      setAuthed(true);
      setPassword("");
      setPassword2("");
    } catch (e) {
      setError("Could not save the password. Check Firestore rules.");
      console.error(e);
    }
  };

  const logout = () => {
    sessionStorage.removeItem("kaeru-admin");
    setAuthed(false);
  };

  // --- data ---

  const loadProjects = useCallback(async () => {
    if (!db) return;
    try {
      const snap = await getDocs(query(collection(db, "projects"), orderBy("order", "asc")));
      const loaded = snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Omit<Project, "id">) }) as Project
      );
      const legacy = new Set<string>();
      await Promise.all(
        loaded.map(async (p) => {
          if (!p.id) return;
          const photos = await fetchProjectPhotos(db, p.id);
          if (photos.length) {
            p.images = photos;
          } else if (projectImages(p).length) {
            // Has photos, but they're still sitting inline on the project
            // document (pre-dates the photos subcollection) — flag for migration.
            legacy.add(p.id);
          }
        })
      );
      setProjects(loaded);
      setLegacyIds(legacy);
    } catch (e) {
      console.error(e);
    }
  }, [db]);

  // Moves a project's inline photos into its `photos` subcollection and
  // clears them off the main document. Safe to call repeatedly — if the
  // project has no inline images left, it's a no-op.
  const migrateOne = useCallback(
    async (p: Project) => {
      if (!db || !p.id) return;
      const images = projectImages(p);
      if (!images.length) return;
      await syncProjectPhotos(db, p.id, images);
      await updateDoc(doc(db, "projects", p.id), { images: [], image: "" });
    },
    [db]
  );

  const migrateProject = async (p: Project) => {
    if (!db) return;
    setMigrating(true);
    setError("");
    try {
      await migrateOne(p);
      await loadProjects();
      setNotice(`Migrated "${p.title}" to the new photo storage.`);
      setTimeout(() => setNotice(""), 2500);
    } catch (e) {
      setError("Migration failed. Check Firestore rules.");
      console.error(e);
    }
    setMigrating(false);
  };

  const migrateAllLegacy = async () => {
    if (!db) return;
    const targets = projects.filter((p) => p.id && legacyIds.has(p.id));
    if (!targets.length) return;
    setMigrating(true);
    setError("");
    try {
      for (const p of targets) await migrateOne(p);
      await loadProjects();
      setNotice(`Migrated ${targets.length} project${targets.length > 1 ? "s" : ""}.`);
      setTimeout(() => setNotice(""), 2500);
    } catch (e) {
      setError("Migration failed. Check Firestore rules.");
      console.error(e);
    }
    setMigrating(false);
  };

  const loadMessages = useCallback(async () => {
    if (!db) return;
    try {
      const snap = await getDocs(
        query(collection(db, "messages"), orderBy("createdAt", "desc"))
      );
      setMessages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Message, "id">) })));
    } catch {
      /* messages are optional */
    }
  }, [db]);

  useEffect(() => {
    if (authed) {
      loadProjects();
      loadMessages();
    }
  }, [authed, loadProjects, loadMessages]);

  const saveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !editing) return;
    setSaving(true);
    setError("");
    try {
      const images = (editing.images ?? []).slice(0, MAX_PROJECT_IMAGES);
      const oversized = images.find((src) => src.length > MAX_PHOTO_BYTES);
      if (oversized) {
        setError(
          `One of these photos is too large on its own (${formatKB(oversized.length)}, ` +
            `over the ${formatKB(MAX_PHOTO_BYTES)} limit) — remove it and re-upload, or ` +
            `paste a smaller image URL instead.`
        );
        setSaving(false);
        return;
      }
      const { id, ...rest } = editing;
      // Photos live in their own subcollection now — keep the main document
      // small and just store the lightweight fields here.
      const data = { ...rest, images: [], image: "" };
      let projectId = id;
      if (id) {
        await updateDoc(doc(db, "projects", id), { ...data });
      } else {
        const ref = await addDoc(collection(db, "projects"), {
          ...data,
          order: projects.length,
        });
        projectId = ref.id;
      }
      if (projectId) await syncProjectPhotos(db, projectId, images);
      setEditing(null);
      await loadProjects();
      setNotice("Saved.");
      setTimeout(() => setNotice(""), 2000);
    } catch (e) {
      setError("Save failed. Check Firestore rules.");
      console.error(e);
    }
    setSaving(false);
  };

  const onPickImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length || !editing) return;
    const current = editing.images ?? [];
    const room = MAX_PROJECT_IMAGES - current.length;
    if (room <= 0) {
      setError(`You can add up to ${MAX_PROJECT_IMAGES} images per project.`);
      return;
    }
    const toProcess = files.slice(0, room);
    setUploading(true);
    setError("");
    try {
      // Each photo becomes its own Firestore document, so every photo gets
      // its own generous budget rather than sharing one project-wide pool.
      const newUrls = await Promise.all(
        toProcess.map((f) => fileToCompressedDataUrl(f))
      );
      setEditing((prev) =>
        prev ? { ...prev, images: [...(prev.images ?? []), ...newUrls] } : prev
      );
      if (files.length > toProcess.length) {
        setError(
          `Only added ${toProcess.length} — a project can have up to ${MAX_PROJECT_IMAGES} images.`
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not process that image."
      );
    }
    setUploading(false);
  };

  const removeImageAt = (index: number) => {
    setEditing((prev) =>
      prev
        ? { ...prev, images: (prev.images ?? []).filter((_, i) => i !== index) }
        : prev
    );
  };

  const addImageUrl = () => {
    const url = imageUrlInput.trim();
    if (!url || !editing) return;
    const current = editing.images ?? [];
    if (current.length >= MAX_PROJECT_IMAGES) {
      setError(`You can add up to ${MAX_PROJECT_IMAGES} images per project.`);
      return;
    }
    if (url.length > MAX_PHOTO_BYTES) {
      setError(`That image is too large (${formatKB(url.length)}) — the limit is ${formatKB(MAX_PHOTO_BYTES)} per photo.`);
      return;
    }
    setEditing({ ...editing, images: [...current, url] });
    setImageUrlInput("");
  };

  const setTranslationField = (
    lang: "zh" | "ja",
    field: "title" | "desc",
    value: string
  ) => {
    setEditing((prev) =>
      prev
        ? {
            ...prev,
            translations: {
              ...prev.translations,
              [lang]: { ...prev.translations?.[lang], [field]: value },
            },
          }
        : prev
    );
  };

  const removeProject = async (p: Project) => {
    if (!db || !p.id) return;
    if (!confirm(`Delete "${p.title}"?`)) return;
    const photosRef = collection(db, "projects", p.id, "photos");
    const existingPhotos = await getDocs(photosRef);
    const batch = writeBatch(db);
    existingPhotos.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, "projects", p.id));
    await batch.commit();
    await loadProjects();
  };

  const move = async (index: number, dir: -1 | 1) => {
    if (!db) return;
    const j = index + dir;
    if (j < 0 || j >= projects.length) return;
    const a = projects[index],
      b = projects[j];
    if (!a.id || !b.id) return;
    await Promise.all([
      updateDoc(doc(db, "projects", a.id), { order: j }),
      updateDoc(doc(db, "projects", b.id), { order: index }),
    ]);
    await loadProjects();
  };

  const seedDefaults = async () => {
    if (!db) return;
    setSaving(true);
    try {
      await Promise.all(
        defaultProjects.map((p, i) =>
          addDoc(collection(db, "projects"), { ...p, order: i })
        )
      );
      await loadProjects();
    } catch (e) {
      setError("Seed failed. Check Firestore rules.");
      console.error(e);
    }
    setSaving(false);
  };

  // --- render ---

  if (!firebaseConfigured) {
    return (
      <div className="admin">
        <div className="paperbg" />
        <div className="admin-inner">
          <div className="admin-card admin-login">
            <h2>Admin · Firebase not configured</h2>
            <p className="admin-note">
              Copy <code>.env.local.example</code> to <code>.env.local</code>, fill in your
              Firebase web-app keys, and restart the dev server. Setup steps are in the
              README.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (checking) {
    return (
      <div className="admin">
        <div className="paperbg" />
        <div className="admin-inner">
          <p className="admin-sub">…</p>
        </div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="admin">
        <div className="paperbg" />
        <div className="admin-inner">
          <div className="admin-card admin-login">
            {needsSetup ? (
              <>
                <h2>First-time setup 🐸</h2>
                <p className="admin-note" style={{ marginBottom: 16 }}>
                  No admin password exists yet. Choose one — it will be stored (hashed) in
                  Firestore at <code>settings/admin</code>.
                </p>
                <form onSubmit={setupPassword} style={{ display: "grid", gap: 12 }}>
                  <div className="field">
                    <label>New password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="field">
                    <label>Repeat password</label>
                    <input
                      type="password"
                      value={password2}
                      onChange={(e) => setPassword2(e.target.value)}
                    />
                  </div>
                  <button className="btn btn-p" type="submit">
                    Create password
                  </button>
                </form>
              </>
            ) : (
              <>
                <h2>Admin sign in</h2>
                <form onSubmit={login} style={{ display: "grid", gap: 12 }}>
                  <div className="field">
                    <label>Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <button className="btn btn-p" type="submit">
                    Enter
                  </button>
                </form>
              </>
            )}
            {error && <p className="admin-err">{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin">
      <div className="paperbg" />
      <div className="admin-inner">
        <div className="admin-row" style={{ justifyContent: "space-between" }}>
          <div>
            <h1>蛙の葉書 · Admin</h1>
            <p className="admin-sub">Projects live in Firestore and update the site instantly.</p>
          </div>
          <button className="btn btn-g btn-sm" onClick={logout}>
            Sign out
          </button>
        </div>

        <div className="admin-card">
          <div className="admin-row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
            <h2 style={{ margin: 0 }}>Projects ({projects.length})</h2>
            <div className="admin-row">
              {legacyIds.size > 0 && (
                <button
                  className="btn btn-g btn-sm"
                  onClick={migrateAllLegacy}
                  disabled={migrating}
                  title="Move photos still stored inline on the project into the new photos subcollection"
                >
                  {migrating
                    ? "Migrating…"
                    : `Migrate ${legacyIds.size} legacy project${legacyIds.size > 1 ? "s" : ""}`}
                </button>
              )}
              {projects.length === 0 && (
                <button className="btn btn-g btn-sm" onClick={seedDefaults} disabled={saving}>
                  Import the 10 default projects
                </button>
              )}
              <button
                className="btn btn-p btn-sm"
                onClick={() => {
                  setEditing({ ...EMPTY });
                  setImageUrlInput("");
                  setEditLang("en");
                  setError("");
                }}
              >
                + New project
              </button>
            </div>
          </div>

          {projects.length === 0 && (
            <p className="admin-note">
              No projects in Firestore yet — the site is showing its built-in defaults.
            </p>
          )}

          <div className="proj-list">
            {projects.map((p, i) => (
              <div className="proj-item" key={p.id}>
                {projectImages(p)[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="swatch"
                    src={projectImages(p)[0]}
                    alt=""
                    style={{ objectFit: "cover" }}
                  />
                ) : (
                  <span className="swatch" style={{ background: SWATCH[p.ph] ?? "#ddd" }} />
                )}
                <div className="pi-main">
                  <div className="pi-title">{p.title}</div>
                  <div className="pi-meta">
                    {p.tag} · {p.cat} · {p.slot}
                    {projectImages(p).length > 1 ? ` · ${projectImages(p).length} photos` : ""}
                    {p.id && legacyIds.has(p.id) ? " · legacy photo storage" : ""}
                  </div>
                </div>
                <div className="pi-actions">
                  {p.id && legacyIds.has(p.id) && (
                    <button
                      className="btn btn-g btn-sm"
                      onClick={() => migrateProject(p)}
                      disabled={migrating}
                      title="Move this project's photos into the new photos subcollection"
                    >
                      Migrate
                    </button>
                  )}
                  <button className="btn btn-g btn-sm" onClick={() => move(i, -1)} title="Move up">
                    ↑
                  </button>
                  <button className="btn btn-g btn-sm" onClick={() => move(i, 1)} title="Move down">
                    ↓
                  </button>
                  <button
                    className="btn btn-g btn-sm"
                    onClick={() => {
                      setEditing({ ...p, images: projectImages(p) });
                      setImageUrlInput("");
                      setEditLang("en");
                      setError("");
                    }}
                  >
                    Edit
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => removeProject(p)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {notice && <p className="admin-ok">{notice}</p>}
          {error && <p className="admin-err">{error}</p>}
        </div>

        {editing && (
          <div className="admin-card">
            <h2>{editing.id ? "Edit project" : "New project"}</h2>
            <div
              className="admin-row"
              style={{ justifyContent: "space-between", marginBottom: 16 }}
            >
              <span className="admin-note" style={{ margin: 0 }}>
                Editing the title &amp; description in —
              </span>
              <div className="langsw" role="group" aria-label="Content language">
                {EDIT_LANGS.map(({ code, label }) => (
                  <button
                    key={code}
                    type="button"
                    className={editLang === code ? "on" : ""}
                    onClick={() => setEditLang(code)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <form onSubmit={saveProject}>
              <div className="admin-grid">
                <div className="field">
                  <label>
                    Title
                    {editLang !== "en" && (
                      <span style={{ textTransform: "none", letterSpacing: 0 }}>
                        {" "}
                        · optional, falls back to English
                      </span>
                    )}
                  </label>
                  <input
                    value={
                      editLang === "en"
                        ? editing.title
                        : editing.translations?.[editLang]?.title ?? ""
                    }
                    onChange={(e) =>
                      editLang === "en"
                        ? setEditing({ ...editing, title: e.target.value })
                        : setTranslationField(editLang, "title", e.target.value)
                    }
                    placeholder={editLang === "en" ? undefined : editing.title}
                    required={editLang === "en"}
                  />
                </div>
                <div className="field">
                  <label>Tag (shown on card)</label>
                  <input
                    value={editing.tag}
                    onChange={(e) => setEditing({ ...editing, tag: e.target.value })}
                    placeholder="Branding / Social / Product…"
                    required
                  />
                </div>
                <div className="field">
                  <label>Category (filter tab)</label>
                  <select
                    value={editing.cat}
                    onChange={(e) =>
                      setEditing({ ...editing, cat: e.target.value as ProjectCat })
                    }
                  >
                    {CAT_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Placeholder color</label>
                  <select
                    value={editing.ph}
                    onChange={(e) =>
                      setEditing({ ...editing, ph: e.target.value as ProjectPh })
                    }
                  >
                    {PH_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c.replace("ph-", "")}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Slot label</label>
                  <input
                    value={editing.slot}
                    onChange={(e) => setEditing({ ...editing, slot: e.target.value })}
                    placeholder="identity system"
                  />
                </div>
                <div className="field">
                  <label>Link URL (optional)</label>
                  <input
                    value={editing.url ?? ""}
                    onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                    placeholder="https://…"
                  />
                </div>
                <div className="field full">
                  <label>
                    Project photos ({(editing.images ?? []).length}/{MAX_PROJECT_IMAGES}) —
                    the first one is the card cover
                  </label>
                  {(editing.images ?? []).length > 0 && (
                    <div className="img-grid">
                      {(editing.images ?? []).map((src, i) => (
                        <div className="img-thumb" key={i}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt={`Photo ${i + 1}`} />
                          {i === 0 && <span className="img-cover-badge">cover</span>}
                          <button
                            type="button"
                            className="img-thumb-remove"
                            aria-label="Remove photo"
                            onClick={() => removeImageAt(i)}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {(editing.images ?? []).length < MAX_PROJECT_IMAGES && (
                    <>
                      <div className="admin-row" style={{ marginTop: 10 }}>
                        <label className="btn btn-g btn-sm" style={{ cursor: "pointer" }}>
                          {uploading ? "Processing…" : "Upload photos"}
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={onPickImages}
                            disabled={uploading}
                            style={{ display: "none" }}
                          />
                        </label>
                      </div>
                      <div className="admin-row" style={{ marginTop: 10 }}>
                        <input
                          value={imageUrlInput}
                          onChange={(e) => setImageUrlInput(e.target.value)}
                          placeholder="…or paste an image URL (https://… or /images/…)"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addImageUrl();
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn-g btn-sm"
                          onClick={addImageUrl}
                        >
                          Add
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <div className="field full">
                  <label>
                    Description
                    {editLang !== "en" && (
                      <span style={{ textTransform: "none", letterSpacing: 0 }}>
                        {" "}
                        · optional, falls back to English
                      </span>
                    )}
                  </label>
                  <textarea
                    value={
                      editLang === "en"
                        ? editing.desc
                        : editing.translations?.[editLang]?.desc ?? ""
                    }
                    onChange={(e) =>
                      editLang === "en"
                        ? setEditing({ ...editing, desc: e.target.value })
                        : setTranslationField(editLang, "desc", e.target.value)
                    }
                    placeholder={editLang === "en" ? undefined : editing.desc}
                    required={editLang === "en"}
                  />
                </div>
              </div>
              <div className="admin-row" style={{ marginTop: 16 }}>
                <button className="btn btn-p btn-sm" type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  className="btn btn-g btn-sm"
                  type="button"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="admin-card">
          <h2>Notes from the contact form ({messages.length})</h2>
          {messages.length === 0 && <p className="admin-note">No messages yet.</p>}
          {messages.map((m) => (
            <div className="msg-item" key={m.id}>
              <div className="m-head">
                <span>
                  {m.name} · {m.email}
                </span>
                <span>{m.createdAt?.toDate?.()?.toLocaleString?.() ?? ""}</span>
              </div>
              <div className="m-body">{m.message}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
