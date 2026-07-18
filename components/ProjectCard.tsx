"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { localizedDesc, localizedTitle, projectImages, type Project } from "@/lib/projects";
import type { Lang } from "@/lib/i18n";
import Lightbox from "./Lightbox";

interface Props {
  project: Project & { num: string };
  viewLabel: string;
  lang: Lang;
}

export default function ProjectCard({ project: p, viewLabel, lang }: Props) {
  const images = projectImages(p);
  const title = localizedTitle(p, lang);
  const desc = localizedDesc(p, lang);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const openLightbox = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLightboxOpen(true);
  };

  return (
    <article className="card">
      {images.length > 0 ? (
        <button
          type="button"
          className={"ph ph-img " + p.ph}
          onClick={openLightbox}
          aria-label={`Open photo gallery for ${title} — ${images.length} photo${images.length > 1 ? "s" : ""}`}
        >
          <img src={images[0]} alt={title} />
          <span className="phlabel mono">{p.slot}</span>
          {images.length > 1 && <span className="ph-count mono">{images.length} photos</span>}
        </button>
      ) : (
        <div className={"ph " + p.ph}>
          <span className="phlabel mono">{p.slot}</span>
        </div>
      )}
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
      {lightboxOpen && (
        <Lightbox
          images={images}
          initialIndex={0}
          title={title}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </article>
  );
}
