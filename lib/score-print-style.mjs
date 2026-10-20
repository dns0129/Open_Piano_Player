export const PRINT_TEXT_FONTS = Object.freeze({
  song: { label: '宋体 / 衬线', family: '"Songti SC", "Noto Serif CJK SC", "SimSun", serif' },
  sans: { label: '黑体 / 无衬线', family: '"PingFang SC", "Microsoft YaHei", sans-serif' },
  kai: { label: '楷体', family: '"Kaiti SC", "KaiTi", "STKaiti", serif' },
});
export const PRINT_MUSIC_FONTS = Object.freeze({
  Bravura: '标准 · Bravura', Gonville: '古典 · Gonville', Petaluma: '手写 · Petaluma',
});
export const PRINT_PAGE_STYLES = Object.freeze({
  classic: { label: '经典黑白', paper: '#ffffff', ink: '#202020', muted: '#626262', accent: '#202020', tint: '#f4f4f4' },
  clean: { label: '现代简约', paper: '#ffffff', ink: '#273747', muted: '#647282', accent: '#416c80', tint: '#edf3f6' },
  warm: { label: '暖色手稿', paper: '#fffaf0', ink: '#493f32', muted: '#82715b', accent: '#9a7546', tint: '#f4ead7' },
});
export const PRINT_DEFAULTS = Object.freeze({ textFont: 'song', musicFont: 'Bravura', pageStyle: 'classic',
  headerFormat: 'center', creditPosition: 'right', titleSize: 24, marginMM: 14, scoreScale: 100,
  showDetails: true, showPageNumbers: true });
const choice = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
const bounded = (value, min, max, fallback) => value === '' || value == null || !Number.isFinite(Number(value)) ? fallback : Math.max(min, Math.min(max, Number(value)));
const text = (value, fallback, max) => typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').slice(0, max) : String(fallback || '').slice(0, max);
export function normalizePrintStyle(raw = {}, score = {}) {
  return {
    textFont: choice(raw.textFont, Object.keys(PRINT_TEXT_FONTS), PRINT_DEFAULTS.textFont),
    musicFont: choice(raw.musicFont, Object.keys(PRINT_MUSIC_FONTS), PRINT_DEFAULTS.musicFont),
    pageStyle: choice(raw.pageStyle, Object.keys(PRINT_PAGE_STYLES), PRINT_DEFAULTS.pageStyle),
    headerFormat: choice(raw.headerFormat, ['center', 'left', 'framed'], PRINT_DEFAULTS.headerFormat),
    creditPosition: choice(raw.creditPosition, ['left', 'center', 'right', 'under-title', 'hidden'], PRINT_DEFAULTS.creditPosition),
    titleSize: bounded(raw.titleSize, 18, 34, PRINT_DEFAULTS.titleSize),
    marginMM: bounded(raw.marginMM, 10, 24, PRINT_DEFAULTS.marginMM),
    scoreScale: bounded(raw.scoreScale, 80, 120, PRINT_DEFAULTS.scoreScale),
    showDetails: typeof raw.showDetails === 'boolean' ? raw.showDetails : true,
    showPageNumbers: typeof raw.showPageNumbers === 'boolean' ? raw.showPageNumbers : true,
    title: text(raw.title, score.title || '钢琴乐谱', 140).trim() || String(score.title || '钢琴乐谱').slice(0, 140),
    subtitle: text(raw.subtitle, '', 140), credit: text(raw.credit, score.composer, 120),
    creditLabel: text(raw.creditLabel, '作曲', 16),
  };
}
// Keep appearance preferences across sessions without carrying one piece's credits into another.
export function printStylePreferences(raw) {
  const normalized = normalizePrintStyle(raw);
  return Object.fromEntries(Object.keys(PRINT_DEFAULTS).map(key => [key, normalized[key]]));
}

/** White erasure masks behind tuplet labels must stay paper-colored. */
export function printSVGColor(value, palette) {
  if (!value || value === 'none' || value === 'transparent' || /rgba\([^)]*,\s*0\)/.test(value)) return value;
  return /^(?:rgb\(255,\s*255,\s*255\)|#fff(?:fff)?|white)$/i.test(value) ? palette.paper : palette.ink;
}
