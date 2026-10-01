"use client";
import { useEffect, useState } from "react";
import { Check, Upload, X } from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "./shell";
export function AvatarSettings() {
  const { user, refresh, notify } = useApp();
  const [gallery, setGallery] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<string[]>("/avatars")
      .then(setGallery)
      .catch(() => {});
  }, []);
  if (!user) return null;
  async function choose(avatar: string) {
    setBusy(true);
    try {
      await api("/users/avatar", {
        method: "PUT",
        body: JSON.stringify({ avatar }),
      });
      await refresh();
      notify("Đã cập nhật avatar.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      notify("Chọn ảnh JPG, PNG hoặc WebP.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      notify("Ảnh tối đa 2 MB.");
      return;
    }
    setBusy(true);
    try {
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(new Error("Không đọc được ảnh."));
        reader.readAsDataURL(file);
      });
      await api("/users/avatar/upload", {
        method: "POST",
        body: JSON.stringify({ image }),
      });
      await refresh();
      notify("Đã tải và cập nhật avatar.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="avatar-settings">
      <div className="profile-avatar-head">
        {user.avatar ? (
          <img
            className="profile-avatar-image"
            src={user.avatar}
            alt={`Avatar của ${user.name}`}
            width={80}
            height={80}
          />
        ) : (
          <span className="profile-avatar-image avatar-initial">
            {user.name.charAt(0)}
          </span>
        )}
        <div>
          <strong>Ảnh đại diện</strong>
          <p>Một dấu ấn riêng cho tài khoản của bạn.</p>
          <button
            className="avatar-change"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
          >
            {open ? (
              <>
                <X size={13} /> Thu gọn
              </>
            ) : (
              "Đổi avatar"
            )}
          </button>
        </div>
      </div>
      {open && (
        <fieldset className="avatar-picker" disabled={busy}>
          <legend>Chọn avatar có sẵn</legend>
          <div className="avatar-gallery">
            {gallery.map((url, i) => (
              <button
                type="button"
                className={`avatar-option ${user.avatar === url ? "selected" : ""}`}
                key={url}
                aria-label={`Chọn avatar ${i + 1}`}
                aria-pressed={user.avatar === url}
                onClick={() => void choose(url)}
              >
                <img src={url} alt="" width={56} height={56} />
                {user.avatar === url && (
                  <span className="avatar-selected">
                    <Check size={11} />
                  </span>
                )}
              </button>
            ))}
          </div>
          <label className="avatar-upload-label">
            <span>
              <Upload size={15} /> Tải ảnh từ thiết bị
            </span>
            <input
              className="sr-only"
              aria-label="Tải avatar từ thiết bị"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
                e.target.value = "";
              }}
            />
          </label>
          <p className="avatar-help">
            JPG, PNG, WebP · tối đa 2 MB. Ảnh sẽ tự cắt vuông để vừa khung.
          </p>
          {busy && <p role="status">Đang cập nhật avatar…</p>}
        </fieldset>
      )}
    </div>
  );
}
