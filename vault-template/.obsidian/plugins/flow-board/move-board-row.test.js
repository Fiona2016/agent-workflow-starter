const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'obsidian') return { ItemView: class {}, Modal: class {}, Plugin: class {} };
  return originalLoad.call(this, request, parent, isMain);
};
const { moveBoardRow } = require('./main.js');
Module._load = originalLoad;

const board = '---\nkanban-plugin: board\n---\n\n## 💡 Backlog\n\n- [ ] [[a|A]] · first\n- [ ] [[b|B]] · second\n\n## 📋 Ready\n\n- [ ] [[c|C]] · third\n\n## 🤖 Agent 进行中\n\n';

test('moves the exact card row between lanes', () => {
  const result = moveBoardRow(board, 'b', 'ready', 'c');
  assert.match(result, /## 💡 Backlog\n\n- \[ \] \[\[a\|A\]\] · first\n/);
  assert.match(result, /## 📋 Ready\n\n- \[ \] \[\[b\|B\]\] · second\n- \[ \] \[\[c\|C\]\]/);
});

test('reorders within a lane without changing the card text', () => {
  const result = moveBoardRow(board, 'b', 'backlog', 'a');
  assert.match(result, /## 💡 Backlog\n\n- \[ \] \[\[b\|B\]\] · second\n- \[ \] \[\[a\|A\]\]/);
});

test('rejects stale or ambiguous card locations', () => {
  assert.throws(() => moveBoardRow(board, 'missing', 'ready'), /找不到/);
  assert.throws(() => moveBoardRow(`${board}- [ ] [[a|A]]\n`, 'a', 'ready'), /重复/);
});
