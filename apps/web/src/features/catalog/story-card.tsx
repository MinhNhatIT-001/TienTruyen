"use client";
import Link from "next/link";

import { BookOpen, Star } from "lucide-react";

import { type Story, format } from "../../lib/types";

import { Cover } from "./cover";
export function StoryCard({ story }: { story: Story }) {
  return (
    <Link className="story-card" href={`/truyen/${story.slug}`}>
      <div className="cover-wrap">
        <Cover story={story} />
        <span
          className={`status-tag ${story.progress === "Hoàn thành" ? "completed" : ""}`}
        >
          {story.progress}
        </span>
        <span className="cover-open">
          <BookOpen size={18} /> Khám phá truyện
        </span>
      </div>
      <span className="eyebrow genre-label">{story.genre}</span>
      <h3>{story.title}</h3>
      <p className="author">{story.penName}</p>
      <div className="card-meta">
        <span>
          <Star size={12} fill="currentColor" />
          {story.rating ? story.rating.toFixed(1) : "Mới"}
        </span>
        <span>{format(story.chapterCount)} chương</span>
      </div>
    </Link>
  );
}
