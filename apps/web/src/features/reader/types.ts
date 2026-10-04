
import { type Story } from "../../lib/types";
export type Chapter = {
  id: string;
  number: number;
  title: string;
  isFree: boolean;
  price: number;
  content?: string;
  owned?: boolean;
  position?: number;
  progressUpdatedAt?: string;
  previousNumber?: number | null;
  nextNumber?: number | null;
  story?: { title: string; slug: string };
};
export type PublicStory = Story & { chapters: Chapter[]; comments: any[] };
