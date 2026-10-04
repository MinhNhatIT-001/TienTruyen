"use client";

import { useApp } from "../../components/layout/app-shell";

import { useReaderSettings, SettingsPanel } from "./settings";
export function ReaderPreferences() {
  const { settings, setSettings, sync } = useReaderSettings();
  const { user } = useApp();
  return (
    <main className="container page">
      <div className="page-intro">
        <span className="eyebrow">THEO CÁCH CỦA BẠN</span>
        <h1>Một góc đọc thật riêng.</h1>
        <p>Cài đặt được lưu trên trình duyệt này.</p>
      </div>
      <div className="preferences-grid">
        <SettingsPanel settings={settings} setSettings={setSettings} />
        <div
          className="reader-preview"
          style={{
            background: settings.bg,
            color: settings.color,
            fontSize: settings.fontSize,
            lineHeight: settings.lineHeight,
            fontFamily:
              settings.font === "serif"
                ? "Georgia,serif"
                : settings.font === "lexend"
                  ? "Lexend,Arial,sans-serif"
                  : settings.font === "mono"
                    ? "monospace"
                    : "Arial,sans-serif",
          }}
        >
          <h2>Gió qua miền cố sự</h2>
          <p>
            Có những buổi chiều, chỉ cần một tách trà và vài trang sách, ta đã
            có thể đi thật xa. Ngoài cửa sổ, mây vẫn chậm rãi trôi qua những
            đỉnh núi xanh.
          </p>
          <p>
            Mỗi câu chữ là một lối nhỏ. Bạn cứ bước đi, thế giới sẽ dần mở ra.
          </p>
        </div>
      </div>
      {user && (
        <button className="btn primary" onClick={sync}>
          Lưu và đồng bộ tài khoản
        </button>
      )}
    </main>
  );
}
