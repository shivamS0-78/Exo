const hostName = 'com.exo.host';
const $ = (selector) => document.querySelector(selector);
const repositorySelect = $('#repositories');
let state = { repositories: [], settings: null, context: null, task: null };
let busy = false;

function showNotice(message, success = false) {
  const box = $('#notice');
  box.textContent = message;
  box.classList.toggle('hidden', !message);
  box.classList.toggle('success', success);
}

function sendHost(message, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let port;
    try { port = chrome.runtime.connectNative(hostName); }
    catch (error) { reject(error); return; }
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; port.disconnect(); reject(new Error('The local host timed out.')); } }, timeoutMs);
    port.onMessage.addListener((response) => {
      if (settled) return;
      settled = true; clearTimeout(timer); port.disconnect();
      if (!response?.ok) reject(new Error(response?.error || 'The local host returned an error.'));
      else resolve(response);
    });
    port.onDisconnect.addListener(() => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      reject(new Error(chrome.runtime.lastError?.message || 'The local host disconnected before responding.'));
    });
    port.postMessage(message);
  });
}

function renderContext(record) {
  const panel = $('#context'); panel.replaceChildren();
  if (!record?.context) { panel.classList.add('hidden'); return; }
  const context = record.context;
  const title = document.createElement('p'); title.className = 'context-title'; title.textContent = context.title;
  const link = document.createElement('a'); link.className = 'context-url'; link.href = context.url; link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = context.url;
  const excerpt = document.createElement('p'); excerpt.className = 'context-excerpt'; excerpt.textContent = context.excerpt || 'No issue description or selected text was available.';
  const meta = document.createElement('p'); meta.className = 'subtle'; meta.textContent = `Shared with ${record.repositoryName} · ${new Date(context.sharedAt).toLocaleString()}`;
  panel.append(title, link, excerpt, meta); panel.classList.remove('hidden');
}

function renderSettings(settings) {
  if (!settings) return;
  $('#model').value = settings.model;
  $('#model-state').textContent = settings.configured ? 'Key configured' : 'Key required';
  $('#model-state').className = settings.configured ? 'subtle configured' : 'subtle';
  refreshActions();
}

function renderRepositories(items, preferred) {
  state.repositories = items || [];
  const previous = preferred || repositorySelect.value;
  repositorySelect.replaceChildren();
  if (!state.repositories.length) {
    repositorySelect.add(new Option('No repositories configured', ''));
    repositorySelect.disabled = true;
    $('#repo-help').textContent = 'Add a Git repository with `pnpm repo add <path>`.';
    refreshActions(); return;
  }
  for (const repo of state.repositories) {
    const option = new Option(repo.available ? repo.name : `${repo.name} (folder unavailable)`, repo.id);
    option.title = repo.path;
    option.disabled = !repo.available; repositorySelect.add(option);
  }
  if (state.repositories.some((repo) => repo.id === previous && repo.available)) repositorySelect.value = previous;
  else if (state.repositories.find((repo) => repo.available)) repositorySelect.value = state.repositories.find((repo) => repo.available).id;
  repositorySelect.disabled = !state.repositories.some((repo) => repo.available);
  $('#repo-help').textContent = `${state.repositories.filter((repo) => repo.available).length} available · configured paths stay local.`;
  refreshActions();
}

function renderTask(task) {
  state.task = task;
  const review = $('#review'); const result = $('#result');
  review.classList.toggle('hidden', !task);
  result.classList.toggle('hidden', !task || !task.result);
  if (!task) return;
  $('#summary').textContent = `${task.summary}\n\n${task.repository.name} · ${task.baseHead.slice(0, 12)} · ${task.issue.title}`;
  const taskIssue = $('#task-issue'); taskIssue.replaceChildren();
  const issueLink = document.createElement('a'); issueLink.className = 'context-url'; issueLink.href = task.issue.url; issueLink.target = '_blank'; issueLink.rel = 'noreferrer'; issueLink.textContent = task.issue.url;
  const issueExcerpt = document.createElement('p'); issueExcerpt.className = 'context-excerpt'; issueExcerpt.textContent = task.issue.excerpt || 'No issue excerpt was shared.';
  taskIssue.append(issueLink, issueExcerpt);
  $('#task-request').textContent = task.instruction;
  $('#repository-path').textContent = `Local repository: ${task.repository.path}`;
  $('#patch-hash').textContent = `${task.patchHash.slice(0, 16)}…`;
  $('#patch').textContent = task.patch;
  $('#profile').textContent = `${task.profile.name} · ${task.profile.image} (${task.profile.imageId || 'unresolved'}) · ${task.profile.cwd} · ${task.profile.format} output`;
  $('#command').textContent = JSON.stringify(task.profile.argv, null, 2);
  $('#disclosure').textContent = JSON.stringify(task.dataSent, null, 2);
  $('#approve').classList.toggle('hidden', task.status !== 'proposed');
  $('#approve').disabled = busy;
  $('#task-state').textContent = task.status === 'proposed' && task.expiresAt ? `Awaiting approval · expires ${new Date(task.expiresAt).toLocaleTimeString()}` : task.status === 'proposed' ? 'Awaiting approval' : task.status;
  $('#reply').classList.toggle('hidden', !task.replyDraft);
  $('#reply').textContent = task.replyDraft ? `Draft reply (not sent):\n${task.replyDraft}` : '';
  if (task.result) {
    const resultError = task.result.error || '';
    const verdict = task.result.verdict || 'failed';
    $('#verdict').textContent = verdict.replaceAll('_', ' ');
    $('#verdict').className = `pill ${verdict === 'failed' ? 'bad' : verdict === 'verified' ? 'good' : 'neutral'}`;
    $('#verdict-title').textContent = 'Test evidence';
    $('#result-error').textContent = resultError;
    $('#result-error').classList.toggle('hidden', !resultError);
    $('#baseline-evidence').classList.toggle('hidden', task.result.baselineExitCode === undefined);
    $('#fixed-evidence').classList.toggle('hidden', task.result.fixedExitCode === undefined);
    $('#baseline-evidence').querySelector('label').textContent = `Baseline run · ${task.result.baselineTestCount || 0} tests recognized`;
    $('#fixed-evidence').querySelector('label').textContent = `Patched run · ${task.result.fixedTestCount || 0} tests recognized`;
    $('#baseline-output').textContent = `Exit code: ${task.result.baselineExitCode}\n${task.result.baselineOutput || ''}`;
    $('#fixed-output').textContent = `Exit code: ${task.result.fixedExitCode}\n${task.result.fixedOutput || ''}`;
    $('#apply').classList.toggle('hidden', !(task.status === 'completed' && ['verified', 'passed_unproven'].includes(verdict) && task.result.fixedExitCode === 0));
    $('#rollback').classList.toggle('hidden', task.status !== 'applied');
  }
  refreshActions();
}

function refreshActions() {
  const repositoryAvailable = state.repositories.some((repo) => repo.id === repositorySelect.value && repo.available);
  $('#share').disabled = busy || !repositoryAvailable;
  $('#propose').disabled = busy || !repositoryAvailable || !state.settings?.configured || !state.context || state.context.repositoryId !== repositorySelect.value || !$('#request').value.trim();
}

async function refreshState() {
  const indicator = $('#connection'); indicator.className = 'status-dot';
  try {
    const response = await sendHost({ version: 1, id: crypto.randomUUID(), type: 'get_state' });
    state.context = response.context;
    const stored = await chrome.storage.local.get('selectedRepositoryId');
    renderRepositories(response.repositories, stored.selectedRepositoryId);
    renderSettings(response.settings);
    renderContext(response.context);
    renderTask(response.task);
    indicator.className = 'status-dot ready';
    showNotice('');
  } catch (error) {
    indicator.className = 'status-dot error';
    showNotice(`${error.message} Install or restart the Exo host to continue.`);
  }
}

async function shareCurrentPage() {
  const repo = state.repositories.find((item) => item.id === repositorySelect.value && item.available);
  if (!repo) return;
  busy = true; refreshActions(); $('#share').textContent = 'Reading page…'; showNotice('');
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id || !tab.url?.startsWith('https://github.com/')) throw new Error('Open a GitHub issue or pull request, then share it here.');
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'exo:share-current-page' });
    if (!response?.ok || !response.context?.url) throw new Error('Could not read the page. Refresh it and try again.');
    const saved = await sendHost({ version: 1, id: crypto.randomUUID(), type: 'share_context', repositoryId: repo.id, context: response.context });
    state.context = saved.context; renderContext(saved.context); showNotice('Issue context saved locally.', true);
  } catch (error) { showNotice(error.message); }
  finally { busy = false; $('#share').textContent = 'Share current GitHub page'; refreshActions(); }
}

async function saveSettings() {
  busy = true; $('#save-settings').disabled = true; showNotice('');
  try {
    const model = $('#model').value.trim();
    await sendHost({ version: 1, id: crypto.randomUUID(), type: 'set_model', model });
    const key = $('#api-key').value.trim();
    if (key) await sendHost({ version: 1, id: crypto.randomUUID(), type: 'save_openrouter_key', apiKey: key });
    $('#api-key').value = '';
    const response = await sendHost({ version: 1, id: crypto.randomUUID(), type: 'get_state' });
    state.settings = response.settings; renderSettings(response.settings);
    showNotice(key ? 'Model and API key saved. The key is protected for this Windows user.' : 'Model saved.', true);
  } catch (error) { showNotice(error.message); }
  finally { busy = false; $('#save-settings').disabled = false; refreshActions(); }
}

async function clearKey() {
  if (!confirm('Remove the OpenRouter key stored for this Windows user?')) return;
  busy = true;
  try {
    const response = await sendHost({ version: 1, id: crypto.randomUUID(), type: 'clear_openrouter_key' });
    state.settings = response.settings; renderSettings(response.settings); showNotice('OpenRouter key removed.', true);
  } catch (error) { showNotice(error.message); }
  finally { busy = false; refreshActions(); }
}

async function prepareProposal() {
  busy = true; $('#propose').textContent = 'Asking OpenRouter…'; refreshActions(); showNotice('');
  try {
    const response = await sendHost({ version: 1, id: crypto.randomUUID(), type: 'propose_task', repositoryId: repositorySelect.value, instruction: $('#request').value.trim(), model: state.settings.model }, 130000);
    renderTask(response.task); showNotice('Proposal ready. Review the exact patch, test profile, and provider data before approving.', true);
  } catch (error) { showNotice(error.message); }
  finally { busy = false; $('#propose').textContent = 'Prepare change proposal'; refreshActions(); }
}

async function approveAndRun() {
  if (!state.task || state.task.status !== 'proposed' || busy) return;
  busy = true; $('#approve').textContent = 'Running approved plan…'; $('#task-state').textContent = 'Running'; refreshActions(); showNotice('Approval consumed. The repository remains unchanged while isolated tests run.');
  try {
    const response = await sendHost({ version: 1, id: crypto.randomUUID(), type: 'approve_and_run', taskId: state.task.id, patchHash: state.task.patchHash, profileHash: state.task.profileHash }, 630000);
    renderTask(response.task); showNotice('Execution finished. Review both baseline and patched test evidence.', response.task.result?.fixedExitCode === 0);
  } catch (error) { showNotice(error.message); await refreshState(); }
  finally { busy = false; $('#approve').textContent = 'Approve this patch and run tests'; refreshActions(); }
}

async function applyPatch() {
  if (!state.task || busy) return;
  busy = true; $('#apply').disabled = true;
  try { const response = await sendHost({ version: 1, id: crypto.randomUUID(), type: 'apply_to_repository', taskId: state.task.id }); renderTask(response.task); showNotice('Passing patch applied to the selected repository.', true); }
  catch (error) { showNotice(error.message); }
  finally { busy = false; refreshActions(); }
}

async function rollback() {
  if (!state.task || busy) return;
  busy = true; $('#rollback').disabled = true;
  try { const response = await sendHost({ version: 1, id: crypto.randomUUID(), type: 'rollback', taskId: state.task.id }); renderTask(response.task); showNotice('Exo changes rolled back.', true); }
  catch (error) { showNotice(error.message); }
  finally { busy = false; refreshActions(); }
}

function speak() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { showNotice('Voice input is unavailable in this browser. Enter the request in the text box.'); return; }
  const recognition = new Recognition(); recognition.lang = 'en-US'; recognition.interimResults = false;
  $('#speak').textContent = 'Listening…';
  recognition.onresult = (event) => { $('#request').value = event.results[0][0].transcript; refreshActions(); };
  recognition.onerror = () => showNotice('Voice input failed. You can enter the request as text.');
  recognition.onend = () => { $('#speak').textContent = 'Speak'; };
  recognition.start();
}

$('#refresh').addEventListener('click', refreshState);
$('#share').addEventListener('click', shareCurrentPage);
$('#save-settings').addEventListener('click', saveSettings);
$('#clear-key').addEventListener('click', clearKey);
$('#propose').addEventListener('click', prepareProposal);
$('#approve').addEventListener('click', approveAndRun);
$('#apply').addEventListener('click', applyPatch);
$('#rollback').addEventListener('click', rollback);
$('#speak').addEventListener('click', speak);
$('#request').addEventListener('input', refreshActions);
repositorySelect.addEventListener('change', () => {
  chrome.storage.local.set({ selectedRepositoryId: repositorySelect.value });
  refreshActions();
});
refreshState();
