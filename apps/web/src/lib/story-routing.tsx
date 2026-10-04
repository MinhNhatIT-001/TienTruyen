import type { Metadata } from "next";
import { publicApi, siteOrigin } from "./server-api";
import { notFound } from "next/navigation";
import { StoryPage } from "../features/stories/story-page";
import { Reader } from "../features/reader/reader";
import { type PublicStory, type Chapter } from "../features/reader/types";

export async function renderStory(path: string[]) {
  if (
    !path[1] ||
    (path[2] && !/^[1-9][0-9]*$/.test(path[2])) ||
    path.length > 3
  )
    notFound();
  const detail = await publicApi<PublicStory>(
    `/stories/${encodeURIComponent(path[1])}`,
  );
  if (detail) {
    if (!path[2])
      return (
        <StoryPage
          slug={path[1]}
          initialStory={{
            ...detail,
            chapterCount: detail.chapters.length,
            rating: detail.rating || 0,
            readers: detail.readers || 0,
          }}
        />
      );
    // Never forward cookies: the server response contains only guest-visible content.
    const chapter = await publicApi<Chapter>(
      `/stories/${encodeURIComponent(path[1])}/chapters/${path[2]}`,
    );
    if (chapter)
      return (
        <Reader
          key={path.join("/")}
          slug={path[1]}
          number={Number(path[2])}
          initialChapter={chapter}
        />
      );
  }

  return path[2] ? (
    <Reader key={path.join("/")} slug={path[1]} number={Number(path[2])} />
  ) : (
    <StoryPage slug={path[1]} />
  );
}

export async function storyMetadata(path: string[]): Promise<Metadata> {
  const story = await publicApi<{
    title: string;
    description: string;
    penName: string;
  }>(`/stories/${encodeURIComponent(path[1])}`);
  if (!story) return { robots: { index: false, follow: true } };
  const title = path[2] ? `${story.title} — Chương ${path[2]}` : story.title;
  const description = story.description.slice(0, 160);
  const url = `${siteOrigin}/truyen/${encodeURIComponent(path[1])}${path[2] ? `/${path[2]}` : ""}`;
  return {
    title,
    description,
    authors: [{ name: story.penName }],
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      locale: "vi_VN",
      type: "website",
      siteName: "Tiên Truyện",
    },
  };
}
