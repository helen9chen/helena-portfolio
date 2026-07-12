"use client";

import { useEffect, useRef } from "react";
import { frogDialog, type Lang } from "@/lib/i18n";

type Entry = { zh: string; en: string; ja: string };
type Group = Record<string, Entry>;

class FrogController {
  els: { spot: HTMLElement; body: HTMLElement; bubble: HTMLElement; breath: HTMLElement };
  lang: Lang = "en";
  fx = 0;
  fy = 0;

  private dragging = false;
  private pendingDrag = false;
  private home = false;
  private leaf: HTMLElement | null = null;
  private terraDrops = 0;
  private clicks = 0;
  private eggUsed = false;
  private contactEgg = false;
  private footBusy = false;
  private aboutBusy = false;
  private curKey: keyof typeof frogDialog.single | null = null;
  private lastId: string | null = null;
  private downX = 0;
  private downY = 0;
  private lastMoveX: number | null = null;
  private lastDragMsg = 0;
  private ptrX: number | null = null;
  private ptrY: number | null = null;
  private hasExitedAboutPhoto = true;
  private lastAboutPhotoTriggerTime = 0;
  private aboutPhotoCount = 0;

  private timers: Record<string, ReturnType<typeof setTimeout>> = {};
  private io: IntersectionObserver | null = null;
  private photoIO: IntersectionObserver | null = null;
  private cleanupFns: (() => void)[] = [];

  constructor(els: FrogController["els"]) {
    this.els = els;
  }

  private clearT(k: string) {
    clearTimeout(this.timers[k]);
  }
  private setT(k: string, fn: () => void, ms: number) {
    this.clearT(k);
    this.timers[k] = setTimeout(fn, ms);
  }

  private loc(): Lang {
    return this.lang === "zh" ? "zh" : this.lang === "ja" ? "ja" : "en";
  }
  private t(entry: Entry) {
    return entry[this.loc()] || entry.en;
  }
  private setBubbleLoc() {
    const b = this.els.bubble;
    b.classList.remove("loc-zh", "loc-en", "loc-ja");
    b.classList.add("loc-" + this.loc());
  }
  private say(text: string, dur?: number) {
    const b = this.els.bubble;
    if (!text) return;
    this.curKey = null;
    this.setBubbleLoc();
    b.textContent = text;
    b.classList.add("show");
    this.clearT("bubble");
    if (dur !== 0) this.setT("bubble", () => b.classList.remove("show"), dur || 3000);
  }
  private sayId(group: Group, dur?: number) {
    const ids = Object.keys(group);
    let id = ids[0];
    for (let i = 0; i < 8; i++) {
      id = ids[Math.floor(Math.random() * ids.length)];
      if (id !== this.lastId || ids.length <= 1) break;
    }
    this.lastId = id;
    this.say(this.t(group[id]), dur);
  }
  private sayOne(key: keyof typeof frogDialog.single, dur?: number) {
    this.say(this.t(frogDialog.single[key]), dur);
    this.curKey = key;
  }

  setLang(lang: Lang) {
    this.lang = lang;
    const b = this.els.bubble;
    if (b.classList.contains("show") && this.curKey) {
      this.setBubbleLoc();
      b.textContent = this.t(frogDialog.single[this.curKey]);
    } else {
      this.clearT("bubble");
      b.classList.remove("show");
      this.setBubbleLoc();
    }
  }

  private bounds() {
    const w = window.innerWidth,
      h = window.innerHeight;
    return {
      minX: 16,
      maxX: Math.max(40, w - 104),
      minY: Math.max(Math.round(h * 0.5), h - 340),
      maxY: Math.max(120, h - 122),
    };
  }
  private place() {
    this.els.spot.style.left = this.fx + "px";
    this.els.spot.style.top = this.fy + "px";
  }
  private hop(tx: number, ty: number, then?: () => void) {
    const body = this.els.body;
    body.classList.toggle("face-l", tx < this.fx);
    body.classList.remove("blink", "look");
    body.classList.add("ready");
    this.clearT("t1");
    this.clearT("t2");
    this.setT("t1", () => {
      this.fx = tx;
      this.fy = ty;
      this.place();
      body.classList.add("jumping");
      this.setT("t2", () => {
        body.classList.remove("jumping", "ready");
        then?.();
      }, 720);
    }, 180);
  }

  private scheduleWander() {
    const delay = this.home ? 7000 + Math.random() * 6000 : 10000 + Math.random() * 10000;
    this.setT("wander", () => this.wanderStep(), delay);
  }
  private wanderStep() {
    if (this.dragging) return this.scheduleWander();
    if (this.home && this.peek()) return this.scheduleWander();
    const b = this.bounds();
    let nx = this.fx + (40 + Math.random() * 80) * (Math.random() < 0.5 ? -1 : 1);
    nx = Math.max(b.minX, Math.min(b.maxX, nx));
    const ny = Math.max(b.minY, Math.min(b.maxY, this.fy + (Math.random() * 60 - 30)));
    this.hop(nx, ny, () => this.scheduleWander());
  }
  private scheduleBlink() {
    this.setT("blink", () => {
      const body = this.els.body;
      if (!this.dragging && !body.classList.contains("jumping") && !body.classList.contains("ready")) {
        body.classList.add("blink");
        setTimeout(() => body.classList.remove("blink"), 320);
      }
      this.scheduleBlink();
    }, 4000 + Math.random() * 5000);
  }
  private scheduleLook() {
    this.setT("look", () => {
      const body = this.els.body;
      if (
        !this.dragging &&
        !body.classList.contains("jumping") &&
        !body.classList.contains("ready") &&
        !body.classList.contains("blink")
      ) {
        body.classList.add("look");
        setTimeout(() => body.classList.remove("look"), 1150);
      }
      this.scheduleLook();
    }, 12000 + Math.random() * 10000);
  }
  private resetIdle() {
    this.setT("idle", () => {
      if (!this.dragging) this.sayId(frogDialog.idle, 3200);
      this.resetIdle();
    }, 120000 + Math.random() * 60000);
  }

  private terraRect() {
    const img =
      document.querySelector(".hero-art .hero-img") || document.querySelector(".hero-img");
    return img ? img.getBoundingClientRect() : null;
  }
  private terraVisible(r: DOMRect | null): r is DOMRect {
    return !!r && r.bottom > 24 && r.top < window.innerHeight - 24;
  }
  private nearTerra() {
    const r = this.terraRect();
    if (!this.terraVisible(r)) return false;
    const fx = this.fx + 45,
      fy = this.fy + 52;
    const cx = r.left + r.width / 2,
      cy = r.top + r.height / 2;
    return Math.hypot(fx - cx, fy - cy) < Math.max(r.width, r.height) * 0.62;
  }
  private peek() {
    const r = this.terraRect();
    if (!this.terraVisible(r)) return false;
    const tx = r.left + r.width * 0.6 - 45,
      ty = r.top + r.height * 0.28 - 20;
    this.hop(Math.max(4, tx), ty, () => {
      if (Math.random() < 0.4) this.sayId(frogDialog.idle, 2800);
    });
    return true;
  }
  private enterTerra() {
    const r = this.terraRect();
    if (!r) return this.wanderStep();
    const tx = r.left + r.width / 2 - 45,
      ty = r.top + r.height * 0.4 - 20;
    this.hop(Math.max(4, tx), ty, () => this.sayOne("terra", 3000));
    this.terraDrops += 1;
    this.clearT("bye");
    if (this.terraDrops >= 3 && !this.home) {
      this.setT("bye", () => this.makeHome(), 1500);
    } else {
      this.setT("bye", () => {
        const b = this.bounds();
        const nx = Math.max(b.minX, Math.min(b.maxX, (this.terraRect() || r).left - 64));
        this.hop(nx, b.maxY, () => this.scheduleWander());
      }, 5000 + Math.random() * 5000);
    }
  }
  private makeHome() {
    this.home = true;
    this.growLeaf();
    this.sayOne("homeFound", 3600);
    this.scheduleWander();
  }
  private growLeaf() {
    const art = document.querySelector(".hero-art");
    const r = this.terraRect();
    if (!art || !r || this.leaf) return;
    const artR = art.getBoundingClientRect();
    const leaf = document.createElement("div");
    leaf.className = "terra-leaf";
    leaf.innerHTML =
      '<svg width="22" height="32" viewBox="0 0 22 32" xmlns="http://www.w3.org/2000/svg"><path d="M11 32 C11 20 11 9 11 2 C17 8 20 17 11 32 Z" fill="#8A9A5B"></path><path d="M11 32 C11 20 11 9 11 2 C5 8 2 17 11 32 Z" fill="#9AA878"></path><path d="M11 7 L11 29" stroke="#6f7d48" stroke-width="1" fill="none"></path></svg>';
    leaf.style.left = r.left - artR.left + r.width * 0.6 + "px";
    leaf.style.top = r.top - artR.top + r.height * 0.5 + "px";
    art.appendChild(leaf);
    this.leaf = leaf;
    requestAnimationFrame(() => requestAnimationFrame(() => leaf.classList.add("grown")));
  }

  private onDown = (e: PointerEvent) => {
    e.preventDefault();
    this.resetIdle();
    this.downX = e.clientX;
    this.downY = e.clientY;
    this.dragging = false;
    this.pendingDrag = true;
    this.lastMoveX = null;
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
  };
  private onMove = (e: PointerEvent) => {
    if (!this.pendingDrag) return;
    if (!this.dragging && Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > 6)
      this.startDrag();
    if (this.dragging) {
      this.fx = e.clientX - 45;
      this.fy = e.clientY - 52;
      this.place();
      if (this.lastMoveX != null && Math.abs(e.clientX - this.lastMoveX) > 2)
        this.els.body.classList.toggle("face-l", e.clientX < this.lastMoveX);
      this.lastMoveX = e.clientX;
      if (Date.now() - this.lastDragMsg > 1600) {
        this.lastDragMsg = Date.now();
        this.sayId(frogDialog.dragMove, 1600);
      }
    }
  };
  private startDrag() {
    this.dragging = true;
    ["wander", "t1", "t2", "bye"].forEach((k) => this.clearT(k));
    this.els.spot.classList.add("dragging");
    this.els.body.classList.remove("jumping", "ready", "blink", "look");
    this.els.body.classList.add("dragging");
    this.els.spot.classList.remove("peeking");
    this.sayOne("dragStart", 1800);
  }
  private onUp = (e: PointerEvent) => {
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    if (!this.pendingDrag) return;
    this.pendingDrag = false;
    if (!this.dragging) return this.onClick();
    this.dragging = false;
    this.lastMoveX = null;
    this.els.spot.classList.remove("dragging");
    this.els.body.classList.remove("dragging");
    this.resetIdle();
    if (this.nearTerra()) return this.enterTerra();
    this.sayId(frogDialog.release, 3000);
    this.setT("bye", () => this.wanderStep(), 5000 + Math.random() * 5000);
    void e;
  };
  private onClick() {
    this.resetIdle();
    this.clicks += 1;
    this.setT("clickWin", () => (this.clicks = 0), 3000);
    if (this.clicks >= 10 && !this.eggUsed) {
      this.eggUsed = true;
      return this.tenClickEgg();
    }
    this.sayId(frogDialog.random, 3000);
  }
  private tenClickEgg() {
    const body = this.els.body;
    ["wander", "t1", "t2", "bye"].forEach((k) => this.clearT(k));
    body.classList.remove("jumping", "ready", "blink", "look");
    if (this.ptrX != null) body.classList.toggle("face-l", this.ptrX < this.fx + 45);
    setTimeout(() => {
      this.sayOne("egg", 3200);
      setTimeout(() => this.followHops(3), 1500);
    }, 1000);
  }
  private followHops(n: number) {
    if (n <= 0) return this.scheduleWander();
    const b = this.bounds();
    const px = this.ptrX ?? this.fx + 45;
    const py = this.ptrY ?? this.fy + 52;
    const nx = Math.max(b.minX, Math.min(b.maxX, px - 45));
    const ny = Math.max(b.minY, Math.min(b.maxY, py - 52));
    this.hop(nx, ny, () => setTimeout(() => this.followHops(n - 1), 480));
  }
  private contactHop() {
    if (this.dragging || this.home) return;
    const form = document.querySelector(".cform") || document.getElementById("contact");
    if (!form) return;
    const r = form.getBoundingClientRect();
    const b = this.bounds();
    let nx = r.left - 72;
    if (nx < b.minX) nx = r.right + 8;
    nx = Math.max(b.minX, Math.min(b.maxX, nx));
    const ny = Math.max(b.minY, Math.min(b.maxY, r.top + 16));
    this.clearT("wander");
    this.hop(nx, ny, () => {
      this.sayOne("contact1", 2600);
      setTimeout(() => {
        if (!this.dragging) this.sayOne("contact2", 3200);
      }, 2600);
      this.setT("bye", () => this.scheduleWander(), 6600);
    });
  }
  private onHover = () => {
    if (this.dragging) return;
    const body = this.els.body;
    if (!body.classList.contains("jumping")) {
      body.classList.add("tilt");
      setTimeout(() => body.classList.remove("tilt"), 1400);
    }
    this.resetIdle();
    this.sayOne("hover", 3000);
  };

  private isFrogBusy() {
    const bubbleShown = this.els.bubble.classList.contains("show");
    return this.dragging || this.aboutBusy || this.footBusy || bubbleShown;
  }
  private initPhotoEgg() {
    const photo = document.querySelector(".ph-portrait");
    if (!photo || !("IntersectionObserver" in window)) return;
    this.photoIO = new IntersectionObserver(
      (ents) => {
        ents.forEach((en) => {
          const ratio = en.isIntersecting ? en.intersectionRatio : 0;
          if (ratio < 0.18) {
            this.hasExitedAboutPhoto = true;
            this.clearT("aboutEnter");
          }
          if (ratio >= 0.45 && this.hasExitedAboutPhoto) {
            this.setT("aboutEnter", () => this.tryAboutTrigger(photo as HTMLElement), 340);
          }
        });
      },
      { threshold: [0, 0.18, 0.45, 0.5, 0.55, 1] }
    );
    this.photoIO.observe(photo);
  }
  private tryAboutTrigger(photo: HTMLElement) {
    if (!this.hasExitedAboutPhoto) return;
    if (this.isFrogBusy() || this.home) return;
    if (Date.now() - this.lastAboutPhotoTriggerTime < 25000) return;
    const r = photo.getBoundingClientRect();
    const visH = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
    if (r.height <= 0 || visH / r.height < 0.45) return;
    this.hasExitedAboutPhoto = false;
    this.lastAboutPhotoTriggerTime = Date.now();
    this.aboutPhotoCount++;
    this.photoIntro(photo, this.aboutPhotoCount === 1);
  }
  private photoIntro(photo: HTMLElement, full: boolean) {
    if (this.dragging || this.home) {
      this.aboutBusy = false;
      return this.scheduleWander();
    }
    this.aboutBusy = true;
    this.clearT("bubble");
    this.els.bubble.classList.remove("show");
    this.clearT("wander");
    this.clearT("bye");
    const reduce =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const startDelay = full ? 500 : 260;
    setTimeout(() => {
      const r = photo.getBoundingClientRect();
      const b = this.bounds();
      const wide = window.innerWidth > 720;
      let nx: number, ny: number;
      if (wide) {
        nx = r.left - 86;
        if (nx < b.minX) nx = r.right + 10;
        ny = r.bottom - 96;
      } else {
        nx = r.left + r.width / 2 - 45;
        ny = Math.min(b.maxY, r.bottom + 4);
      }
      nx = Math.max(b.minX, Math.min(b.maxX, nx));
      ny = Math.max(b.minY, Math.min(b.maxY, ny));
      const body = this.els.body;
      const faceToPhoto = () => {
        const photoRight = r.left + r.width / 2 > nx + 45;
        body.classList.toggle("face-l", !photoRight);
      };
      const speakPause = full ? 1550 : 650;
      const done = () => {
        faceToPhoto();
        if (full) {
          body.classList.remove("blink");
          body.classList.add("look");
          setTimeout(() => body.classList.remove("look"), 1150);
        }
        setTimeout(() => {
          this.sayOne("about_photo", 3500);
          setTimeout(() => {
            body.classList.add("blink");
            setTimeout(() => body.classList.remove("blink"), 320);
            faceToPhoto();
          }, 3650);
          setTimeout(() => {
            this.aboutBusy = false;
            this.scheduleWander();
          }, 5400);
        }, speakPause);
      };
      if (reduce) {
        this.fx = nx;
        this.fy = ny;
        this.place();
        done();
      } else {
        this.hop(nx, ny, done);
      }
    }, startDelay);
  }

  init(lang: Lang) {
    this.lang = lang;
    this.setBubbleLoc();
    const b = this.bounds();
    this.fx = Math.min(b.maxX, Math.round(window.innerWidth * 0.2));
    this.fy = b.maxY;
    this.place();

    const spot = this.els.spot;
    const down = (e: PointerEvent) => this.onDown(e);
    const enter = () => this.setT("hover", this.onHover, 3000);
    const leave = () => this.clearT("hover");
    const ptr = (e: PointerEvent) => {
      this.ptrX = e.clientX;
      this.ptrY = e.clientY;
    };
    const resize = () => {
      const bb = this.bounds();
      this.fx = Math.max(bb.minX, Math.min(bb.maxX, this.fx));
      this.fy = Math.max(bb.minY, Math.min(bb.maxY, this.fy));
      if (!this.dragging) this.place();
    };
    spot.addEventListener("pointerdown", down);
    spot.addEventListener("pointerenter", enter);
    spot.addEventListener("pointerleave", leave);
    window.addEventListener("pointermove", ptr);
    window.addEventListener("resize", resize);
    this.cleanupFns.push(() => {
      spot.removeEventListener("pointerdown", down);
      spot.removeEventListener("pointerenter", enter);
      spot.removeEventListener("pointerleave", leave);
      window.removeEventListener("pointermove", ptr);
      window.removeEventListener("resize", resize);
    });

    this.scheduleWander();
    this.scheduleBlink();
    this.scheduleLook();
    this.resetIdle();

    const contact = document.getElementById("contact");
    if (contact && "IntersectionObserver" in window) {
      this.io = new IntersectionObserver(
        (ents) => {
          ents.forEach((en) => {
            if (en.isIntersecting && !this.contactEgg) {
              this.contactEgg = true;
              this.io?.disconnect();
              this.contactHop();
            }
          });
        },
        { threshold: 0.35 }
      );
      this.io.observe(contact);
    }
    this.initPhotoEgg();
  }

  destroy() {
    Object.keys(this.timers).forEach((k) => this.clearT(k));
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    this.io?.disconnect();
    this.photoIO?.disconnect();
    this.cleanupFns.forEach((fn) => fn());
    this.leaf?.remove();
  }
}

export default function Frog({ lang }: { lang: Lang }) {
  const spotRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const breathRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<FrogController | null>(null);
  const langRef = useRef(lang);

  useEffect(() => {
    if (!spotRef.current || !bodyRef.current || !bubbleRef.current || !breathRef.current)
      return;
    const ctrl = new FrogController({
      spot: spotRef.current,
      body: bodyRef.current,
      bubble: bubbleRef.current,
      breath: breathRef.current,
    });
    ctrlRef.current = ctrl;
    ctrl.init(langRef.current);
    return () => {
      ctrl.destroy();
      ctrlRef.current = null;
    };
  }, []);

  useEffect(() => {
    langRef.current = lang;
    ctrlRef.current?.setLang(lang);
  }, [lang]);

  return (
    <div className="frog-spot" ref={spotRef}>
      <div className="bubble" ref={bubbleRef} />
      <div className="frog-body" ref={bodyRef}>
        <div className="frog-breath" ref={breathRef}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="frog-img"
            src="/images/frog.png"
            alt="A little frog friend"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}
