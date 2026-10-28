// 静态资源地址：本机服务部署在根路径，GitHub Pages 部署在 /<仓库名>/ 子路径。
// Vite 构建时把 import.meta.env 替换为常量；Node 测试中不存在，回退到根路径。
const base = import.meta.env?.BASE_URL || "/";

// 网页版（npm run build:pages）没有本机 Node 服务，联网找谱、识谱、导入等 /api 功能不可用。
export const STATIC_SITE = import.meta.env?.VITE_STATIC_SITE === "1";

export const assetURL = (path) =>
  typeof path === "string" && path.startsWith("/") && !path.startsWith("//")
    ? base + path.slice(1)
    : path;
