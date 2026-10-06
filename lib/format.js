/**
 * 时间格式化 & 终端渲染工具
 */

const BAR_WIDTH = 30;

/** ms → 可读字符串 */
export function fmtDuration(ms) {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || h > 0) parts.push(`${m.toString().padStart(2, '0')}m`);
  parts.push(`${s.toString().padStart(2, '0')}s`);
  return parts.join(' ');
}

/** mm:ss 紧凑格式 */
export function fmtShort(ms) {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/** 进度条字符串 */
export function progressBar(ratio) {
  const filled = Math.round(Math.min(ratio, 1) * BAR_WIDTH);
  return '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);
}

/** 返回当前已过时间的 ms */
export function computeActiveMs(segments, pausedAt) {
  let total = 0;
  for (const seg of segments) {
    const end = seg.endTime ?? pausedAt ?? new Date().toISOString();
    total += new Date(end).getTime() - new Date(seg.startTime).getTime();
  }
  return Math.max(0, total);
}

/** 计算当前会话总计 (含休息时间) */
export function computeWallMs(startTime, pausedAt) {
  const now = pausedAt ?? new Date().toISOString();
  return Math.max(0, new Date(now).getTime() - new Date(startTime).getTime());
}

/**
 * 在终端打印一行可被覆盖的文字
 * 用 ANSI 光标保存/恢复实现原地刷新
 */
export function renderLine(text) {
  process.stdout.write('\x1B[2K\r' + text);
}

export function renderLn(text) {
  process.stdout.write('\x1B[2K\r' + text + '\n');
}

export function clearLine() {
  process.stdout.write('\x1B[2K\r');
}