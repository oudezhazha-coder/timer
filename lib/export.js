/**
 * 导出模块 — CSV / JSON / 文本
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fmtDuration } from './format.js';

function escapeCSV(v) {
  const s = String(v ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function toCSVRows(session) {
  const rows = [];
  for (const seg of session.segments) {
    const duration = seg.endTime
      ? new Date(seg.endTime).getTime() - new Date(seg.startTime).getTime()
      : 0;
    rows.push([
      session.name,
      seg.name ?? '(unnamed)',
      seg.startTime,
      seg.endTime ?? '(running)',
      fmtDuration(duration),
      String(duration),
    ]);
  }
  return rows;
}

export function exportCSV(session) {
  const header = ['session_name', 'segment_name', 'start_time', 'end_time', 'duration', 'duration_ms'];
  const rows = toCSVRows(session);
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(r.map(escapeCSV).join(','));
  }
  return lines.join('\n');
}

export function exportJSON(session) {
  return JSON.stringify(session, null, 2);
}

export function exportText(session) {
  const lines = [];
  lines.push(`会话: ${session.name}`);
  lines.push(`开始: ${session.startTime}`);
  lines.push(`结束: ${session.endTime ?? '(未结束)'}`);
  lines.push(`总活跃: ${fmtDuration(session.totalActiveMs)}`);
  lines.push(`暂停:  ${fmtDuration(session.totalPauseMs)}`);
  lines.push('--- 时段 ---');
  for (const seg of session.segments) {
    const dur = seg.endTime
      ? fmtDuration(new Date(seg.endTime).getTime() - new Date(seg.startTime).getTime())
      : '(进行中)';
    const label = seg.name ? `[${seg.name}]` : '';
    lines.push(`  ${label} ${seg.startTime.slice(11, 19)} → ${seg.endTime?.slice(11, 19) ?? '...'}  ${dur}`);
  }
  lines.push('');
  return lines.join('\n');
}

export function doExport(session, fmt, outPath) {
  let content;
  switch (fmt) {
    case 'csv':  content = exportCSV(session); break;
    case 'json': content = exportJSON(session); break;
    case 'text':
    default:     content = exportText(session); break;
  }
  const target = outPath || `timer_export_${session.id}.${fmt === 'text' ? 'txt' : fmt}`;
  writeFileSync(resolve(target), content, 'utf-8');
  return resolve(target);
}

export const FORMATS = ['csv', 'json', 'text'];