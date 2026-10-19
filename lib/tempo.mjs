export function parseTempoInput(value) {
  const tempo=typeof value==='string'&&value.trim()===''?NaN:Number(value);
  if(!Number.isInteger(tempo)||tempo<20||tempo>300) throw new Error('请输入 20–300 之间的整数 BPM。');
  return tempo;
}
