const { describe, it, before, after } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SESSIONS_FILE = path.join(__dirname, '..', '.sessions.json');

function freshSession() {
  // Delete .sessions.json and clear require cache so session.js reloads cleanly
  try { fs.unlinkSync(SESSIONS_FILE); } catch {}
  // Remove session module from require cache
  const sessionPath = require.resolve('../session.js');
  delete require.cache[sessionPath];
  return require('../session.js');
}

describe('Smoke tests', () => {
  it('loads session module', () => {
    const { getHistory, addTurn, resetHistory } = require('../session.js');
    assert.strictEqual(typeof getHistory, 'function');
    assert.strictEqual(typeof addTurn, 'function');
    assert.strictEqual(typeof resetHistory, 'function');
  });

  it('getHistory returns empty array for new chatId', () => {
    const { getHistory } = require('../session.js');
    const history = getHistory('test-chat-id-' + Date.now());
    assert.deepStrictEqual(history, []);
  });

  it('addTurn and getHistory work together', () => {
    const { getHistory, addTurn } = require('../session.js');
    const chatId = 'test-' + Date.now();
    addTurn(chatId, 'user', 'hello');
    const history = getHistory(chatId);
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].role, 'user');
    assert.strictEqual(history[0].content, 'hello');
  });
});

describe('session.js full coverage', () => {
  it('resetHistory removes session data', () => {
    const { addTurn, getHistory, resetHistory } = freshSession();
    const chatId = 'reset-test-' + Date.now();

    addTurn(chatId, 'user', 'hello');
    assert.strictEqual(getHistory(chatId).length, 1);

    resetHistory(chatId);
    assert.deepStrictEqual(getHistory(chatId), []);
  });

  it('persists sessions to disk via save()', () => {
    const chatId = 'persist-' + Date.now();
    {
      const { addTurn } = freshSession();
      addTurn(chatId, 'user', 'persisted message');
    }
    // Verify the file was written
    const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    assert.ok(data[chatId], 'chatId should be in persisted file');
    assert.strictEqual(data[chatId].history[0].content, 'persisted message');
  });

  it('load() returns empty map when sessions file does not exist', () => {
    try { fs.unlinkSync(SESSIONS_FILE); } catch {}
    const sessionPath = require.resolve('../session.js');
    delete require.cache[sessionPath];
    const { getHistory } = require('../session.js');
    assert.deepStrictEqual(getHistory('nonexistent-' + Date.now()), []);
  });

  it('load() returns empty map when sessions file has invalid JSON', () => {
    fs.writeFileSync(SESSIONS_FILE, 'INVALID_JSON');
    const sessionPath = require.resolve('../session.js');
    delete require.cache[sessionPath];
    const { getHistory } = require('../session.js');
    assert.deepStrictEqual(getHistory('any-id'), []);
    // Cleanup
    try { fs.unlinkSync(SESSIONS_FILE); } catch {}
  });

  it('addTurn trims history when it exceeds MAX_TURNS * 2 (40) entries', () => {
    const { addTurn, getHistory } = freshSession();
    const chatId = 'max-turns-' + Date.now();

    // Add exactly 40 turns (MAX_TURNS * 2)
    for (let i = 0; i < 40; i++) {
      addTurn(chatId, 'user', `message ${i}`);
    }
    assert.strictEqual(getHistory(chatId).length, 40);

    // Adding one more should trim: length becomes 40 still (slice(-40))
    addTurn(chatId, 'assistant', 'reply');
    const history = getHistory(chatId);
    assert.strictEqual(history.length, 40);
    // First message (message 0) should have been dropped
    assert.strictEqual(history[0].content, 'message 1');
    assert.strictEqual(history[39].content, 'reply');
  });

  it('addTurn trims correctly: keeps only the last MAX_TURNS*2 messages', () => {
    const { addTurn, getHistory } = freshSession();
    const chatId = 'trim-' + Date.now();

    // Add 45 turns to trigger trimming twice
    for (let i = 0; i < 45; i++) {
      addTurn(chatId, 'user', `msg-${i}`);
    }
    const history = getHistory(chatId);
    // Should have at most 40 entries
    assert.ok(history.length <= 40, `Expected <= 40, got ${history.length}`);
    // Last entry should be msg-44
    assert.strictEqual(history[history.length - 1].content, 'msg-44');
  });

  it('resetHistory persists deletion to disk', () => {
    const { addTurn, resetHistory } = freshSession();
    const chatId = 'reset-persist-' + Date.now();

    addTurn(chatId, 'user', 'temp');
    let data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    assert.ok(data[chatId], 'session should exist before reset');

    resetHistory(chatId);
    data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    assert.ok(!data[chatId], 'session should be removed after reset');
  });

  it('existing session is reused (not overwritten) when addTurn is called again', () => {
    const { addTurn, getHistory } = freshSession();
    const chatId = 'reuse-' + Date.now();

    addTurn(chatId, 'user', 'first');
    addTurn(chatId, 'assistant', 'second');
    const history = getHistory(chatId);
    assert.strictEqual(history.length, 2);
    assert.strictEqual(history[0].content, 'first');
    assert.strictEqual(history[1].content, 'second');
  });
});
