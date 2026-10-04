import { renderStory, storyMetadata } from "../../../../lib/story-routing";
type Props = { params: Promise<{ slug: string }> };
export default async function Page({ params }: Props) {
  const { slug } = await params;
  return renderStory(["truyen", slug]);
}
export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return storyMetadata(["truyen", slug]);
}
