import { avatarGallery, storeAvatar, avatarDirectory } from "./avatar.service";
import { readFile } from "fs/promises";
import { join } from "path";
import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Req,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { db } from "../../database/prisma";
import { fail, parse, AuthRequest, auth } from "../../common/http";
import { settingsSchema } from "./settings.schema";
import { rateLimit } from "../../common/rate-limit";
@Controller("api")
export class UsersController {
  @Get("avatars") avatars() {
    return avatarGallery;
  }

  @Put("users/avatar") async chooseAvatar(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const a = auth(req);
    const { avatar } = parse(
      z.object({ avatar: z.string().max(100) }).strict(),
      body,
    );
    if (!avatarGallery.includes(avatar))
      fail("Vui lòng chọn avatar trong thư viện.");
    await db.user.update({ where: { id: a.id }, data: { avatar } });
    return { avatar };
  }

  @Post("users/avatar/upload") async uploadAvatar(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const a = auth(req);
    const { image } = parse(
      z.object({ image: z.string().max(2800000) }).strict(),
      body,
    );
    if (!(await rateLimit(`avatar-upload:${a.id}`, 5, 3600)))
      fail("Bạn đã tải 5 ảnh trong một giờ. Hãy thử lại sau.", 429);
    let avatar: string;
    try {
      avatar = await storeAvatar(image);
    } catch (e) {
      fail(
        e instanceof Error && /Ảnh|ảnh|JPG|PNG|WebP/.test(e.message)
          ? e.message
          : "Không thể xử lý ảnh. Hãy chọn ảnh JPG, PNG hoặc WebP hợp lệ.",
      );
    }
    await db.user.update({ where: { id: a.id }, data: { avatar: avatar! } });
    return { avatar: avatar! };
  }

  @Get("avatars/uploads/:file") async avatarFile(
    @Param("file") file: string,
    @Res() res: Response,
  ) {
    if (!/^[a-f0-9]{64}\.webp$/.test(file)) fail("Không tìm thấy ảnh.", 404);
    let bytes: Buffer;
    try {
      bytes = await readFile(join(avatarDirectory, file));
    } catch {
      fail("Không tìm thấy ảnh.", 404);
    }
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(bytes!);
  }

  @Put("users/settings") async settings(
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const a = auth(req),
      settings = parse(settingsSchema, body);
    await db.user.update({
      where: { id: a.id },
      data: { readerSettings: settings },
    });
    return { ok: true };
  }
}
