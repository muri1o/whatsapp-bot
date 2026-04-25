const fs = require('fs');
const path = require('path');

const MAX_TURNS = 20;
const SESSIONS_FILE = path.join(__dirname, '.sessions.json');

function load() {
  try {
    return new Map(Object.entries(JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'))));
  } catch {
    return new Map();
  }
}

function save(sessions) {
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(Object.fromEntries(sessions)));
}

const sessions = load();

function getHistory(chatId) {
  const session = sessions.get(chatId);
  if (!session) return [];
  return session.history;
}

function addTurn(chatId, role, content) {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, { history: [] });
  }
  const session = sessions.get(chatId);
  session.history.push({ role, content });
  if (session.history.length > MAX_TURNS * 2) {
    session.history = session.history.slice(-MAX_TURNS * 2);
  }
  save(sessions);
}

function resetHistory(chatId) {
  sessions.delete(chatId);
  save(sessions);
}

module.exports = { getHistory, addTurn, resetHistory };
