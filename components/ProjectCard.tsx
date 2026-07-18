"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { localizedDesc, localizedTitle, projectImages, type Project } from "@/lib/projects";
import type { Lang } from "@/lib/i18n";

interface Props {
  project: Project & { num: string };
  viewLabel: string;
  lang: Lang;
}

export default function ProjectCard({ project: p, viewLabel, lang }: Props) {
  const images = projectImages(p);
  const title = localizedTitle(p, lang);
  const desc = localizedDesc(p, lang);
  const [index, setIndex] = useState(0);
  const multi = images.length > 1;

  const go = (e: React.MouseEvent, dir: 1 | -1) => {
    e.preventDefault();
    e.stopPropagation();
    setIndex((i) => (i + dir + images.length) % images.length);
  };
  const goTo = (e: React.MouseEvent, i: number) => {
    e.preventDefault();
    e.stopPropagation();
    setIndex(i);
  };

  return (
    <article className="card">
      <div className={"ph " + p.ph + (images.length ? " ph-img" : "")}>
        {images.length > 0 && <img src={images[index]} alt={`${title} — photo ${index + 1}`} />}
        <span className="phlabel mono">{p.slot}</span>
        {multi && (
          <>
            <button
              type="button"
              className="ph-nav ph-prev"
              aria-label="Previous photo"
              onClick={(e) => go(e, -1)}
            >
              ‹
            </button>
            <button
              type="button"
              className="ph-nav ph-next"
              aria-label="Next photo"
              onClick={(e) => go(e, 1)}
            >
              ›
            </button>
            <div className="ph-dots">
              {images.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className={"ph-dot" + (i === index ? " on" : "")}
                  aria-label={`Photo ${i + 1}`}
                  onClick={(e) => goTo(e, i)}
                />
              ))}
            </div>
          </>
        )}
      </div>
      <div className="cbody">
        <div className="crow">
          <span className="ctag">{p.tag}</span>
          <span className="cnum">{p.num}</span>
        </div>
        <h3 className="ctitle serif">{title}</h3>
        <p className="cdesc">{desc}</p>
        <span className="cfoot">
          {viewLabel} <span className="arw">→</span>
        </span>
      </div>
    </article>
  );
}
