import { PrismaClient } from "@prisma/client";
import { hash } from "argon2";
import { createHash } from "crypto";
import catalog from "./catalog.json";
const db = new PrismaClient();
async function main() {
  const author = await db.user.upsert({
    where: { email: "author@example.invalid" },
    update: {},
    create: {
      email: "author@example.invalid",
      name: "Ban biên tập",
      passwordHash: await hash(crypto.randomUUID()),
      roles: ["READER", "AUTHOR"],
      emailVerified: true,
      wallet: { create: {} },
    },
  });
  const config = {
    exchangeRate: 100,
    minFreeChapters: 5,
    minPrice: 5,
    defaultPrice: 20,
    minimumPayoutVnd: 200000,
    packages: [
      { name: "Khởi hành", amount: 20000, base: 200, bonus: 0 },
      { name: "Du ngoạn", amount: 50000, base: 500, bonus: 25 },
      { name: "Phiêu lưu", amount: 100000, base: 1000, bonus: 80 },
      { name: "Vạn dặm", amount: 200000, base: 2000, bonus: 200 },
      { name: "Trường sinh", amount: 500000, base: 5000, bonus: 750 },
    ],
    readerLevels: [
      ["Phàm Nhân", 0, 0],
      ["Luyện Khí", 50000, 0],
      ["Trúc Cơ", 200000, 0],
      ["Kim Đan", 500000, 2],
      ["Nguyên Anh", 1000000, 3],
      ["Hóa Thần", 2000000, 4],
      ["Luyện Hư", 5000000, 5],
      ["Hợp Thể", 10000000, 6],
      ["Đại Thừa", 20000000, 8],
      ["Chân Tiên", 50000000, 10],
    ],
    authorLevels: [
      ["Tân Thủ", 0, 20, 1, 70],
      ["Học Đồ", 20, 30, 2, 70],
      ["Chấp Bút", 100, 40, 3, 72],
      ["Văn Sĩ", 300, 50, 4, 74],
      ["Văn Hào", 700, 60, 5, 76],
      ["Đại Gia", 1500, 80, 6, 78],
      ["Tông Sư", 3000, 100, 8, 80],
    ],
  };
  await db.systemConfig.upsert({
    where: { key: "economy" },
    update: {},
    create: { key: "economy", value: config },
  });
  const paragraphs = [
    "Sương sớm còn vương trên những tán trúc. Từ phía xa, tiếng chuông chùa ngân dài qua thung lũng, đánh thức một miền núi rừng đang say giấc. Lâm An đứng trước hiên nhà, lặng nhìn con đường đất nhỏ dẫn xuống chân núi.",
    "Hôm nay là ngày chàng rời Thanh Vân. Suốt mười tám năm, ngọn núi này là cả thế giới của chàng: tiếng suối sau nhà, mùi thảo dược trong gian bếp, bàn tay chai sần của sư phụ đặt lên vai mỗi buổi chiều.",
    "“Đường xa không đáng sợ,” sư phụ nói, trao cho chàng chiếc túi vải đã cũ. “Điều đáng sợ là con quên mất vì sao mình lên đường.” Lâm An cúi đầu, cất lời dặn ấy vào lòng như cất một hạt giống.",
    "Mây trắng lững lờ trôi qua đỉnh núi. Chàng bước đi, nghe tiếng lá xào xạc dưới chân và cảm thấy mỗi bước đều mang theo một điều chưa biết. Phía trước là nhân gian rộng lớn, là những cuộc gặp gỡ chưa có tên.",
    "Ở khúc quanh cuối cùng, chàng ngoái đầu nhìn lại. Mái nhà nhỏ đã khuất trong làn sương, chỉ còn cây tùng già vươn lên nền trời sáng. Một cánh chim bay qua, để lại khoảng trời thênh thang và yên tĩnh.",
  ];
  for (const s of catalog) {
    const { chapterCount, rating, readers, ...story } = s;
    await db.story.upsert({
      where: { slug: s.slug },
      update: {},
      create: { ...story, authorId: author.id, status: "APPROVED" },
    });
    for (let number = 1; number <= 12; number++) {
      const content =
        `${s.title} — Chương ${number}\n\n` +
        paragraphs
          .map(
            (p, i) =>
              `${p}${i === 0 ? " Chương này mở ra một chặng đường mới trong hành trình " + number + "." : ""}`,
          )
          .join("\n\n");
      await db.chapter.upsert({
        where: { storyId_number: { storyId: s.id, number } },
        update: {},
        create: {
          storyId: s.id,
          number,
          title: [
            "Sương sớm Thanh Vân",
            "Người khách phương xa",
            "Một lời hẹn cũ",
            "Dưới tán tùng già",
            "Bước qua sơn môn",
            "Ánh đèn trong mưa",
          ][(number - 1) % 6],
          content,
          contentHash: createHash("sha256").update(content).digest("hex"),
          wordCount: content.split(/\s+/u).length,
          isFree: number <= 5,
          price: number <= 5 ? 0 : 20,
        },
      });
    }
  }
  console.log(
    "Seed complete: 8 original sample stories. No default login credentials.",
  );
}
main().finally(() => db.$disconnect());
