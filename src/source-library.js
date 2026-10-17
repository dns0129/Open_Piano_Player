import { validateScore } from '../lib/score.mjs';

const DB = 'qinban-original-scores';
let database;
const liveURLs = new Map();
const tuple = note => [note.id, note.beat, note.duration, note.midi, note.hand];
const reference = score => ({ id: score.id, durationBeats: score.durationBeats, keySignature: score.keySignature,
  timeSignature: [...score.timeSignature], notes: score.notes.map(tuple).sort((a, b) => a[0].localeCompare(b[0])) });

function openDatabase() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sources', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = null; reject(new Error('无法打开本机原谱存储，请检查浏览器存储权限。')); };
  });
  return database;
}

async function transaction(mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sources', mode), request = operation(tx.objectStore('sources'));
    let value;
    request.onsuccess = () => { value = request.result; };
    tx.oncomplete = () => resolve(value);
    tx.onabort = tx.onerror = () => reject(new Error('原谱保存失败，可能是本机存储空间不足。请先导出备份。'));
  });
}

export function sourceMatchesScore(score, saved) {
  if (!saved?.reference || !score) return false;
  return JSON.stringify(reference(score)) === JSON.stringify(saved.reference);
}

function release(id) {
  for (const url of liveURLs.get(id) || []) URL.revokeObjectURL(url);
  liveURLs.delete(id);
}

function hydrate(saved) {
  release(saved.id);
  const urls = new Map(), owned = [];
  for (const asset of saved.assets) {
    const url = URL.createObjectURL(asset.blob);
    urls.set(asset.id, url); urls.set(`${asset.page}:${asset.system}`, url); owned.push(url);
  }
  liveURLs.set(saved.id, owned);
  return { ...saved, notation: { ...saved.notation, systems: saved.notation.systems.map(system => {
    const url = urls.get(system.assetId || system.id) || urls.get(`${system.page}:${system.system}`);
    if (!url) throw new Error(`原谱第${system.page}页第${system.system}行图片缺失，请重新导入。`);
    return { ...system, imageUrl: url };
  }) } };
}

/** Blobs live in IndexedDB; localStorage keeps only the compact playable score. */
export async function savePracticeSource({ score: raw, sourceNotation, assets, reviewStatus, warnings=[] }) {
  const score = validateScore(raw);
  if (!sourceNotation?.systems?.length || !Array.isArray(assets) || !assets.length)
    throw new Error('完整原谱缺少图片或定位数据，未保存为可跟谱版本。');
  const storedAssets = assets.map(asset => {
    if (!(asset.blob instanceof Blob) || !asset.blob.size) throw new Error('原谱图片数据为空，请重新导入。');
    return { id: String(asset.id), page: asset.page, system: asset.system, blob: asset.blob };
  });
  const saved = { id: score.id, reference: reference(score), notation: {
    ...sourceNotation, systems: sourceNotation.systems.map(system => ({ ...system, imageUrl: '' })),
  }, assets: storedAssets, reviewStatus: reviewStatus || {}, warnings:warnings.filter(warning=>typeof warning==='string').map(warning=>warning.slice(0,600)).slice(0,100), savedAt: Date.now() };
  // Validate without changing the currently displayed URLs. A failed disk write
  // must keep the previous score usable and must not leak replacement URLs.
  const links=new Set(storedAssets.flatMap(asset=>[asset.id,`${asset.page}:${asset.system}`]));
  for(const system of saved.notation.systems)if(!links.has(system.assetId||system.id)&&!links.has(`${system.page}:${system.system}`))
    throw new Error(`原谱第${system.page}页第${system.system}行图片缺失，请重新导入。`);
  await transaction('readwrite', store => store.put(saved));
  return hydrate(saved);
}

export async function loadPracticeSource(score) {
  const saved = await transaction('readonly', store => store.get(score.id));
  if (!sourceMatchesScore(score, saved)) return null;
  return hydrate(saved);
}

export async function deletePracticeSource(id) {
  release(id);
  await transaction('readwrite', store => store.delete(id));
}

export function releasePracticeSource(id) { release(id); }
