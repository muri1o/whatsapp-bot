// whatsapp-bot/scheduler.js
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { execSync } = require('child_process');
const crypto = require('crypto');

const SCHEDULES_FILE = path.join(__dirname, 'schedules.json');

let _sendMessage = null;
let _chat = null;
let schedules = {};
const jobs = {};

function loadFromDisk() {
  try {
    return JSON.parse(fs.readFileSync(SCHEDULES_FILE, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('[scheduler] Erro ao carregar:', e.message);
    return {};
  }
}

function saveToDisk() {
  fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(schedules, null, 2));
}

async function executeTask(schedule) {
  try {
    let result;
    if (schedule.taskType === 'shell') {
      try {
        result = execSync(schedule.task, { encoding: 'utf8', timeout: 30000 }) || '(sem output)';
      } catch (e) {
        result = e.code === 'ETIMEDOUT' ? 'Comando expirou após 30 segundos' : (e.stderr || e.message);
      }
    } else {
      result = await _chat([], schedule.task);
    }
    await _sendMessage(schedule.chatId, `⏰ *${schedule.label}*\n\n${result}`);
  } catch (e) {
    console.error('[scheduler] Erro ao executar tarefa:', e);
  }
}

function cancelJob(id) {
  if (!jobs[id]) return;
  if (typeof jobs[id].stop === 'function') jobs[id].stop();
  else clearTimeout(jobs[id]);
  delete jobs[id];
}

function registerJob(id, schedule) {
  if (schedule.type === 'once') {
    const delay = new Date(schedule.runAt).getTime() - Date.now();
    if (delay <= 0) {
      setImmediate(async () => {
        await executeTask(schedule);
        remove(id);
      });
    } else {
      jobs[id] = setTimeout(async () => {
        await executeTask(schedule);
        remove(id);
      }, delay);
    }
  } else {
    jobs[id] = cron.schedule(schedule.cronExpr, () => executeTask(schedule));
  }
}

function init(sendMessage, chatFn) {
  _sendMessage = sendMessage;
  _chat = chatFn;
  schedules = loadFromDisk();
  for (const [id, s] of Object.entries(schedules)) registerJob(id, s);
  console.log(`[scheduler] ${Object.keys(schedules).length} tarefa(s) carregada(s)`);

  fs.watchFile(SCHEDULES_FILE, { interval: 5000 }, () => {
    const updated = loadFromDisk();
    for (const id of Object.keys(schedules)) {
      if (!updated[id]) { cancelJob(id); delete schedules[id]; }
    }
    for (const [id, s] of Object.entries(updated)) {
      if (!schedules[id]) { schedules[id] = s; registerJob(id, s); }
    }
  });
}

function add(schedule) {
  const id = crypto.randomUUID().slice(0, 8);
  const entry = { ...schedule, id, createdAt: new Date().toISOString() };
  schedules[id] = entry;
  saveToDisk();
  registerJob(id, entry);
  return entry;
}

function list() {
  return Object.values(schedules);
}

function remove(id) {
  if (!schedules[id]) return false;
  cancelJob(id);
  delete schedules[id];
  saveToDisk();
  return true;
}

module.exports = { init, add, list, remove };
