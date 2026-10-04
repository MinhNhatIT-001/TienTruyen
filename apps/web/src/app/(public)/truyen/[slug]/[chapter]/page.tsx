import { renderStory, storyMetadata } from "../../../../../lib/story-routing";
type Props = { params: Promise<{ slug: string; chapter: string }> };
export default async function Page({ params }: Props) {
  const { slug, chapter } = await params;
  return renderStory(["truyen", slug, chapter]);
}
export async function generateMetadata({ params }: Props) {
  const { slug, chapter } = await params;
  return storyMetadata(["truyen", slug, chapter]);
}
