"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { T, footTips, peekTexts, type Lang } from "@/lib/i18n";
import { defaultProjects, fetchProjects, type Project } from "@/lib/projects";
import { firebaseConfigured, getDb } from "@/lib/firebase";
import { sendContactEmail } from "@/lib/email";
import Frog from "./Frog";

const PETALS = [
  { l: 4, s: 15, k: "petal-leaf lc-sage", d: 15, dl: 0 },
  { l: 11, s: 18, k: "petal-flower fc-pink", d: 20, dl: 5 },
  { l: 19, s: 12, k: "petal-leaf lc-moss", d: 16, dl: 9 },
  { l: 27, s: 20, k: "petal-flower fc-blush", d: 23, dl: 2 },
  { l: 35, s: 14, k: "petal-leaf lc-pale", d: 15, dl: 12 },
  { l: 43, s: 10, k: "petal-leaf lc-brown", d: 19, dl: 6 },
  { l: 50, s: 19, k: "petal-flower fc-rose", d: 21, dl: 14 },
  { l: 57, s: 13, k: "petal-leaf lc-sage", d: 17, dl: 1 },
  { l: 64, s: 17, k: "petal-flower fc-cream", d: 22, dl: 8 },
  { l: 71, s: 12, k: "petal-leaf lc-moss", d: 16, dl: 4 },
  { l: 78, s: 21, k: "petal-flower fc-pink", d: 24, dl: 11 },
  { l: 85, s: 14, k: "petal-leaf lc-pale", d: 15, dl: 15 },
  { l: 91, s: 18, k: "petal-flower fc-blush", d: 20, dl: 3 },
  { l: 97, s: 13, k: "petal-leaf lc-brown", d: 18, dl: 7 },
];

type TabId = "all" | "branding" | "marketing" | "design";

export default function HomePage() {
  const [lang, setLang] = useState<Lang>("en");
  const [active, setActive] = useState<TabId>("all");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [contactError, setContactError] = useState("");
  // When Firebase is configured we fetch from Firestore, so start empty and
  // show a spinner; otherwise there's nothing to load — show the defaults.
  const [projects, setProjects] = useState<Project[]>(
    firebaseConfigured ? [] : defaultProjects
  );
  const [loadingProjects, setLoadingProjects] = useState(firebaseConfigured);
  const [navOn, setNavOn] = useState<string | null>(null);
  const [peek, setPeek] = useState(false);
  const [peekBubble, setPeekBubble] = useState(false);
  const [footQuiet, setFootQuiet] = useState(false);
  const [footPressed, setFootPressed] = useState(false);
  const footBusy = useRef(false);
  const scrollRAF = useRef(0);

  const t = useCallback((key: string) => T[lang][key] ?? T.en[key] ?? key, [lang]);
  const loc = lang === "zh" ? "zh" : lang === "ja" ? "ja" : "en";

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("kaeru-lang");
    } catch {}
    if (saved === "zh" || saved === "ja" || saved === "en") setLang(saved);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("kaeru-lang", lang);
    } catch {}
    document.documentElement.lang = lang === "zh" ? "zh-Hant" : lang;
  }, [lang]);

  useEffect(() => {
    if (!firebaseConfigured) return;
    let cancelled = false;
    fetchProjects().then((p) => {
      if (cancelled) return;
      setProjects(p && p.length ? p : defaultProjects);
      setLoadingProjects(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // active nav section highlighting
  useEffect(() => {
    const headerOffset = () => {
      const h = document.querySelector(".nav") as HTMLElement | null;
      return (h ? h.offsetHeight : 70) + 18;
    };
    const update = () => {
      const ids = ["work", "about", "contact"];
      const off = headerOffset() + 40;
      let cur: string | null = null;
      ids.forEach((id) => {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top - off <= 0) cur = id;
      });
      setNavOn(cur);
    };
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const bounceTitle = (id: string) => {
    const sec = document.getElementById(id);
    const h = sec?.querySelector("h2");
    if (!h) return;
    h.classList.remove("title-bounce");
    void (h as HTMLElement).offsetWidth;
    h.classList.add("title-bounce");
    setTimeout(() => h.classList.remove("title-bounce"), 660);
  };

  const scrollToId = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const header = document.querySelector(".nav") as HTMLElement | null;
    const offset = (header ? header.offsetHeight : 70) + 18;
    const startY = window.scrollY;
    const targetY = Math.max(0, el.getBoundingClientRect().top + startY - offset);
    const dist = targetY - startY;
    if (Math.abs(dist) < 2) return;
    const dur = 900,
      t0 = performance.now();
    const ease = (p: number) =>
      p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    const html = document.documentElement;
    html.style.scrollBehavior = "auto";
    cancelAnimationFrame(scrollRAF.current);
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      window.scrollTo(0, startY + dist * ease(p));
      if (p < 1) scrollRAF.current = requestAnimationFrame(step);
      else html.style.scrollBehavior = "";
    };
    scrollRAF.current = requestAnimationFrame(step);
  };

  const onNavClick = (e: React.MouseEvent, target: string) => {
    e.preventDefault();
    if (navOn === target) return bounceTitle(target);
    scrollToId(target);
  };

  const tabs: { id: TabId; label: string }[] = useMemo(
    () => [
      { id: "all", label: t("tabAll") },
      { id: "branding", label: t("tabBranding") },
      { id: "marketing", label: t("tabMarketing") },
      { id: "design", label: t("tabDesign") },
    ],
    [t]
  );

  const cards = useMemo(() => {
    const list = active === "all" ? projects : projects.filter((p) => p.cat === active);
    return list.map((p, i) => ({ ...p, num: String(i + 1).padStart(2, "0") }));
  }, [projects, active]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sending) return;
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") || "");
    const email = String(fd.get("email") || "");
    const message = String(fd.get("message") || "");
    const time = new Date().toLocaleString();

    setSending(true);
    setContactError("");

    // 1) Send the email first.
    try {
      await sendContactEmail({ name, email, message, time });
    } catch (err) {
      console.error(err);
      setSending(false);
      setContactError(t("fSendError"));
      return; // don't save or clear the form so the visitor can retry
    }

    // 2) Then store the note in Firestore so it shows up in /admin.
    const db = getDb();
    if (db) {
      try {
        const { addDoc, collection, serverTimestamp } = await import(
          "firebase/firestore"
        );
        await addDoc(collection(db, "messages"), {
          name,
          email,
          message,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        // The email already went out, so still confirm success to the visitor.
        console.error(err);
      }
    }

    setSending(false);
    setSent(true);
  };

  const footPeek = () => {
    if (footBusy.current) return;
    footBusy.current = true;
    setFootQuiet(true);
    setFootPressed(true);
    setTimeout(() => setFootPressed(false), 260);
    setPeek(true);
    setTimeout(() => setPeekBubble(true), 500);
    setTimeout(() => setPeekBubble(false), 3500);
    setTimeout(() => {
      setPeek(false);
      setFootQuiet(false);
      footBusy.current = false;
    }, 4600);
  };

  return (
    <>
      <div className="paperbg" />
      <div className="falling">
        {PETALS.map((p, i) => (
          <span
            key={i}
            className={"petal " + p.k}
            style={{
              left: p.l + "%",
              width: p.s + "px",
              height: p.s + "px",
              animationDuration: p.d + "s",
              animationDelay: "-" + p.dl + "s",
            }}
          />
        ))}
      </div>
      <Frog lang={lang} />
      <div className="site" id="top">
        <header className="nav">
          <a href="#top" className="brand">
            <img className="logo-img" src="/images/logo.png" alt="蛙の葉書" />
          </a>
          <nav className="links">
            {(
              [
                ["about", "navAbout"],
                ["work", "navProjects"],
                ["contact", "navTalk"],
              ] as const
            ).map(([target, key]) => (
              <a
                key={target}
                href={"#" + target}
                className={"nlink navlink" + (navOn === target ? " nav-on" : "")}
                onClick={(e) => onNavClick(e, target)}
              >
                {t(key)}
              </a>
            ))}
          </nav>
          <div className="langsw" role="group" aria-label="Language">
            {(
              [
                ["en", "EN"],
                ["zh", "中"],
                ["ja", "日"],
              ] as const
            ).map(([code, label]) => (
              <button
                key={code}
                className={lang === code ? "on" : ""}
                onClick={() => setLang(code)}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        <section className="hero">
          <span className="watermark serif" aria-hidden="true">
            癒
          </span>
          <div className="hero-copy">
            <span className="avail">
              <span className="dot" />
              <span>{t("heroAvail")}</span>
            </span>
            <span className="eyebrow mono" style={{ fontSize: 12 }}>
              {t("heroEyebrow")}
            </span>
            <h1 className="htitle">{t("heroTitle")}</h1>
            <p className="hlead">{t("heroLead")}</p>
            <div className="hero-cta">
              <a href="#work" className="btn btn-p" onClick={(e) => onNavClick(e, "work")}>
                {t("heroView")}
              </a>
              <a
                href="#contact"
                className="btn btn-g"
                onClick={(e) => onNavClick(e, "contact")}
              >
                {t("heroHello")}
              </a>
            </div>
            <div className="hero-meta">
              <span>{t("meta1")}</span>
              <span>{t("meta3")}</span>
              <span>{t("meta4")}</span>
              <span>{t("meta5")}</span>
              <span>{t("meta6")}</span>
            </div>
          </div>
          <div className="hero-art">
            <img
              className="hero-img"
              src="/images/hero-terrarium.jpg"
              alt="A little terrarium world — soil, grass and a frog's footprints"
            />
            <div className="art-cap">
              <span className="t mono" style={{ color: "#7C766A" }}>
                Where Ideas Take Root
              </span>
              <span className="n mono">ライフ · 2026</span>
            </div>
          </div>
        </section>

        <section className="sec" id="work">
          <div className="inner">
            <div className="work-head">
              <div>
                <span className="eyebrow mono">{t("workEyebrow")}</span>
                <h2 className="serif">{t("workTitle")}</h2>
              </div>
              <p className="work-sub">{t("workSub")}</p>
            </div>
            <div className="tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  className={tab.id === active ? "tab tab-on" : "tab"}
                  onClick={() => setActive(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="grid-cards hover-lift">
              {loadingProjects && (
                <div className="work-loading">
                  <div className="spinner" role="status" aria-label="Loading projects" />
                  <span>{t("loadingProjects")}</span>
                </div>
              )}
              {!loadingProjects &&
                cards.map((p) => {
                const card = (
                  <article className="card" key={(p.id ?? p.title) + p.num}>
                    <div className={"ph " + p.ph + (p.image ? " ph-img" : "")}>
                      {p.image && <img src={p.image} alt={p.title} />}
                      <span className="phlabel mono">{p.slot}</span>
                    </div>
                    <div className="cbody">
                      <div className="crow">
                        <span className="ctag">{p.tag}</span>
                        <span className="cnum">{p.num}</span>
                      </div>
                      <h3 className="ctitle serif">{p.title}</h3>
                      <p className="cdesc">{p.desc}</p>
                      <span className="cfoot">
                        {t("viewProject")} <span className="arw">→</span>
                      </span>
                    </div>
                  </article>
                );
                return p.url ? (
                  <a
                    key={(p.id ?? p.title) + p.num + "-link"}
                    href={p.url}
                    target="_blank"
                    rel="noopener"
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    {card}
                  </a>
                ) : (
                  card
                );
              })}
            </div>
          </div>
        </section>

        <section className="sec" id="about">
          <div className="inner">
            <div className="about-intro">
              <div>
                <span className="eyebrow mono">{t("aboutEyebrow")}</span>
                <span className="about-name serif">{t("aboutName")}</span>
                <h2 className="serif">{t("aboutTitle")}</h2>
                <p>{t("aboutIntro")}</p>
              </div>
              <div className="ph-portrait">
                <img
                  className="portrait-img"
                  src="/images/portrait.png"
                  alt="Portrait of the designer"
                />
              </div>
            </div>
            <div className="about-cols">
              <div className="acol">
                <span className="eyebrow mono">{t("logEyebrow")}</span>
                <h3 className="serif">{t("logTitle")}</h3>
                <p>{t("logBody")}</p>
                <div className="chips">
                  {["Brand Strategy", "Visual Identity", "Marketing", "Creative Direction"].map(
                    (c) => (
                      <span className="chip" key={c}>
                        {c}
                      </span>
                    )
                  )}
                </div>
              </div>
              <div className="acol">
                <span className="eyebrow mono">{t("creEyebrow")}</span>
                <h3 className="serif">{t("creTitle")}</h3>
                <p>{t("creBody")}</p>
                <div className="chips">
                  {["Travel", "Culture", "Observation", "Photography"].map((c) => (
                    <span className="chip" key={c}>
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="langs">
              <span className="eyebrow mono">{t("langsEyebrow")}</span>
              <div className="langrow">
                <div className="langitem">
                  <span className="lgname serif">中文 · Chinese</span>
                  <span className="lglvl">{t("lgNative")}</span>
                </div>
                <div className="langitem">
                  <span className="lgname serif">日本語 · Japanese</span>
                  <span className="lglvl">{t("lgPro")}</span>
                </div>
                <div className="langitem">
                  <span className="lgname serif">English</span>
                  <span className="lglvl">{t("lgConv")}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer className="contact" id="contact">
          <span className="eyebrow mono">{t("contactEyebrow")}</span>
          <h2 className="serif">{t("contactTitle")}</h2>
          <p className="closing">{t("contactClosing")}</p>
          {sent ? (
            <div className="sent">
              <span className="s-em">🌱</span>
              <h3>{t("sentTitle")}</h3>
              <p>{t("sentBody")}</p>
            </div>
          ) : (
            <form className="cform" onSubmit={onSubmit}>
              <div className="frow">
                <div className="field">
                  <label>{t("fName")}</label>
                  <input type="text" name="name" placeholder={t("phName")} required />
                </div>
                <div className="field">
                  <label>{t("fEmail")}</label>
                  <input type="email" name="email" placeholder={t("phEmail")} required />
                </div>
              </div>
              <div className="field">
                <label>{t("fMsg")}</label>
                <textarea name="message" placeholder={t("phMsg")} required />
              </div>
              <button type="submit" className="btn btn-p" disabled={sending}>
                {sending ? t("fSending") : t("fSend")}
              </button>
              {contactError && <p className="cerror">{contactError}</p>}
              <p className="cnote">
                <span>{t("fNote")}</span>{" "}
                <a
                  href="mailto:hello@kaeru.studio"
                  className="email serif"
                  style={{ fontSize: 14, margin: 0, border: "none", padding: 0 }}
                >
                  hello@kaeru.studio
                </a>
              </p>
            </form>
          )}
          <div className="foot-row">
            <div className="foot-l">
              <a
                href="#top"
                aria-label="Back to top"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToId("top");
                  window.scrollTo({ top: 0 });
                }}
              >
                <img className="logo-img" src="/images/logo.png" alt="蛙の葉書" />
              </a>
            </div>
            <div className="foot-c">
              <a
                href="https://instagram.com"
                className="foot-link"
                target="_blank"
                rel="noopener"
              >
                Instagram <span className="foot-arw">↗</span>
              </a>
              <a
                href="https://linkedin.com"
                className="foot-link"
                target="_blank"
                rel="noopener"
              >
                LinkedIn <span className="foot-arw">↗</span>
              </a>
            </div>
            <div className="foot-r">
              <span>© 2026 Helena</span>
              <span>Made from little observations.</span>
            </div>
          </div>
          <div className="foot-egg">
            <span
              className={
                "foot-print" + (footPressed ? " pressed" : "") + (footQuiet ? " quiet" : "")
              }
              role="button"
              tabIndex={0}
              aria-label="Reveal the frog easter egg"
              onClick={footPeek}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
                  e.preventDefault();
                  footPeek();
                }
              }}
            >
              <svg
                viewBox="0 0 24 30"
                width="24"
                height="30"
                xmlns="http://www.w3.org/2000/svg"
                fill="#7C8F5A"
              >
                <ellipse cx="12" cy="22" rx="5" ry="4.5" />
                <ellipse cx="6" cy="12" rx="2.4" ry="6" transform="rotate(-22 6 12)" />
                <ellipse cx="12" cy="9" rx="2.4" ry="6.5" />
                <ellipse cx="18" cy="12" rx="2.4" ry="6" transform="rotate(22 18 12)" />
              </svg>
            </span>
            <div className={"foot-tip loc-" + loc}>{footTips[loc]}</div>
            <div className={"peek-frog" + (peek ? " show" : "")}>
              <div className={"peek-bubble loc-" + loc + (peekBubble ? " show" : "")}>
                {peekTexts[loc]}
              </div>
              <img src="/images/frog.png" alt="" draggable={false} />
            </div>
          </div>
        </footer>
      </div>
      <div className="grain" />
    </>
  );
}
