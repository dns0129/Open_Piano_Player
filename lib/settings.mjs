import {readFile, mkdir, writeFile, rename, chmod, copyFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {randomBytes} from 'node:crypto';
import {SCORE_RECOGNITION} from './recognition-policy.mjs';

export const defaultDeepseekModel = 'deepseek-flash';
export function userError(message, code = 'INVALID_INPUT', status = 400) { return Object.assign(new Error(message), {code, status, public: true}); }

export function createSettingsStore(path = resolve('.local/settings.json')) {
  let queue = Promise.resolve();
  async function read() {
    try { return JSON.parse(await readFile(path, 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return {}; throw userError('本机设置文件无法读取，请检查 .local/settings.json。', 'SETTINGS_READ', 500); }
  }
  function summarize(config) {
    return {piModel: SCORE_RECOGNITION.model, piReasoningEffort: SCORE_RECOGNITION.reasoningEffort, deepseekModel: config.deepseekModel || defaultDeepseekModel, deepseekConfigured: Boolean(config.deepseekApiKey || process.env.DEEPSEEK_API_KEY)};
  }
  async function update(input) {
    const action = queue.then(async () => {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw userError('设置必须是 JSON 对象。');
      const config = await read();
      if (input.piModel !== undefined) {
        if (input.piModel !== SCORE_RECOGNITION.model) throw userError('Pi 识谱固定使用 GPT-6.1 Sol high；DeepSeek 请在识谱服务商中选择。', 'FIXED_RECOGNITION_MODEL');
      }
      config.piModel = SCORE_RECOGNITION.model;
      if (input.deepseekModel !== undefined) {
        if (!['deepseek-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'].includes(input.deepseekModel)) throw userError('请选择支持的 DeepSeek 模型。');
        config.deepseekModel = input.deepseekModel;
      }
      if (input.clearDeepseekApiKey === true) delete config.deepseekApiKey;
      else if (input.deepseekApiKey !== undefined) {
        if (typeof input.deepseekApiKey !== 'string') throw userError('API Key 格式不正确。');
        const key = input.deepseekApiKey.trim();
        if (key) {
          if (key.length < 12 || key.length > 300 || !/^[\x21-\x7e]+$/.test(key)) throw userError('API Key 格式不正确。');
          config.deepseekApiKey = key;
        }
      }
      await mkdir(dirname(path), {recursive: true, mode: 0o700});
      await chmod(dirname(path), 0o700);
      // Keep one private backup before any settings change.
      try {
        if (input.clearDeepseekApiKey === true) {
          const prior=JSON.parse(await readFile(path,'utf8'));delete prior.deepseekApiKey;
          await writeFile(path+'.bak',JSON.stringify(prior,null,2),{mode:0o600});
        } else await copyFile(path, path + '.bak');
        await chmod(path + '.bak', 0o600);
      } catch (e) { if (e.code !== 'ENOENT') throw e; }
      const temp = path + '.' + randomBytes(5).toString('hex') + '.tmp';
      await writeFile(temp, JSON.stringify(config, null, 2), {mode: 0o600});
      await rename(temp, path); await chmod(path, 0o600);
      return summarize(config);
    });
    queue = action.catch(() => {}); return action;
  }
  return {read, update, summarize, path};
}
