'use strict';

const MAX_MESSAGE_BYTES = 1024 * 1024;
const engine = require('./task-engine.cjs');

function send(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  if (body.length > MAX_MESSAGE_BYTES) {
    send({ ok: false, error: 'The response is too large. Reduce the request and try again.' });
    return;
  }
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
}

let input = Buffer.alloc(0);
let expectedLength = null;
let queue = Promise.resolve();
process.stdin.on('data', (chunk) => {
  input = Buffer.concat([input, chunk]);
  while (true) {
    if (expectedLength === null) {
      if (input.length < 4) break;
      expectedLength = input.readUInt32LE(0);
      input = input.subarray(4);
      if (expectedLength === 0 || expectedLength > MAX_MESSAGE_BYTES) {
        send({ ok: false, error: 'Invalid native message length.' });
        process.exitCode = 1;
        process.stdin.pause();
        return;
      }
    }
    if (input.length < expectedLength) break;
    const body = input.subarray(0, expectedLength);
    input = input.subarray(expectedLength);
    expectedLength = null;
    queue = queue.then(async () => {
      let request;
      try { request = JSON.parse(body.toString('utf8')); }
      catch { send({ ok: false, error: 'Request body is not valid JSON.' }); return; }
      try { send(await engine.handle(request)); }
      catch (error) { send({ ok: false, id: request?.id, error: (error.message || 'Request failed.').slice(0, 2000) }); }
    });
  }
});

process.stdin.on('end', async () => { await queue; process.exit(0); });
