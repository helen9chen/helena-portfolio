"use client";

import { useCallback, useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { firebaseConfigured, getDb, sha256Hex } from "@/lib/firebase";
import {
  defaultProjects,
  type Project,
  type ProjectCat,
  type ProjectPh,
} from "@/lib/projects";
import { fileToCompressedDataUrl } from "@/lib/image";

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
  image: "",
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [editing, setEditing] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

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
      setProjects(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Project, "id">) }))
      );
    } catch (e) {
      console.error(e);
    }
  }, [db]);

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
      const { id, ...data } = editing;
      if (id) {
        await updateDoc(doc(db, "projects", id), { ...data });
      } else {
        await addDoc(collection(db, "projects"), {
          ...data,
          order: projects.length,
        });
      }
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

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editing) return;
    setUploading(true);
    setError("");
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      setEditing((prev) => (prev ? { ...prev, image: dataUrl } : prev));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not process that image."
      );
    }
    setUploading(false);
  };

  const removeProject = async (p: Project) => {
    if (!db || !p.id) return;
    if (!confirm(`Delete "${p.title}"?`)) return;
    await deleteDoc(doc(db, "projects", p.id));
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
              {projects.length === 0 && (
                <button className="btn btn-g btn-sm" onClick={seedDefaults} disabled={saving}>
                  Import the 10 default projects
                </button>
              )}
              <button
                className="btn btn-p btn-sm"
                onClick={() => setEditing({ ...EMPTY })}
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
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="swatch"
                    src={p.image}
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
                  </div>
                </div>
                <div className="pi-actions">
                  <button className="btn btn-g btn-sm" onClick={() => move(i, -1)} title="Move up">
                    ↑
                  </button>
                  <button className="btn btn-g btn-sm" onClick={() => move(i, 1)} title="Move down">
                    ↓
                  </button>
                  <button className="btn btn-g btn-sm" onClick={() => setEditing({ ...p })}>
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
            <form onSubmit={saveProject}>
              <div className="admin-grid">
                <div className="field">
                  <label>Title</label>
                  <input
                    value={editing.title}
                    onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                    required
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
                  <label>Project image (optional, replaces the color placeholder)</label>
                  <div className="admin-row">
                    <label className="btn btn-g btn-sm" style={{ cursor: "pointer" }}>
                      {uploading ? "Processing…" : "Upload image"}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={onPickImage}
                        disabled={uploading}
                        style={{ display: "none" }}
                      />
                    </label>
                    {editing.image && (
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => setEditing({ ...editing, image: "" })}
                      >
                        Remove image
                      </button>
                    )}
                  </div>
                  {editing.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={editing.image}
                      alt="Preview"
                      style={{
                        marginTop: 10,
                        width: 180,
                        aspectRatio: "4 / 3",
                        objectFit: "cover",
                        borderRadius: 12,
                        border: "1px solid var(--line)",
                        display: "block",
                      }}
                    />
                  )}
                  <input
                    style={{ marginTop: 10 }}
                    value={editing.image?.startsWith("data:") ? "" : editing.image ?? ""}
                    onChange={(e) => setEditing({ ...editing, image: e.target.value })}
                    placeholder="…or paste an image URL (https://… or /images/…)"
                  />
                </div>
                <div className="field full">
                  <label>Description</label>
                  <textarea
                    value={editing.desc}
                    onChange={(e) => setEditing({ ...editing, desc: e.target.value })}
                    required
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
