"use client";

import { Select } from "../../components/ui/select";

import { useEffect, useState } from "react";
import { X, Minus, Plus } from "lucide-react";

import { useApp } from "../../components/layout/app-shell";
import { api } from "../../lib/api";

export type ReaderSettings = {
  fontSize: number;
  lineHeight: number;
  font: string;
  width: string;
  theme: string;
  bg: string;
  color: string;
};
const defaults: ReaderSettings = {
  fontSize: 20,
  lineHeight: 1.9,
  font: "serif",
  width: "medium",
  theme: "paper",
  bg: "#f7f3ea",
  color: "#28332d",
};
const themes: Record<string, { name: string; bg: string; color: string }> = {
  paper: { name: "Giấy", bg: "#f7f3ea", color: "#28332d" },
  light: { name: "Sáng", bg: "#ffffff", color: "#202820" },
  sepia: { name: "Sepia", bg: "#eee0c6", color: "#4a3928" },
  dark: { name: "Tối", bg: "#202724", color: "#dedfd8" },
  oled: { name: "OLED", bg: "#000000", color: "#d5d8d4" },
  green: { name: "Xanh dịu", bg: "#dfeae0", color: "#243c2c" },
};
function contrast(a: string, b: string) {
  const luminance = (v: string) => {
    const c = v
      .match(/[a-f0-9]{2}/gi)
      ?.map((x) => parseInt(x, 16) / 255)
      .map((x) =>
        x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4,
      ) || [0, 0, 0];
    return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function SettingsPanel({
  settings: s,
  setSettings,
  close,
}: {
  settings: ReaderSettings;
  setSettings: (s: ReaderSettings) => void;
  close?: () => void;
}) {
  const update = (p: Partial<ReaderSettings>) => setSettings({ ...s, ...p });
  return (
    <div className="settings-panel">
      <div className="panel-heading">
        <h3>Không gian đọc của bạn</h3>
        {close && (
          <button
            className="icon-btn"
            aria-label="Đóng tùy chỉnh"
            onClick={close}
          >
            <X size={19} />
          </button>
        )}
      </div>
      <label>
        Cỡ chữ <strong>{s.fontSize}px</strong>
      </label>
      <div className="size-control">
        <button
          aria-label="Giảm cỡ chữ"
          onClick={() => update({ fontSize: Math.max(14, s.fontSize - 1) })}
        >
          <Minus size={16} />
        </button>
        <input
          aria-label="Cỡ chữ"
          type="range"
          min="14"
          max="32"
          value={s.fontSize}
          onChange={(e) => update({ fontSize: +e.target.value })}
        />
        <button
          aria-label="Tăng cỡ chữ"
          onClick={() => update({ fontSize: Math.min(32, s.fontSize + 1) })}
        >
          <Plus size={16} />
        </button>
      </div>
      <label htmlFor="reader-font">Kiểu chữ</label>
      <Select
        label="Kiểu chữ"
        value={s.font}
        onValueChange={(font) => update({ font })}
        options={[
          { value: "serif", label: "Serif · Trang sách" },
          { value: "sans", label: "Sans · Hiện đại" },
          { value: "lexend", label: "Lexend · Dễ đọc" },
          { value: "mono", label: "Mono · Máy chữ" },
        ]}
      />
      <label>
        Giãn dòng <strong>{s.lineHeight.toFixed(1)}</strong>
      </label>
      <input
        aria-label="Giãn dòng"
        type="range"
        min="1.4"
        max="2.4"
        step="0.1"
        value={s.lineHeight}
        onChange={(e) => update({ lineHeight: +e.target.value })}
      />
      <label htmlFor="reader-width">Độ rộng trang</label>
      <Select
        label="Độ rộng trang"
        value={s.width}
        onValueChange={(width) => update({ width })}
        options={[
          { value: "narrow", label: "Hẹp" },
          { value: "medium", label: "Vừa" },
          { value: "wide", label: "Rộng" },
          { value: "full", label: "Toàn màn hình" },
        ]}
      />
      <label>Màu trang sách</label>
      <div className="theme-grid">
        {Object.entries(themes).map(([key, t]) => (
          <button
            aria-pressed={s.theme === key}
            className={s.theme === key ? "chosen" : ""}
            key={key}
            style={{ background: t.bg, color: t.color }}
            onClick={() => update({ theme: key, bg: t.bg, color: t.color })}
          >
            Aa<small>{t.name}</small>
          </button>
        ))}
      </div>
      <div className="color-controls">
        <label>
          Nền
          <input
            aria-label="Màu nền tùy chỉnh"
            type="color"
            value={s.bg}
            onChange={(e) => update({ theme: "custom", bg: e.target.value })}
          />
        </label>
        <label>
          Chữ
          <input
            aria-label="Màu chữ tùy chỉnh"
            type="color"
            value={s.color}
            onChange={(e) => update({ theme: "custom", color: e.target.value })}
          />
        </label>
      </div>
      {contrast(s.bg, s.color) < 4.5 && (
        <p className="error">
          Độ tương phản thấp. Hãy chọn màu chữ và nền khác nhau hơn.
        </p>
      )}
      <button className="reset-btn" onClick={() => setSettings(defaults)}>
        Khôi phục mặc định
      </button>
    </div>
  );
}
export function useReaderSettings() {
  const [settings, set] = useState(defaults),
    [loaded, setLoaded] = useState(false);
  const { user, notify } = useApp();
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("tt-reader") || "null");
      if (
        raw &&
        typeof raw.fontSize === "number" &&
        /^#[0-9a-f]{6}$/i.test(raw.bg) &&
        /^#[0-9a-f]{6}$/i.test(raw.color)
      )
        set({
          ...defaults,
          ...raw,
          fontSize: Math.min(32, Math.max(14, raw.fontSize)),
          lineHeight: Math.min(
            2.4,
            Math.max(1.4, Number(raw.lineHeight) || 1.9),
          ),
        });
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (user?.readerSettings && Object.keys(user.readerSettings).length)
      set((s) => ({ ...s, ...user.readerSettings }) as ReaderSettings);
  }, [user?.id]);
  function setSettings(s: ReaderSettings) {
    set(s);
    try {
      localStorage.setItem("tt-reader", JSON.stringify(s));
    } catch {
      notify(
        "Trình duyệt không cho lưu cài đặt. Thay đổi vẫn có hiệu lực trong phiên này.",
      );
    }
  }
  async function sync() {
    try {
      await api("/users/settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      notify("Đã đồng bộ cài đặt với tài khoản.");
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return { settings, setSettings, loaded, sync };
}
