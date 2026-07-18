"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface LightboxProps {
  images: string[];
  initialIndex: number;
  title: string;
  onClose: () => void;
}

type Phase = "entering" | "open" | "closing";
const CLOSE_MS = 320;

export default function Lightbox({ images, initialIndex, title, onClose }: LightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const [phase, setPhase] = useState<Phase>("entering");
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const thumbRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const multi = images.length > 1;

  const requestClose = useCallback(() => {
    setPhase("closing");
    window.setTimeout(onClose, CLOSE_MS);
  }, [onClose]);

  const go = useCallback(
    (dir: 1 | -1) => {
      setIndex((i) => (i + dir + images.length) % images.length);
    },
    [images.length]
  );

  // Fade/scale in shortly after mount (so the initial "entering" state actually
  // paints before we flip to "open" — otherwise there's nothing to transition
  // from). A timeout is used instead of requestAnimationFrame because rAF is
  // throttled to never fire on backgrounded/inactive tabs.
  useEffect(() => {
    const t = window.setTimeout(() => setPhase("open"), 20);

    const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (scrollBarWidth > 0) document.body.style.paddingRight = scrollBarWidth + "px";

    closeBtnRef.current?.focus();

    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, []);

  // Escape / arrow keys, plus a small focus trap.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
        return;
      }
      if (multi && e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
        return;
      }
      if (multi && e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
        return;
      }
      if (e.key === "Tab") {
        const root = overlayRef.current;
        if (!root) return;
        const focusables = Array.from(
          root.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !el.hasAttribute("disabled"));
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [go, multi, requestClose]);

  // Keep the active thumbnail scrolled into view.
  useEffect(() => {
    thumbRefs.current[index]?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [index]);

  // Only warm the browser's cache for the previous and next photo.
  useEffect(() => {
    if (images.length < 2) return;
    const prevIdx = (index - 1 + images.length) % images.length;
    const nextIdx = (index + 1) % images.length;
    [prevIdx, nextIdx].forEach((i) => {
      const img = new window.Image();
      img.src = images[i];
    });
  }, [index, images]);

  const onBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) requestClose();
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (absY > absX && dy > 70) {
      requestClose();
      return;
    }
    if (multi && absX > absY && absX > 50) {
      go(dx < 0 ? 1 : -1);
    }
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return createPortal(
    <div
      className={"lightbox-overlay lightbox-" + phase}
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} — photo gallery`}
      onClick={onBackdropClick}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <button
        type="button"
        className="lightbox-close"
        aria-label="Close gallery"
        onClick={(e) => {
          stop(e);
          requestClose();
        }}
        ref={closeBtnRef}
      >
        ×
      </button>

      {multi && (
        <button
          type="button"
          className="lightbox-nav lightbox-prev"
          aria-label="Previous photo"
          onClick={(e) => {
            stop(e);
            go(-1);
          }}
        >
          ‹
        </button>
      )}

      <figure className="lightbox-figure" onClick={stop}>
        <img
          className="lightbox-img"
          src={images[index]}
          alt={`${title} — photo ${index + 1} of ${images.length}`}
        />
      </figure>

      {multi && (
        <button
          type="button"
          className="lightbox-nav lightbox-next"
          aria-label="Next photo"
          onClick={(e) => {
            stop(e);
            go(1);
          }}
        >
          ›
        </button>
      )}

      <div className="lightbox-footer" onClick={stop}>
        {multi && (
          <div className="lightbox-counter mono">
            {index + 1} / {images.length}
          </div>
        )}
        {images.length > 3 && (
          <div className="lightbox-thumbs" role="tablist" aria-label="Photo thumbnails">
            {images.map((src, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Photo ${i + 1}`}
                className={"lightbox-thumb" + (i === index ? " on" : "")}
                ref={(el) => {
                  thumbRefs.current[i] = el;
                }}
                onClick={(e) => {
                  stop(e);
                  setIndex(i);
                }}
              >
                <img src={src} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
