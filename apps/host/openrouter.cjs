'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const scriptPath = path.resolve(__dirname, '../../scripts/credential.ps1');

function credential(action, input = '') {
  if (process.platform !== 'win32') throw new Error('Credential storage currently requires Windows DPAPI.');
  const result = spawnSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, action
  ], { input, encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 4096 });
  if (result.error) throw new Error(`Credential storage failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error((result.stderr || 'Credential storage failed.').trim().slice(0, 300));
  return result.stdout;
}

function saveApiKey(key) {
  if (typeof key !== 'string' || !/^sk-or-[A-Za-z0-9_-]{16,480}$/.test(key)) throw new Error('Enter a valid OpenRouter API key.');
  credential('set', key);
}

function clearApiKey() { credential('clear'); }

async function complete({ model, messages, maxTokens = 6000 }) {
  const apiKey = credential('get').trim();
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-OpenRouter-Title': 'Exo'
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.1, response_format: { type: 'json_object' } }),
    signal: AbortSignal.timeout(120000)
  });
  if (!response.ok) {
    const text = (await response.text()).slice(0, 1000);
    let detail = text;
    try { detail = JSON.parse(text).error?.message || text; } catch {}
    throw new Error(`OpenRouter returned ${response.status}: ${detail}`);
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('OpenRouter returned no proposal content.');
  try { return JSON.parse(content); }
  catch { throw new Error('OpenRouter returned a response that was not valid JSON.'); }
}

module.exports = { complete, saveApiKey, clearApiKey };
