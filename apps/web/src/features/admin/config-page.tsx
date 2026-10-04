"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useApp, Empty } from "../../components/layout/app-shell";
export function ConfigPage() {
  const { user, notify } = useApp();
  const [config, setConfig] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (user?.roles.includes("ADMIN"))
      api("/config")
        .then(setConfig)
        .catch((e) => setError(e.message));
  }, [user]);
  if (!user?.roles.includes("ADMIN"))
    return (
      <Empty
        title="Cần quyền quản trị"
        text="Đăng nhập bằng tài khoản quản trị để chỉnh cấu hình."
      />
    );
  return (
    <main className="container page">
      <div className="page-intro">
        <h1>Cấu hình nền tảng</h1>
        <p>
          Thay đổi áp dụng cho giao dịch mới; tỷ lệ đã ghi nhận trong giao dịch
          cũ được giữ nguyên.
        </p>
      </div>
      {error && <p className="error">{error}</p>}
      {config && (
        <form
          className="standard-form"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("/admin/config", {
                method: "PUT",
                body: JSON.stringify(config),
              });
              notify("Đã lưu cấu hình nền tảng.");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <div className="form-columns">
            {[
              ["exchangeRate", "VNĐ cho mỗi Hồng Ngọc"],
              ["minFreeChapters", "Số chương đầu miễn phí"],
              ["minPrice", "Giá chương tối thiểu (HN)"],
              ["defaultPrice", "Giá gợi ý (HN)"],
              ["minimumPayoutVnd", "Rút tối thiểu (VNĐ)"],
            ].map(([key, label]) => (
              <label key={key} className="field">
                {label}
                <input
                  type="number"
                  required
                  min="1"
                  value={config[key]}
                  onChange={(e) =>
                    setConfig({ ...config, [key]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
          </div>
          <h2>Các gói nạp</h2>
          {config.packages.map((p: any, i: number) => (
            <div className="panel form-columns" key={i}>
              {[
                ["name", "Tên gói"],
                ["amount", "Tiền nạp (VNĐ)"],
                ["base", "HN cơ bản"],
                ["bonus", "HN thưởng"],
              ].map(([key, label]) => (
                <label className="field" key={key}>
                  {label}
                  <input
                    type={key === "name" ? "text" : "number"}
                    value={p[key]}
                    required
                    min="0"
                    onChange={(e) => {
                      const packages = [...config.packages];
                      packages[i] = {
                        ...p,
                        [key]:
                          key === "name"
                            ? e.target.value
                            : Number(e.target.value),
                      };
                      setConfig({ ...config, packages });
                    }}
                  />
                </label>
              ))}
            </div>
          ))}
          {[
            [
              "readerLevels",
              "Cảnh giới độc giả",
              ["Danh hiệu", "Tổng nạp (VNĐ)", "Thưởng thêm (%)"],
            ],
            [
              "authorLevels",
              "Cấp tác giả",
              [
                "Danh hiệu",
                "Số chương",
                "Giá tối đa (HN)",
                "Truyện song song",
                "Doanh thu (%)",
              ],
            ],
          ].map(([key, title, labels]: any) => (
            <section key={key}>
              <h2>{title}</h2>
              {config[key].map((row: any[], i: number) => (
                <div
                  className="panel form-columns"
                  key={i}
                  style={{ marginTop: 12 }}
                >
                  {labels.map((label: string, j: number) => (
                    <label className="field" key={label}>
                      {label}
                      <input
                        required
                        type={j ? "number" : "text"}
                        min="0"
                        value={row[j]}
                        onChange={(e) => {
                          const list = config[key].map((r: any[]) => [...r]);
                          list[i][j] = j
                            ? Number(e.target.value)
                            : e.target.value;
                          setConfig({ ...config, [key]: list });
                        }}
                      />
                    </label>
                  ))}
                </div>
              ))}
            </section>
          ))}
          <button className="btn primary">Lưu cấu hình</button>
        </form>
      )}
    </main>
  );
}
