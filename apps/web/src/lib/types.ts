export type Story = {
  id: string;
  slug: string;
  title: string;
  penName: string;
  genre: string;
  cover: string;
  description: string;
  progress: string;
  chapterCount: number;
  rating: number;
  readers: number;
};
export type User = {
  id: string;
  name: string;
  avatar?: string;
  email: string;
  roles: string[];
  balance: number;
  totalTopupVnd: number;
  emailVerified: boolean;
  readerSettings?: Record<string, unknown>;
};
export const genres = [
  "Tất cả",
  "Tiên hiệp",
  "Kiếm hiệp",
  "Huyền huyễn",
  "Cổ đại",
  "Ngôn tình",
  "Đô thị",
];
export const format = (n: number) => new Intl.NumberFormat("vi-VN").format(n);
