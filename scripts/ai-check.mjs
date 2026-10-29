import { readFile, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { authStatus, publicError, defaultModel } from "../lib/auth.mjs";
import { createSettingsStore } from "../lib/settings.mjs";
import { generateScore } from "../lib/ai.mjs";

const settings = await createSettingsStore().read();
const model = defaultModel;
const status = await authStatus(model);
console.log(
  JSON.stringify(
    {
      provider: status.provider,
      available: status.available,
      source: status.source,
      model: status.model,
      lastVerification: status.lastVerification,
      deepseekConfigured: Boolean(
        settings.deepseekApiKey || process.env.DEEPSEEK_API_KEY,
      ),
    },
    null,
    2,
  ),
);
if (!status.available) {
  console.error(status.message);
  process.exitCode = 1;
} else if (process.argv.includes("--live")) {
  const arg = process.argv.findIndex((v) => v === "--image");
  const supplied =
    arg >= 0 ? process.argv[arg + 1] : process.env.PIANO_IMAGE_FILE;
  const promptArg = process.argv.indexOf("--prompt");
  const customPrompt = promptArg >= 0 ? process.argv[promptArg + 1] : undefined;
  const outputArg = process.argv.indexOf("--output");
  const outputPath = outputArg >= 0 ? process.argv[outputArg + 1] : undefined;
  const imagePath = resolve(supplied || "evidence/practice-staff.jpg");
  let bytes;
  try {
    bytes = await readFile(imagePath);
  } catch {
    console.log(
      "已完成登录检查；未进行真实识谱调用。请提供清晰谱面：npm run ai:check -- --live --image /绝对路径/谱面.jpg",
    );
  }
  if (bytes)
    try {
      const mimeType = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
      }[extname(imagePath).toLowerCase()];
      if (!mimeType)
        throw Object.assign(new Error("识谱验证仅接受 PNG/JPEG/WebP 图片。"), {
          public: true,
        });
      const result = await generateScore(
        {
          provider: "pi",
          mode: "arrange",
          title: "谱面识别验证",
          prompt:
            customPrompt ||
            (supplied
              ? "仅忠实识别所给图片里的谱面，不创作、不续写、不添加伴奏。"
              : "仅识别网页截图中编号01和02两个完整4/4小节，忽略下方03/04截断谱面及其他网页UI。保留原音高、时值和双手，不添加任何音符。总8拍。"),
          images: [{ data: bytes.toString("base64"), mimeType }],
        },
        { ...settings, piModel: model },
      );
      if (outputPath)
        await writeFile(
          resolve(outputPath),
          JSON.stringify(result, null, 2) + "\n",
        );
      const hands = Object.fromEntries(
        ["right", "left"].map((hand) => [
          hand,
          result.score.notes.filter((note) => note.hand === hand).length,
        ]),
      );
      console.log(
        JSON.stringify(
          {
            liveOcrVerified: true,
            model: result.model,
            title: result.score.title,
            notes: result.score.notes.length,
            durationBeats: result.score.durationBeats,
            hands,
            source: result.score.source,
            usage: result.usage,
            warnings: result.warnings,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      console.error(publicError(error));
      process.exitCode = 1;
    }
} else
  console.log(
    "本次只检查本机登录；加 --live --image 图片路径会真实识别已有谱面，不创作。",
  );
