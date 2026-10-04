"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { List } from "lucide-react";
import { api } from "../../lib/api";

import type { Chapter } from "./types";
export function ReaderContents({
  slug,
  current,
}: {
  slug: string;
  current: number;
}) {
  const [open, setOpen] = useState(false),
    [chapters, setChapters] = useState<Chapter[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    if (open)
      api<{ chapters: Chapter[] }>(`/stories/${slug}`)
        .then((r) => setChapters(r.chapters))
        .catch((e) => setError(e.message));
  }, [open, slug]);
  return (
    <>
      <button onClick={() => setOpen(!open)} aria-expanded={open}>
        <List size={18} /> Mục lục
      </button>
      {open && (
        <div className="reader-toc" role="dialog" aria-label="Mục lục chương">
          <button className="text-button" onClick={() => setOpen(false)}>
            Đóng mục lục
          </button>
          {error && <p className="error">{error}</p>}
          {chapters.map((c) => (
            <Link
              key={c.id}
              href={`/truyen/${slug}/${c.number}`}
              aria-current={current === c.number ? "page" : undefined}
            >
              Chương {c.number} · {c.title}
              <small>{c.isFree ? "Miễn phí" : `${c.price} HN`}</small>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
