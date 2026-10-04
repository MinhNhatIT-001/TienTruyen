"use client";
import Link from "next/link";

import { useEffect, useState } from "react";
import { Diamond, Sparkles } from "lucide-react";
import { api } from "../../lib/api";

import { format } from "../../lib/types";
import { useApp } from "../../components/layout/app-shell";

const levels = [
  ["Phàm Nhân", 0],
  ["Luyện Khí", 50000],
  ["Trúc Cơ", 200000],
  ["Kim Đan", 500000],
  ["Nguyên Anh", 1000000],
  ["Hóa Thần", 2000000],
  ["Luyện Hư", 5000000],
  ["Hợp Thể", 10000000],
  ["Đại Thừa", 20000000],
  ["Chân Tiên", 50000000],
] as [string, number][];
export function Levels() {
  const { user } = useApp();
  const [list, setList] = useState(levels);
  useEffect(() => {
    api("/config")
      .then((c) => setList(c.readerLevels))
      .catch(() => {});
  }, []);
  const total = user?.totalTopupVnd || 0,
    index = Math.max(
      0,
      list.findLastIndex((l) => total >= l[1]),
    ),
    next = list[index + 1],
    progress = next
      ? Math.min(
          100,
          ((total - list[index][1]) / (next[1] - list[index][1])) * 100,
        )
      : 100;
  return (
    <main className="container page">
      <div className="page-intro">
        <span className="eyebrow">MỖI TRANG SÁCH, MỘT BƯỚC TIẾN</span>
        <h1>Cảnh giới của tôi</h1>
        <p>
          Cảnh giới ghi nhận tổng tiền nạp thành công, không giảm khi bạn dùng
          Hồng Ngọc.
        </p>
      </div>
      <div className="account-grid">
        <div className="panel">
          <Sparkles size={26} />
          <h2>{list[index][0]}</h2>
          <p>Tổng nạp tích lũy: {format(total)}đ</p>
          <div className="progress-bar">
            <span style={{ width: progress + "%" }} />
          </div>
          <p>
            {next
              ? `Còn ${format(next[1] - total)}đ để đạt ${next[0]}.`
              : "Bạn đã đạt cảnh giới cao nhất."}
          </p>
        </div>
        <div className="panel">
          <h2>Lớn lên cùng những câu chuyện</h2>
          <p>
            Huy hiệu, khung đại diện và thưởng nạp theo từng cảnh giới. Các
            quyền lợi được tính theo cấu hình hiện tại của nền tảng.
          </p>
          <Link
            className="btn secondary"
            href="/nap-hong-ngoc"
            style={{ marginTop: 20 }}
          >
            Khám phá Hồng Ngọc <Diamond size={16} />
          </Link>
        </div>
      </div>
      <div className="level-list">
        {list.map(([name, amount], i) => (
          <div className="level-card" key={name}>
            <span>{String(i + 1).padStart(2, "0")}</span>
            <h3>{name}</h3>
            <p>Tổng nạp từ {format(amount)}đ</p>
          </div>
        ))}
      </div>
    </main>
  );
}
