function readIssueContext() {
  const title = document.querySelector('[data-testid="issue-title"]')?.textContent?.trim()
    || document.querySelector('bdi.js-issue-title')?.textContent?.trim()
    || document.querySelector('.js-issue-title')?.textContent?.trim()
    || document.title;
  const body = document.querySelector('[data-testid="issue-body"]')
    || document.querySelector('.js-comment-body')
    || document.querySelector('.comment-body');
  const selection = window.getSelection()?.toString().trim();
  const excerpt = (selection || body?.innerText || '').trim().slice(0, 6000);
  return {
    url: location.href,
    title: title.slice(0, 300),
    excerpt,
    sharedAt: new Date().toISOString(),
    source: 'github'
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'exo:share-current-page') return false;
  sendResponse({ ok: true, context: readIssueContext() });
  return false;
});
