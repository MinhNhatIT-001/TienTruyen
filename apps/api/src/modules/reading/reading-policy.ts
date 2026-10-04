import { HttpException } from "@nestjs/common";
type PricedChapter = {
  id: string;
  storyId: string;
  isFree: boolean;
  price: number;
  story: { authorId: string };
  purchases: unknown[];
};
export function batchQuote<T extends PricedChapter>(
  chapters: T[],
  ids: string[],
  userId: string,
  expectedTotal: number,
) {
  const reject = (message: string, status = 409): never => {
    throw new HttpException({ message }, status);
  };
  if (chapters.length !== new Set(ids).size)
    reject("Có chương không còn khả dụng.");
  if (new Set(chapters.map((c) => c.storyId)).size !== 1)
    reject("Chỉ mua nhiều chương trong cùng một truyện.", 400);
  const wanted = chapters.filter((c) => !c.isFree && !c.purchases.length);
  if (wanted.some((c) => c.story.authorId === userId))
    reject("Tác giả không thể tự mua chương.", 400);
  const total = wanted.reduce((n, c) => n + c.price, 0);
  if (total !== expectedTotal)
    reject(
      "Giá hoặc chương đã mua đã thay đổi. Hãy tải lại danh sách trước khi xác nhận.",
    );
  return { wanted, total };
}
export function publicationDate(value: string | null, now = Date.now()) {
  if (value === null) return null;
  const time = Date.parse(value);
  if (
    !Number.isFinite(time) ||
    time < now + 60000 ||
    time > now + 365 * 86400000
  )
    throw new HttpException(
      { message: "Hẹn giờ từ 1 phút đến 1 năm tới." },
      400,
    );
  return new Date(time);
}
