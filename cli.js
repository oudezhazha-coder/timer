#!/usr/bin/env node

/**
 * t — 终端计时器 CLI
 *
 * 用法:
 *   t start <name>           开新会话
 *   t stop  [name]           结束当前会话
 *   t lap   [name]           记录一个时段
 *   t pause                  暂停
 *   t resume                 继续
 *   t status                 当前状态
 *   t list                   历史会话
 *   t show <id|index>        详情
 *   t export <id|index> [fmt] 导出 (csv/json/text, 默认 text)
 *   t rm    <id|index>       删除
 *   t cd <minutes> [name]    倒计时
 */

import { load, save, genId, nowISO, msElapsed } from './lib/store.js';
import {
  fmtDuration, fmtShort, computeActiveMs, computeWallMs,
  renderLine, renderLn, clearLine,
} from './lib/format.js';
import { doExport, FORMATS } from './lib/export.js';

/* ── helpers ── */

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`✓ ${msg}`);
}

/** 用 YYYY-MM-DD HH:mm 展示 */
function localTime(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 根据 id 或 index 查找会话 */
function resolveSession(data, raw) {
  const n = Number(raw);
  if (!Number.isNaN(n) && n >= 1 && n <= data.sessions.length) {
    return data.sessions[n - 1];
  }
  const found = data.sessions.find(s => s.id === raw || s.id.startsWith(raw));
  if (found) return found;
  fail(`找不到会话: ${raw}`);
}

/* ── 实时显示 ── */

function startLiveStatus(data, intervalSec = 1) {
  if (!data.current) fail('当前没有活跃计时');

  const seg = data.current.segments.at(-1);
  const segName = seg?.name ?? '当前段';

  process.stdout.write('\x1B[?25l'); // 隐藏光标

  const timer = setInterval(() => {
    const c = load();
    if (!c.current) {
      clearInterval(timer);
      process.stdout.write('\x1B[?25h'); // 恢复光标
      renderLn('');
      ok('计时已结束');
      return;
    }
    const active = computeActiveMs(c.current.segments, c.current.pausedAt);
    const wall = computeWallMs(c.current.startTime, c.current.pausedAt);
    const segC = c.current.segments.at(-1);
    const segAct = segC
      ? computeActiveMs([segC], c.current.pausedAt)
      : 0;

    const segLabel = segC?.name ? ` [${segC.name}]` : '';
    const pauseLabel = c.current.pausedAt ? ' ⏸ PAUSED' : '';
    const lines = [
      `会话: ${c.current.name}${pauseLabel}`,
      `总时长: ${fmtDuration(wall)}  |  活跃: ${fmtDuration(active)}`,
      `时段${segLabel}: ${fmtDuration(segAct)}`,
      `状态: ${c.current.pausedAt ? '已暂停' : '运行中'}  |  ${c.current.segments.length} 个时段`,
    ];
    // 清屏 & 重绘
    process.stdout.write('\x1B[H\x1B[J');
    console.log('── 计时器状态 ──');
    for (const l of lines) console.log(l);
    console.log('────────────────');
    console.log('按 q 退出实时模式');
  }, intervalSec * 1000);

  // 等待按键
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', (buf) => {
    const key = buf.toString();
    if (key === 'q' || key === 'Q') {
      clearInterval(timer);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\x1B[?25h');
      console.log('');
      renderLn('');
    }
  });
}

/* ── 指令处理 ── */

function cmdStart(args) {
  const name = args.join(' ') || '未命名会话';
  const data = load();
  if (data.current) fail(`已有活跃会话「${data.current.name}」，先 t stop 再开`);

  data.current = {
    id: genId(name),
    name,
    startTime: nowISO(),
    segments: [{ name: '开始', startTime: nowISO(), endTime: null }],
    pausedAt: null,
  };
  save(data);
  ok(`新会话「${name}」已开始 (${localTime(data.current.startTime)})`);
}

function cmdStop(args) {
  const data = load();
  if (!data.current) fail('当前没有活跃计时');

  const now = nowISO();
  // 如果最后一段未结束就先结束它
  const last = data.current.segments.at(-1);
  if (last && !last.endTime) {
    last.endTime = now;
  }

  const active = computeActiveMs(data.current.segments, null);
  const wall = computeWallMs(data.current.startTime, null);

  const session = {
    id: data.current.id,
    name: data.current.name,
    startTime: data.current.startTime,
    endTime: now,
    segments: data.current.segments,
    totalActiveMs: active,
    totalPauseMs: wall - active,
    createdAt: nowISO(),
  };

  data.sessions.unshift(session);
  data.current = null;
  save(data);

  ok(`会话「${session.name}」已保存`);
  console.log(`   活跃: ${fmtDuration(active)}  |  总时长: ${fmtDuration(wall)}`);
  console.log(`   时段: ${session.segments.length}`);
}

function cmdLap(args) {
  const data = load();
  if (!data.current) fail('当前没有活跃计时');
  if (data.current.pausedAt) fail('计时已暂停，先 t resume');

  const now = nowISO();
  const name = args.join(' ') || `时段${data.current.segments.length + 1}`;

  // 结束当前段
  const last = data.current.segments.at(-1);
  if (last && !last.endTime) {
    last.endTime = now;
  }

  // 新段
  data.current.segments.push({ name, startTime: now, endTime: null });
  save(data);

  ok(`新时段「${name}」已记录`);
}

function cmdPause() {
  const data = load();
  if (!data.current) fail('当前没有活跃计时');
  if (data.current.pausedAt) fail('已在暂停中');

  data.current.pausedAt = nowISO();
  save(data);

  const active = computeActiveMs(data.current.segments, data.current.pausedAt);
  ok(`已暂停  (当前活跃: ${fmtDuration(active)})`);
}

function cmdResume() {
  const data = load();
  if (!data.current) fail('当前没有活跃计时');
  if (!data.current.pausedAt) fail('未在暂停状态');

  // 暂停期间不产生活跃时间
  data.current.pausedAt = null;
  save(data);

  ok('已恢复');
}

function cmdStatus() {
  const data = load();
  if (!data.current) {
    console.log('当前无活跃计时');
    return;
  }

  const active = computeActiveMs(data.current.segments, data.current.pausedAt);
  const wall = computeWallMs(data.current.startTime, data.current.pausedAt);
  const pauseLabel = data.current.pausedAt ? ' ⏸ PAUSED' : ' ▶ RUNNING';
  const seg = data.current.segments.at(-1);

  console.log(`会话: ${data.current.name}${pauseLabel}`);
  console.log(`开始: ${localTime(data.current.startTime)}`);
  console.log(`活跃: ${fmtDuration(active)}  |  总时长: ${fmtDuration(wall)}`);
  console.log(`时段: ${data.current.segments.length} 个`);
  if (seg) {
    const segActive = computeActiveMs([seg], data.current.pausedAt);
    console.log(`当前段「${seg.name}」: ${fmtDuration(segActive)}`);
  }
  console.log(`ID: ${data.current.id}`);
}

function cmdList() {
  const data = load();
  if (data.sessions.length === 0 && !data.current) {
    console.log('暂无计时记录');
    return;
  }

  // 当前活跃
  if (data.current) {
    const active = computeActiveMs(data.current.segments, data.current.pausedAt);
    console.log(`▶ 当前: ${data.current.name}  (${fmtDuration(active)})`);
    console.log('');
  }

  if (data.sessions.length === 0) return;

  console.log('历史记录:');
  console.log('  #'.padEnd(4) + '名称'.padEnd(24) + '时间'.padEnd(18) + '活跃'.padEnd(12) + '时段');
  data.sessions.forEach((s, i) => {
    const idx = String(i + 1);
    const name = s.name.length > 22 ? s.name.slice(0, 20) + '…' : s.name;
    const time = localTime(s.startTime);
    const dur = fmtDuration(s.totalActiveMs);
    const segs = String(s.segments.length);
    console.log(`  ${idx.padEnd(3)} ${name.padEnd(22)} ${time.padEnd(16)} ${dur.padEnd(10)} ${segs}`);
  });
}

function cmdShow(args) {
  if (args.length === 0) fail('需要会话 id 或序号 (t list 查看)');
  const data = load();
  const s = resolveSession(data, args[0]);

  console.log(`名称: ${s.name}`);
  console.log(`ID:   ${s.id}`);
  console.log(`开始: ${localTime(s.startTime)}`);
  console.log(`结束: ${localTime(s.endTime)}`);
  console.log(`活跃: ${fmtDuration(s.totalActiveMs)}`);
  console.log(`暂停: ${fmtDuration(s.totalPauseMs ?? 0)}`);
  console.log('');
  console.log('时段:');
  for (const seg of s.segments) {
    const dur = seg.endTime
      ? fmtDuration(new Date(seg.endTime).getTime() - new Date(seg.startTime).getTime())
      : '(进行中)';
    const st = localTime(seg.startTime).slice(11);
    const en = seg.endTime ? localTime(seg.endTime).slice(11) : '...';
    console.log(`  ${st} → ${en}  ${dur.padStart(10)}  [${seg.name}]`);
  }
}

function cmdExport(args) {
  if (args.length === 0) fail('用法: t export <id|序号> [format]');
  const data = load();
  const id = args[0];
  const fmt = args[1] ?? 'text';
  if (!FORMATS.includes(fmt)) fail(`不支持的格式: ${fmt} (支持: ${FORMATS.join(', ')})`);

  const s = resolveSession(data, id);
  const out = doExport(s, fmt);
  ok(`已导出 → ${out}`);
}

function cmdRm(args) {
  if (args.length === 0) fail('需要会话 id 或序号');
  const data = load();
  const raw = args[0];
  const n = Number(raw);
  let removed;
  if (!Number.isNaN(n) && n >= 1 && n <= data.sessions.length) {
    removed = data.sessions.splice(n - 1, 1)[0];
  } else {
    const idx = data.sessions.findIndex(s => s.id === raw || s.id.startsWith(raw));
    if (idx === -1) fail(`找不到会话: ${raw}`);
    removed = data.sessions.splice(idx, 1)[0];
  }
  save(data);
  ok(`已删除会话「${removed.name}」`);
}

function cmdCountdown(args) {
  let minutes = 0;
  let name = '倒计时';

  if (args.length === 0) fail('用法: t cd <分钟数> [名称]');
  minutes = parseFloat(args[0]);
  if (Number.isNaN(minutes) || minutes <= 0) fail('分钟数必须为正数');
  name = args.slice(1).join(' ') || `${minutes}分钟倒计时`;

  const totalMs = minutes * 60 * 1000;
  const start = Date.now();
  let paused = false;
  let pauseStart = 0;
  let totalPauseMs = 0;

  process.stdout.write('\x1B[?25l');

  const timer = setInterval(() => {
    const now = Date.now();
    let elapsed = now - start - totalPauseMs;
    if (paused) elapsed = pauseStart - start - totalPauseMs;
    const remaining = Math.max(0, totalMs - elapsed);

    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    const pct = 1 - remaining / totalMs;
    const bar = '█'.repeat(Math.round(pct * 24)) + '░'.repeat(24 - Math.round(pct * 24));
    const pauseFlag = paused ? ' ⏸ PAUSED' : '';

    process.stdout.write('\x1B[H\x1B[J');
    console.log(`── ${name}${pauseFlag} ──`);
    console.log('');
    console.log(`  ${bar}`);
    console.log(`  ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')} 剩余`);
    console.log('');
    console.log('  按 p 暂停   r 继续   q 退出');

    if (remaining <= 0 && !paused) {
      clearInterval(timer);
      process.stdout.write('\x1B[?25h');
      process.stdout.write('\x1B[H\x1BJ');
      console.log(`\n⏰ 倒计时结束: ${name}`);
      // 播放 beep
      for (let i = 0; i < 3; i++) {
        process.stdout.write('\x07');
      }
      process.stdin.setRawMode(false);
      process.stdin.pause();
      return;
    }
  }, 200);

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', (buf) => {
    const key = buf.toString();
    if (key === 'q' || key === 'Q') {
      clearInterval(timer);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\x1B[?25h');
      process.stdout.write('\x1B[H\x1BJ');
      console.log('倒计时已取消');
    } else if (key === 'p' || key === 'P') {
      if (!paused) {
        paused = true;
        pauseStart = Date.now();
      }
    } else if (key === 'r' || key === 'R') {
      if (paused) {
        totalPauseMs += Date.now() - pauseStart;
        paused = false;
      }
    }
  });
}

/* ── 主入口 ── */

const [cmd, ...args] = process.argv.slice(2);

const dispatch = {
  start: cmdStart,
  stop: cmdStop,
  lap: cmdLap,
  pause: cmdPause,
  resume: cmdResume,
  status: cmdStatus,
  list: cmdList,
  show: cmdShow,
  export: cmdExport,
  rm: cmdRm,
  cd: cmdCountdown,
  countdown: cmdCountdown,
};

if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  console.log(`
t — 终端计时器

用法:
  t start <名称>           开新会话
  t lap   [时段名]         记录一个时段/打点
  t pause                  暂停
  t resume                 继续
  t stop  [名称]           结束并保存当前会话
  t status                 查看当前状态
  t list                   历史记录列表
  t show <id|序号>         查看会话详情
  t export <id|序号> <格式> 导出 (csv/json/text)
  t rm <id|序号>           删除会话
  t cd <分钟数> [名称]      倒计时模式

数据存储在 ~/.timer/data.json
`);
  process.exit(0);
}

if (!dispatch[cmd]) fail(`未知命令: ${cmd}  (t help 查看用法)`);

dispatch[cmd](args);