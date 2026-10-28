// Original tempo evidence is independent of the numeric practice tempo.
export const TEMPO_STATUSES = ['read', 'not-marked', 'unreadable', 'unknown'];
const validBpm = value => typeof value === 'number' && Number.isFinite(value) && value >= 20 && value <= 300;
const invalid = message => Object.assign(new Error(message), {
  code: 'INVALID_COMPACT_REGION', status: 422, expose: true,
  issues: [{code: 'INVALID_TEMPO', path: 'bpm', message}],
});

export function recognitionTempo(bpm, status, metadata = {}) {
  if (bpm !== null && bpm !== 0 && !validBpm(bpm)) throw invalid('bpm 必须为 20–300 的数字或 null（未知）；旧响应的 0 按未知保留。');
  const sourceStatus = status ?? (validBpm(bpm) ? 'read' : 'unknown');
  if (!TEMPO_STATUSES.includes(sourceStatus) || (sourceStatus === 'read') !== validBpm(bpm)) {
    throw invalid('tempoStatus 与 bpm 不一致；读出的速度使用 read，未知、未印或不可辨速度使用 null。');
  }
  const practice = metadata.fallbackTempo ?? metadata.tempo;
  const tempo = validBpm(bpm) ? bpm : validBpm(practice) ? practice : 90;
  return {
    tempo,
    tempoEvidence: {
      version: 1, sourceStatus, sourceBpm: validBpm(bpm) ? bpm : null, rawBpm: bpm,
      playbackSource: validBpm(bpm) ? 'source-reading' : validBpm(practice) ? 'user-practice' : 'default-practice',
    },
    warnings: validBpm(bpm) ? [] : ['原谱速度未确认；播放使用练习速度设置，不代表原谱印刷速度。'],
  };
}

export function validateTempoEvidence(value) {
  if (!value || value.version !== 1 || !TEMPO_STATUSES.includes(value.sourceStatus)
    || !['source-reading', 'user-practice', 'default-practice'].includes(value.playbackSource)
    || (value.sourceStatus === 'read' ? !validBpm(value.sourceBpm) || value.rawBpm !== value.sourceBpm
      : value.sourceBpm !== null || ![null, 0].includes(value.rawBpm))) {
    throw invalid('原谱速度证据无效，不能把练习默认速度标为原谱速度。');
  }
  return {version: 1, sourceStatus: value.sourceStatus, sourceBpm: value.sourceBpm, rawBpm: value.rawBpm, playbackSource: value.playbackSource};
}
