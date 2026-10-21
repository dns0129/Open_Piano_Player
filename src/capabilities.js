import { STATIC_SITE } from "../lib/asset-url.mjs";
export const STATIC_NOTICE =
  "此版本提供乐谱基础实现、编辑、播放与数字文件导入。账号、托管识谱和运营功能请使用独立商业版。";
export function createCapabilities({ staticSite = STATIC_SITE, hosted = import.meta.env?.VITE_HOSTED_SITE === "1" } = {}) {
  if (hosted) return Object.freeze({mode:"hosted",coreOnly:true,hostedRecognition:true,localServer:false,recognition:false,scoreSearch:false,netease:false,publish:false});
  return Object.freeze({
    mode: staticSite ? "browser" : "local",
    coreOnly: true,
    localServer: !staticSite,
    recognition: false,
    scoreSearch: false,
    netease: false,
    publish: false,
  });
}
export const capabilities = createCapabilities();
