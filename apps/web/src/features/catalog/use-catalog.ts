"use client";

import { useEffect, useState } from "react";

import sample from "../../lib/catalog.json";
import { type Story } from "../../lib/types";
import { api } from "../../lib/api";
export function useCatalog() {
  const [stories, setStories] = useState<Story[]>(sample),
    [demo, setDemo] = useState(false);
  useEffect(() => {
    api<Story[]>("/stories")
      .then(setStories)
      .catch(() => setDemo(true));
  }, []);
  return { stories, demo };
}
