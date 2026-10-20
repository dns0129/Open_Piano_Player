import { STATIC_SITE } from "../lib/asset-url.mjs";
export const STATIC_NOTICE =
  "网页版提供曲库练习、本地数字乐谱导入和音频转谱；联网找谱、图片/PDF识谱和网易云导入需要本机运行琴伴。";
export function createCapabilities({ staticSite = STATIC_SITE } = {}) {
  return Object.freeze({
    mode: staticSite ? "browser" : "local",
    localServer: !staticSite,
    recognition: !staticSite,
    scoreSearch: !staticSite,
    netease: !staticSite,
    publish: !staticSite,
  });
}
export const capabilities = createCapabilities();
