require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEDULES_FILE = path.join(__dirname, 'schedules.json');
const AUTHORIZED_CHAT = `whatsapp:+${process.env.AUTHORIZED_NUMBER}`;

function load() {
  try { return JSON.parse(fs.readFileSync(SCHEDULES_FILE, 'utf8')); }
  catch { return {}; }
}

function save(schedules) {
  fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(schedules, null, 2));
}

const [,, cmd, ...args] = process.argv;

if (cmd === 'list') {
  const schedules = load();
  const entries = Object.values(schedules);
  if (!entries.length) { console.log('Nenhum agendamento.'); process.exit(0); }
  for (const s of entries) {
    const when = s.type === 'once'
      ? `uma vez em ${new Date(s.runAt).toLocaleString('pt-BR')}`
      : `recorrente: ${s.cronExpr}`;
    console.log(`[${s.id}] ${s.label}\n  ${when}\n  ${s.taskType}: ${s.task}\n`);
  }

} else if (cmd === 'remove') {
  const id = args[0];
  if (!id) { console.error('Uso: node sched.js remove <id>'); process.exit(1); }
  const schedules = load();
  if (!schedules[id]) { console.error(`ID não encontrado: ${id}`); process.exit(1); }
  const label = schedules[id].label;
  delete schedules[id];
  save(schedules);
  console.log(`Removido: [${id}] ${label}`);

} else if (cmd === 'add') {
  // node sched.js add "<cronExpr|isoDatetime>" <shell|message> "<task>" "<label>"
  if (args.length < 4) {
    console.error('Uso: node sched.js add "<time>" <shell|message> "<task>" "<label>"');
    console.error('  time: expressão cron (ex: "0 9 * * *") ou ISO datetime (ex: "2026-04-24T16:00:00")');
    process.exit(1);
  }

  const [timeExpr, taskType, task, label] = args;

  if (taskType !== 'shell' && taskType !== 'message') {
    console.error('taskType deve ser "shell" ou "message"');
    process.exit(1);
  }

  const isIso = /^\d{4}-\d{2}-\d{2}/.test(timeExpr);
  let type, runAt, cronExpr;

  if (isIso) {
    type = 'once';
    runAt = new Date(timeExpr).toISOString();
    cronExpr = null;
  } else {
    type = 'recurring';
    cronExpr = timeExpr;
    runAt = null;
  }

  const id = crypto.randomUUID().slice(0, 8);
  const entry = { id, type, runAt, cronExpr, taskType, task, chatId: AUTHORIZED_CHAT, label, createdAt: new Date().toISOString() };
  const schedules = load();
  schedules[id] = entry;
  save(schedules);
  console.log(`Agendado [${id}]: ${label}`);
  console.log('(O bot detectará a mudança em até 5 segundos)');

} else {
  console.log('Uso:');
  console.log('  node sched.js list');
  console.log('  node sched.js add "<time>" <shell|message> "<task>" "<label>"');
  console.log('  node sched.js remove <id>');
  console.log('');
  console.log('Exemplos:');
  console.log('  node sched.js add "0 9 * * *" shell "ls -la /tmp" "listar tmp 9h"');
  console.log('  node sched.js add "2026-04-24T16:00:00" message "resumir os logs" "resumo 16h"');
}
