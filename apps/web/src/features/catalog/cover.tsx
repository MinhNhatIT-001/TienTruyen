"use client";

import Image from "next/image";
import { type Story } from "../../lib/types";
import { coverArt } from "./cover-art";

export function Cover({ story, large = false }: { story: Story; large?: boolean }) {
  const artwork = coverArt[story.slug];
  return (
    <div
      className={`book-cover ${story.cover} ${large ? "large" : ""} ${artwork ? "illustrated-cover" : ""}`}
      role="img"
      aria-label={`Bìa ${story.title}`}
    >
      {artwork ? (
        <Image
          className="cover-artwork"
          src={artwork}
          alt=""
          fill
          unoptimized
          sizes={large ? "(max-width: 600px) 50vw, 280px" : "(max-width: 600px) 40vw, (max-width: 1000px) 22vw, 180px"}
          loading={large ? "eager" : "lazy"}
        />
      ) : (
        <>
          <div className="cover-orbit" />
          <div className="cover-mountain mountain-back" />
          <div className="cover-mountain mountain-front" />
          <div className="cover-mist" />
        </>
      )}
    </div>
  );
}
