"use client";

import { type Story } from "../../lib/types";

export function Cover({
  story,
  large = false,
}: {
  story: Story;
  large?: boolean;
}) {
  return (
    <div
      className={`book-cover ${story.cover} ${large ? "large" : ""}`}
      role="img"
      aria-label={`Bìa ${story.title}`}
    >
      <div className="cover-orbit" />
      <div className="cover-mountain mountain-back" />
      <div className="cover-mountain mountain-front" />
      <div className="cover-mist" />
      <span className="cover-series">TIÊN TRUYỆN · ORIGINAL</span>
      <span className="cover-title">{story.title}</span>
      <span className="cover-author">{story.penName}</span>
      <span className="cover-seal">仙</span>
    </div>
  );
}
