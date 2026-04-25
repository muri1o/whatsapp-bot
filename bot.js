require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chat, extractSchedule } = require('./claude.js');
const { getHistory, addTurn, resetHistory } = require('./session.js');
const { textToSpeech } = require('./tts.js');
const scheduler = require('./scheduler.js');
const twilio = require('twilio');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const FROM = `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`;

const MAX_MSG_LENGTH = 1500;

const SCHEDULE_KEYWORDS = ['às ', ' às', 'daqui ', 'todo dia', 'toda semana', 'toda hora', 'amanhã', 'a cada ', 'todo mês'];

function splitMessage(text) {
  const parts = [];
  for (let i = 0; i < text.length; i += MAX_MSG_LENGTH) {
    parts.push(text.slice(i, i + MAX_MSG_LENGTH));
  }
  return parts;
}

async function sendMessage(to, text) {
  const parts = splitMessage(text);
  for (const part of parts) {
    await client.messages.create({ from: FROM, to, body: part });
  }
}

let voiceMode = false;

function stripMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/gs, '$1')
    .replace(/\*(.*?)\*/gs, '$1')
    .replace(/_(.*?)_/gs, '$1')
    .replace(/~(.*?)~/gs, '$1')
    .replace(/`{1,3}([\s\S]*?)`{1,3}/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function sendAudio(to, text) {
  const publicUrl = process.env.PUBLIC_URL;
  if (!publicUrl) {
    await sendMessage(to, '⚠️ Configure PUBLIC_URL no .env para usar o modo voz.');
    return;
  }

  const truncated = stripMarkdown(text).slice(0, 4000);

  let filePath;
  try {
    filePath = textToSpeech(truncated);
  } catch (err) {
    console.error('[sendAudio] TTS falhou, enviando texto:', err.message);
    await sendMessage(to, text);
    return;
  }

  const filename = path.basename(filePath);
  const mediaUrl = `${publicUrl}/media/${filename}`;

  try {
    await client.messages.create({ from: FROM, to, mediaUrl: [mediaUrl] });
    console.log('[sendAudio] Áudio enviado:', mediaUrl);
  } catch (err) {
    console.error('[sendAudio] Falha ao enviar áudio:', err.message);
    await sendMessage(to, text);
  }

  setTimeout(() => {
    try { fs.unlinkSync(filePath); } catch {}
  }, 60000);
}

function hasScheduleKeywords(text) {
  const lower = text.toLowerCase();
  return SCHEDULE_KEYWORDS.some(kw => lower.includes(kw));
}

function parseAgendar(args) {
  // cron "expr" <task>
  const cronMatch = args.match(/^cron\s+"([^"]+)"\s+([\s\S]+)$/i);
  if (cronMatch) {
    const cronExpr = cronMatch[1];
    const taskStr = cronMatch[2].trim();
    if (!taskStr) return null;
    const isShell = taskStr.startsWith('!run ');
    return {
      type: 'recurring', cronExpr, runAt: null,
      taskType: isShell ? 'shell' : 'message',
      task: isShell ? taskStr.slice(5).trim() : taskStr,
      label: taskStr.slice(0, 50)
    };
  }

  // Nh or Nm
  const relMatch = args.match(/^(\d+)(h|m)\s+([\s\S]+)$/i);
  if (relMatch) {
    const ms = parseInt(relMatch[1]) * (relMatch[2].toLowerCase() === 'h' ? 3600000 : 60000);
    const taskStr = relMatch[3].trim();
    if (!taskStr) return null;
    const isShell = taskStr.startsWith('!run ');
    return {
      type: 'once', cronExpr: null,
      runAt: new Date(Date.now() + ms).toISOString(),
      taskType: isShell ? 'shell' : 'message',
      task: isShell ? taskStr.slice(5).trim() : taskStr,
      label: taskStr.slice(0, 50)
    };
  }

  // HH:MM
  const timeMatch = args.match(/^(\d{1,2}):(\d{2})\s+([\s\S]+)$/);
  if (timeMatch) {
    const h = parseInt(timeMatch[1]);
    const m = parseInt(timeMatch[2]);
    if (h > 23 || m > 59) return null;
    const target = new Date();
    target.setHours(h, m, 0, 0);
    if (target <= new Date()) target.setDate(target.getDate() + 1);
    const taskStr = timeMatch[3].trim();
    if (!taskStr) return null;
    const isShell = taskStr.startsWith('!run ');
    return {
      type: 'once', cronExpr: null,
      runAt: target.toISOString(),
      taskType: isShell ? 'shell' : 'message',
      task: isShell ? taskStr.slice(5).trim() : taskStr,
      label: taskStr.slice(0, 50)
    };
  }

  return null;
}

function formatScheduleList(schedules) {
  if (!schedules.length) return 'Nenhuma tarefa agendada.';
  return schedules.map(s => {
    const when = s.type === 'once'
      ? `uma vez em ${new Date(s.runAt).toLocaleString('pt-BR')}`
      : `recorrente: ${s.cronExpr}`;
    return `[${s.id}] *${s.label}*\n  ${when}\n  ${s.taskType}: ${s.task}`;
  }).join('\n\n');
}

async function handleMessage(from, text) {
  text = (text || '').trim();
  if (!text) return;

  const chatId = from;

  if (text === '!status') {
    await sendMessage(from, 'Bot online ✓');
    return;
  }

  if (text === '!reset') {
    resetHistory(chatId);
    await sendMessage(from, 'Histórico limpo.');
    return;
  }

  if (text === '!voz') {
    if (!process.env.PUBLIC_URL) {
      await sendMessage(from, '⚠️ Configure PUBLIC_URL no .env primeiro.');
      return;
    }
    voiceMode = !voiceMode;
    await sendMessage(from, voiceMode ? '🔊 Modo voz ativado.' : '💬 Modo voz desativado.');
    return;
  }

  if (text === '!tarefas') {
    await sendMessage(from, formatScheduleList(scheduler.list()));
    return;
  }

  if (text.startsWith('!cancelar ')) {
    const id = text.slice(10).trim();
    const schedules = scheduler.list();
    const entry = schedules.find(s => s.id === id);
    if (!entry) {
      await sendMessage(from, `Agendamento não encontrado: ${id}`);
    } else {
      scheduler.remove(id);
      await sendMessage(from, `✅ Agendamento "${entry.label}" cancelado.`);
    }
    return;
  }

  if (text.startsWith('!agendar ')) {
    const args = text.slice(9).trim();
    const parsed = parseAgendar(args);
    if (!parsed) {
      await sendMessage(from, 'Formato inválido. Exemplos:\n!agendar 14:30 !run backup.sh\n!agendar 2h resumir logs\n!agendar cron "0 9 * * *" bom dia');
      return;
    }
    const entry = scheduler.add({ ...parsed, chatId: from });
    const when = entry.type === 'once'
      ? `em ${new Date(entry.runAt).toLocaleString('pt-BR')}`
      : `recorrente (${entry.cronExpr})`;
    await sendMessage(from, `✅ Agendado [${entry.id}]: *${entry.label}* — ${when}`);
    return;
  }

  if (text.startsWith('!run ')) {
    const command = text.slice(5).trim();
    if (!command) {
      await sendMessage(from, 'Uso: !run <comando>');
      return;
    }
    try {
      const output = execSync(command, { encoding: 'utf8', timeout: 30000 });
      await sendMessage(from, output || '(sem output)');
    } catch (err) {
      if (err.code === 'ETIMEDOUT') await sendMessage(from, 'Comando expirou após 30 segundos');
      else await sendMessage(from, `Erro: ${err.stderr || err.message}`);
    }
    return;
  }

  // Natural language scheduling detection
  if (hasScheduleKeywords(text)) {
    try {
      const parsed = await extractSchedule(text);
      if (parsed) {
        const entry = scheduler.add({ ...parsed, chatId: from });
        const when = entry.type === 'once'
          ? `em ${new Date(entry.runAt).toLocaleString('pt-BR')}`
          : `recorrente (${entry.cronExpr})`;
        await sendMessage(from, `✅ Agendado [${entry.id}]: *${entry.label}* — ${when}`);
        return;
      }
    } catch (e) {
      console.error('[bot] NLP schedule error:', e);
    }
  }

  try {
    const history = getHistory(chatId);
    console.log('[chat] chamando Claude, histórico:', history.length, 'msgs');
    const response = await chat(history, text);
    console.log('[chat] resposta recebida, tamanho:', response.length);
    addTurn(chatId, 'user', text);
    addTurn(chatId, 'assistant', response);
    console.log('[chat] enviando via Twilio...');
    if (voiceMode) {
      await sendAudio(from, response);
    } else {
      await sendMessage(from, response);
    }
    console.log('[chat] enviado com sucesso');
  } catch (err) {
    console.error('[chat] ERRO:', err);
    await sendMessage(from, 'Erro ao processar, tente novamente.');
  }
}

module.exports = { handleMessage, sendMessage };
