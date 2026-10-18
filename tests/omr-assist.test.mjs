import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// 识谱辅助工具依赖 Python 的 numpy/scipy/Pillow；缺少时明确跳过而不是假装通过。
const probe = spawnSync('python3', ['-c', 'import numpy, scipy, PIL'], { encoding: 'utf8' });

test('omr-assist detects pitches, durations, dots, hollow notes and bars on a synthetic grand staff', { skip: probe.status !== 0 && 'python3 with numpy/scipy/Pillow is not installed' }, () => {
  const run = spawnSync('python3', ['-I', 'scripts/omr-assist.py', 'selftest'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /自检通过/);
});
