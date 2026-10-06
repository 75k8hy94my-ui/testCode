chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type !== 'MOMON_EXTRACT_ACTIVE' || message.schemaVersion !== 1) return false;
  (async () => {
    const { candidate, errors } = MomonGaExtractor.extract(document, location.href);
    if (!candidate.sourceUrl || !candidate.pages.length) return { errors: errors.length ? errors : ['ページURL一覧を取得できませんでした'] };
    const result = await chrome.runtime.sendMessage({ type: 'MOMON_QUEUE_ADD', schemaVersion: 1, candidate, warnings: errors });
    if (result?.error) throw new Error(result.error);
    return { item: result.item, errors };
  })().then(respond, error => respond({ error: error.message }));
  return true;
});
