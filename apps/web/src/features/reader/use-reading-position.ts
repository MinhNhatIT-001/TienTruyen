"use client";

import { useEffect, useRef } from "react";

import { api } from "../../lib/api";
import { useApp } from "../../components/layout/app-shell";

export function useReadingPosition(
  slug: string,
  number: number,
  content?: string,
  serverPosition = 0,
  demo = false,
  serverUpdatedAt?: string,
) {
  const { user } = useApp();
  const restored = useRef("");
  useEffect(() => {
    if (!content) return;
    const key = `tt-position:${user?.id || "guest"}:${slug}:${number}`;
    let dirty = false,
      latest = 0,
      disposed = false;
    const position = () => {
      const article = document.querySelector(".reader-prose");
      if (!article) return 0;
      const rect = article.getBoundingClientRect();
      if (rect.bottom <= window.innerHeight * 0.9) return 1;
      const start = rect.top + window.scrollY;
      const distance = Math.max(
        1,
        article.scrollHeight - window.innerHeight * 0.65,
      );
      return Math.max(0, Math.min(1, (window.scrollY - start) / distance));
    };
    const save = () => {
      if (!dirty) return;
      dirty = false;
      try {
        localStorage.setItem(
          key,
          JSON.stringify({ position: latest, updatedAt: Date.now() }),
        );
        localStorage.setItem(
          `tt-last:${user?.id || "guest"}:${slug}`,
          String(number),
        );
      } catch {}
      if (user && !demo)
        void api(`/reading/${slug}/${number}`, {
          method: "PUT",
          keepalive: true,
          body: JSON.stringify({ position: latest, finished: latest >= 0.98 }),
        }).catch(() => {});
    };
    const scroll = () => {
      latest = position();
      dirty = true;
    };
    let local = 0,
      localTime = 0;
    try {
      const stored = JSON.parse(localStorage.getItem(key) || "0");
      if (typeof stored === "number") local = stored;
      else {
        local = Number(stored.position);
        localTime = Number(stored.updatedAt) || 0;
      }
    } catch {}
    const value = Math.max(
      0,
      Math.min(1, Number.isFinite(local) ? local : 0, 1),
    );
    const restore = async () => {
      await document.fonts.ready;
      if (disposed || restored.current === key) return;
      restored.current = key;
      const article = document.querySelector(".reader-prose");
      const target =
        Date.parse(serverUpdatedAt || "") > localTime
          ? serverPosition
          : value || serverPosition;
      if (article && target > 0)
        window.scrollTo({
          top:
            article.getBoundingClientRect().top +
            window.scrollY +
            target *
              Math.max(1, article.scrollHeight - window.innerHeight * 0.65),
          behavior: "instant",
        });
      latest = position();
      dirty = true;
    };
    void restore();
    const timer = setInterval(save, 5000);
    window.addEventListener("scroll", scroll, { passive: true });
    const hide = () => {
      if (document.hidden) save();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", save);
    return () => {
      disposed = true;
      save();
      clearInterval(timer);
      window.removeEventListener("scroll", scroll);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", save);
    };
  }, [slug, number, content, user?.id, demo, serverPosition, serverUpdatedAt]);
}
