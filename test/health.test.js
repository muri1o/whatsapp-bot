const { describe, it } = require('node:test');
const assert = require('assert');

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
