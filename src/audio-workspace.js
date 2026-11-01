import { $, esc, icon } from "./ui.js";

export function createAudioWorkspace({
  state,
  player,
  render,
  toast,
  api,
  capabilities,
}) {
  function isAudioFile(file) {
    return (
      !!file &&
      (/^(audio|video)\//.test(file.type) ||
        /\.(wav|mp3|m4a|aac|ogg|flac|webm|mp4|mov|m4v|mkv)$/i.test(file.name))
    );
  }
  function audioView() {
    const a = state.audio;
    const busy = a.status === "inspecting";
    const local = capabilities.localServer;
    const result = a.sourceResult;
    return `<section class="content-page audio-page"><div class="page-heading"><div><span class="eyebrow">AUDIO TO PIANO SCORE</span><h1>从链接或文件查找音源</h1><p>把视频或网易云歌曲链接交给 Pi 查询，或检查音视频文件直传能力。</p></div><span class="local-processing-tag">${icon("headphones")}Pi Agent · GPT-6.1 Sol high</span></div>
<div class="audio-workspace"><section class="audio-input-panel">${!local ? '<p class="form-note">Pi 需要在本机运行琴伴，并登录 Pi 或 Codex。</p>' : ""}
<form id="audio-link-form" class="audio-link"><label class="field">视频或音乐分享链接<textarea id="audio-link" rows="3" maxlength="6000" placeholder="粘贴视频链接或网易云分享文字" ${busy || !local ? "disabled" : ""}>${esc(a.sourceLink || "")}</textarea></label><button id="inspect-audio-link" class="button primary" type="submit" ${busy || !local ? "disabled" : ""}>${icon("external-link")}${busy ? "Pi 正在查询…" : "交给 Pi 查询链接"}</button><p class="form-note">分享文字会发送给 GPT-6.1 Sol high；来源需要登录或播放权限时，查询结果取决于平台账号。</p></form>
<div class="audio-link"><button id="choose-audio" type="button" class="audio-dropzone ${a.file ? "has-file" : ""}" ${busy ? "disabled" : ""}>${icon("file-audio")}<strong>${a.file ? esc(a.file.name) : "选择音频或视频文件"}</strong><span>${a.file ? `${(a.file.size / 1024 / 1024).toFixed(1)} MB · 点击更换文件` : "也可以拖放到页面"}</span></button><button id="check-direct-media" class="button secondary" type="button" ${!a.file || busy || !local ? "disabled" : ""}>检查文件直传能力</button><p class="form-note">检查前不会上传文件，也不会提取或发送频谱。</p></div>
<div id="transcription-error" class="form-error" role="alert">${esc(a.error || "")}</div>${busy ? '<button id="cancel-transcription" class="text-button cancel-transcription" type="button">取消查询</button>' : ""}</section>
<section class="audio-output-panel"><div class="audio-output-heading"><span>查询与直传状态</span><span>Pi Agent</span></div><div class="audio-output-empty"><div class="wave-symbol">${icon("audio-lines")}</div><h2>${busy ? "正在查询链接…" : result ? "查询结果" : "等待链接或文件"}</h2>${result?.source ? `<p>${esc(result.source.message)}${result.source.songId ? `<br>网易云歌曲 ID：${esc(result.source.songId)}` : ""}${result.source.title ? `<br>${esc(result.source.title)}` : ""}</p>` : ""}<p>${esc(result?.message || "当前 Pi 订阅接口不能直接接收音视频；在接口支持前无法识别音符或导出曲谱。")}</p>${busy ? "<p>正在将链接交给 Pi 查询来源。</p>" : ""}</div></section></div></section>`;
  }
  async function receiveAudio(file) {
    const a = state.audio;
    if (a.status === "inspecting") return toast("请先取消或等待当前查询完成。");
    if (!isAudioFile(file)) return toast("请选择音频或视频文件。", true);
    player.pause();
    a.abort?.abort();
    a.file = file;
    a.sourceResult = null;
    a.error = "";
    a.status = "ready";
    state.view = "audio";
    render();
  }
  function bindAudio() {
    const a = state.audio;
    $("#choose-audio").onclick = () => $("#audio-input").click();
    $("#audio-link").oninput = (event) => {
      a.sourceLink = event.target.value;
    };
    $("#audio-link-form").onsubmit = async (event) => {
      event.preventDefault();
      const share = $("#audio-link").value.trim();
      if (!share) {
        a.error = "请粘贴视频或音乐分享链接。";
        render();
        return;
      }
      a.sourceLink = share;
      a.error = "";
      a.sourceResult = null;
      a.status = "inspecting";
      const abort = new AbortController();
      a.abort = abort;
      render();
      try {
        const result = await api(
          "/api/audio/inspect-link",
          { share },
          abort.signal,
        );
        if (abort.signal.aborted) return;
        if (
          result.provider !== "pi" ||
          result.model !== "gpt-6.1-sol" ||
          result.reasoningEffort !== "high" ||
          !Array.isArray(result.requestAudit) ||
          !result.requestAudit.length ||
          result.requestAudit.some(
            (item) =>
              item.model !== "gpt-6.1-sol" || item.reasoningEffort !== "high",
          )
        )
          throw new Error("无法确认 Pi 的模型和思考强度，本次结果未使用。");
        a.sourceResult = result;
        a.status = "ready";
        if (state.view === "audio") render();
        else toast("Pi 链接查询已完成。");
      } catch (error) {
        if (abort.signal.aborted) return;
        a.error = error.message || "Pi 链接查询未完成。";
        a.status = "error";
        if (state.view === "audio") render();
      } finally {
        if (a.abort === abort) a.abort = null;
      }
    };
    $("#check-direct-media").onclick = async () => {
      if (!a.file) return;
      try {
        // Only local metadata is sent for the capability check; no file bytes leave the browser.
        a.sourceResult = await api("/api/audio/direct-capability", {
          name: a.file.name,
          size: a.file.size,
          type: a.file.type,
        });
        a.error = "";
      } catch (error) {
        a.error = error.message || "无法检查文件直传能力。";
      }
      render();
    };
    $("#cancel-transcription")?.addEventListener("click", () => {
      a.abort?.abort();
      a.status = "ready";
      render();
      toast("已取消链接查询。");
    });
  }
  return { isAudioFile, audioView, receiveAudio, bindAudio };
}
