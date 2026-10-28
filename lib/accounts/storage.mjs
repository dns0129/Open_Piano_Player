import {
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
  chmod,
  readdir,
  stat,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { uuid, fail, missing } from "./common.mjs";
export function createPrivateFiles(directory) {
  const root = resolve(directory);
  const path = (owner, key) => {
    if (!uuid(owner) || !uuid(key)) throw missing();
    return join(root, owner, key);
  };
  return {
    async write(owner, key, bytes) {
      const p = path(owner, key);
      await mkdir(join(root, owner), { recursive: true, mode: 0o700 });
      const tmp = p + "." + randomBytes(6).toString("hex") + ".tmp";
      try {
        await writeFile(tmp, bytes, { mode: 0o600 });
        await rename(tmp, p);
        await chmod(p, 0o600);
      } finally {
        await rm(tmp, { force: true });
      }
    },
    async read(owner, key) {
      try {
        return await readFile(path(owner, key));
      } catch (e) {
        if (e.code === "ENOENT") throw missing();
        throw e;
      }
    },
    async remove(owner, key) {
      await rm(path(owner, key), { force: true });
    },
    async purgeOwner(owner) {
      if (!uuid(owner)) throw missing();
      await rm(join(root, owner), { recursive: true, force: true });
    },
    async objects(owner) {
      if (!uuid(owner)) throw missing();
      const items = await readdir(join(root, owner), {
        withFileTypes: true,
      }).catch((e) => {
        if (e.code === "ENOENT") return [];
        throw e;
      });
      const result = [];
      for (const item of items)
        if (item.isFile() && uuid(item.name)) {
          const info = await stat(path(owner, item.name));
          result.push({ id: item.name, modifiedAt: info.mtimeMs });
        }
      return result;
    },
  };
}
export async function validatePrivateFile(bytes, { mimeType, purpose, name }) {
  if (purpose === "backup") {
    if (mimeType !== "application/json" || bytes.length > 512 * 1024 * 1024)
      throw fail("INVALID_BACKUP", "备份文件类型或大小无效。");
    try {
      const x = JSON.parse(bytes);
      if (x.format !== "qinban-library-backup" || ![1, 2].includes(x.version))
        throw Error();
    } catch {
      throw fail("INVALID_BACKUP", "请选择琴伴完整曲库备份。");
    }
    return { name };
  }
  if (["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    if (bytes.length > 20 * 1024 * 1024)
      throw fail("FILE_TOO_LARGE", "每张原图最多 20 MiB。", 413);
    const signature =
      mimeType === "image/png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : mimeType === "image/jpeg"
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : bytes.subarray(0, 4).toString() === "RIFF" &&
            bytes.subarray(8, 12).toString() === "WEBP";
    if (!signature) throw fail("MIME_MISMATCH", "图片内容与类型不符。", 415);
    try {
      const image = sharp(bytes, {
        limitInputPixels: 40000000,
        animated: false,
      });
      const info = await image.metadata();
      if ((info.pages || 1) > 1 || !info.width || !info.height) throw Error();
      await image.stats();
      return {
        name,
        width: info.width,
        height: info.height,
        orientation: info.orientation || 1,
        format: info.format,
      };
    } catch {
      throw fail("INVALID_IMAGE", "图片无法完整解码，或超过 40 百万像素。");
    }
  }
  if (mimeType === "application/pdf") {
    if (
      bytes.length > 50 * 1024 * 1024 ||
      !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))
    )
      throw fail("INVALID_PDF", "PDF 内容或大小无效。");
    try {
      const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const task = getDocument({
        data: new Uint8Array(bytes),
        useSystemFonts: false,
        isEvalSupported: false,
      });
      try {
        const pdf = await task.promise;
        if (pdf.numPages > (purpose === "migration" ? 200 : 6))
          throw fail("PAGE_LIMIT", "账号版首批每份最多 6 页。");
        return { name, pages: pdf.numPages };
      } finally {
        await task.destroy();
      }
    } catch (e) {
      if (e.public) throw e;
      throw fail("INVALID_PDF", "PDF 无法读取或受密码保护。");
    }
  }
  if (
    ["digital", "migration"].includes(purpose) &&
    [
      "application/xml",
      "text/xml",
      "application/vnd.recordare.musicxml+xml",
      "application/vnd.recordare.musicxml",
      "audio/midi",
      "application/json",
    ].includes(mimeType)
  ) {
    if (bytes.length > 50 * 1024 * 1024)
      throw fail("FILE_TOO_LARGE", "数字乐谱文件过大。", 413);
    if (mimeType === "application/vnd.recordare.musicxml") {
      const { unzipSync } = await import("fflate");
      let total = 0;
      try {
        unzipSync(bytes, {
          filter: (f) => {
            total += f.originalSize;
            if (
              total > 50 * 1024 * 1024 ||
              f.originalSize > 25 * 1024 * 1024 ||
              /^(\/|[A-Za-z]:)|(^|\/)\.\.(\/|$)|\\/.test(f.name)
            )
              throw Error();
            return false;
          },
        });
      } catch {
        throw fail("INVALID_MXL", "压缩谱超过解压上限或包含无效路径。");
      }
    }
    const { importScore } = await import("../importers.mjs");
    try {
      await importScore({
        name,
        buffer: bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
        text: () => bytes.toString("utf8"),
        arrayBuffer: async () =>
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
      });
    } catch {
      throw fail("INVALID_SCORE", "数字乐谱无法解析。");
    }
    return { name };
  }
  throw fail("UNSUPPORTED_FILE", "此文件类型暂不支持。", 415);
}
