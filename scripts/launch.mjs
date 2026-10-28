import "./require-node.mjs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { createLauncher } from "../lib/launcher.mjs";

const launcher = createLauncher({
  root: fileURLToPath(new URL("..", import.meta.url)),
});
const args = process.argv.slice(2);
const menu = `
琴伴 · 统一启动器

  1  本地完整版    识谱、找谱、编辑、播放与本机曲库
  2  商业账号版    登录、私有曲库、上传识谱与运营（含原账号版）
  3  关闭所有琴伴服务
  0  退出菜单（已开启的服务继续运行）

可以同时开启两个版本。更新源码后，请先选 3 关闭旧服务，再启动。
请选择：`;

try {
  if (args[0] === "--version" && args.length === 2) {
    await launcher.start(args[1]);
  } else if (args[0] === "--stop" && args.length === 1) {
    await launcher.stopAll();
  } else if (args[0] === "--help" && args.length === 1) {
    console.log(
      "双击启动琴伴.command 或 npm run launch 打开版本菜单。\n也可使用 --version local、--version commercial 或 --stop。",
    );
  } else if (args.length) {
    throw Error("参数无效；使用 --help 查看启动方式。");
  } else {
    const input = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    process.stdout.write(menu);
    try {
      for await (const line of input) {
        const choice = line.trim();
        if (choice === "0") break;
        try {
          if (choice === "1" || choice === "2") {
            await launcher.start(choice === "1" ? "local" : "commercial");
          } else if (choice === "3") {
            await launcher.stopAll();
          } else {
            console.log("请输入 1、2、3 或 0。");
          }
        } catch (error) {
          console.error(error.message);
        }
        process.stdout.write(menu);
      }
    } finally {
      input.close();
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
