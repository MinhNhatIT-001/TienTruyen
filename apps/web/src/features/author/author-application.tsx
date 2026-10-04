"use client";

import { useState } from "react";
import { Feather } from "lucide-react";
import { api } from "../../lib/api";

import { useApp, Empty } from "../../components/layout/app-shell";

export function AuthorApplication() {
  const { user } = useApp();
  const [sample, setSample] = useState(""),
    [result, setResult] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="container page narrow-page">
      <div className="page-intro">
        <span className="eyebrow">GÓC DÀNH CHO NGƯỜI KỂ CHUYỆN</span>
        <h1>Đăng ký tác giả</h1>
        <p>Gửi hồ sơ để gia nhập cộng đồng tác giả Tiên Truyện.</p>
      </div>
      {!user ? (
        <Empty
          title="Chúng mình muốn đọc câu chuyện của bạn"
          text="Đăng nhập để gửi hồ sơ tác giả. Hồ sơ sẽ được ban biên tập duyệt."
        />
      ) : (
        <form
          className="standard-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const d = new FormData(e.currentTarget);
            try {
              await api("/author/applications", {
                method: "POST",
                body: JSON.stringify({
                  penName: d.get("penName"),
                  bio: d.get("bio"),
                  genres: d.get("genres"),
                  sampleText: sample,
                  copyright: d.get("copyright") === "on",
                }),
              });
              setResult(
                "Hồ sơ đã được gửi. Ban biên tập sẽ xem xét và phản hồi.",
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            Bút danh
            <input
              name="penName"
              required
              minLength={2}
              maxLength={60}
              placeholder="Tên sẽ xuất hiện trên những câu chuyện của bạn"
            />
          </label>
          <label className="field">
            Giới thiệu về bạn
            <textarea name="bio" required minLength={20} maxLength={2000} />
          </label>
          <label className="field">
            Thể loại sở trường
            <select name="genres">
              {[
                "Tiên hiệp",
                "Kiếm hiệp",
                "Huyền huyễn",
                "Cổ đại",
                "Ngôn tình",
                "Đô thị",
              ].map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Đoạn văn mẫu ·{" "}
            {sample.trim() ? sample.trim().split(/\s+/u).length : 0}/1.000 chữ
            <textarea
              className="editor-area"
              required
              value={sample}
              maxLength={100000}
              onChange={(e) => setSample(e.target.value)}
              placeholder="Hãy cho chúng mình nghe giọng văn của bạn…"
            />
          </label>
          <label className="checkbox">
            <input required type="checkbox" name="copyright" />
            Tôi xác nhận có quyền với nội dung gửi lên và cam kết tôn trọng bản
            quyền tác phẩm.
          </label>
          {error && <p className="error">{error}</p>}
          {result && <p className="success">{result}</p>}
          <button className="btn primary" disabled={busy || !!result}>
            {busy ? "Đang gửi…" : "Gửi hồ sơ tác giả"}
            <Feather size={16} />
          </button>
        </form>
      )}
    </main>
  );
}
