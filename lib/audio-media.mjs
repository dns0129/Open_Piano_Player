import { mkdtemp, writeFile, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { userError } from "./settings.mjs";

const MAX_INPUT = 50 * 1024 * 1024;
const MAX_SECONDS = 600;

// ffmpeg is only a decoder. No external model or note detector is involved.
export async function decodeMedia(
  input,
  {
    signal = AbortSignal.timeout(120000),
    ffmpeg = process.env.QINBAN_FFMPEG || "ffmpeg",
  } = {},
) {
  if (
    typeof input?.data !== "string" ||
    input.data.length > Math.ceil(MAX_INPUT / 3) * 4 + 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(input.data)
  )
    throw userError("音视频文件无效或超过 50 MB。", "INVALID_AUDIO_FILE", 422);
  const bytes = Buffer.from(input.data, "base64");
  if (
    !bytes.length ||
    bytes.length > MAX_INPUT ||
    bytes.toString("base64") !== input.data
  )
    throw userError("音视频文件无效或超过 50 MB。", "INVALID_AUDIO_FILE", 422);
  const dir = await mkdtemp(join(tmpdir(), "qinban-media-"));
  const source = join(dir, "source.media"),
    output = join(dir, "decoded.wav");
  try {
    signal.throwIfAborted();
    await writeFile(source, bytes, { mode: 0o600 });
    await new Promise((resolve, reject) => {
      const child = spawn(
        ffmpeg,
        [
          "-nostdin",
          "-v",
          "error",
          "-protocol_whitelist",
          "file,pipe",
          "-format_whitelist",
          "wav,mp3,mov,ogg,matroska,flac,aac",
          "-i",
          source,
          "-vn",
          "-ac",
          "1",
          "-ar",
          "22050",
          "-t",
          String(MAX_SECONDS + 1),
          "-f",
          "wav",
          output,
        ],
        { stdio: ["ignore", "ignore", "ignore"], signal },
      );
      child.once("error", (error) =>
        reject(
          error.code === "ENOENT"
            ? userError(
                "当前格式需要本机安装 ffmpeg 才能提取音轨。",
                "FFMPEG_REQUIRED",
                503,
              )
            : error,
        ),
      );
      child.once("close", (code) =>
        code === 0
          ? resolve()
          : reject(
              userError(
                "无法读取音视频中的音轨，请更换格式或确认文件包含声音。",
                "AUDIO_DECODE_FAILED",
                422,
              ),
            ),
      );
    });
    signal.throwIfAborted();
    const info = await stat(output);
    if (info.size > MAX_SECONDS * 22050 * 2 + 256)
      throw userError(
        "此格式的音轨超过 10 分钟，请先剪辑。",
        "AUDIO_TOO_LONG",
        422,
      );
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
