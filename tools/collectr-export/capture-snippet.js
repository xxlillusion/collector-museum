// Paste this into the DevTools Console on your Collectr portfolio page.
//
// An alternative to exporting a HAR, because Chrome keeps moving that menu and
// the sanitized/with-content distinction trips people up. This records the JSON
// the page fetches while YOU scroll, then saves a file shaped exactly like a
// HAR — so tools/collectr-export/from-har.mjs reads it through the same,
// already-tested path.
//
// It runs in your own browser, in your own signed-in session. It sends nothing
// anywhere: everything stays in the tab until you click save.
//
// ── How to use ──────────────────────────────────────────────────────────────
// 1. Open https://app.getcollectr.com/portfolio/products, signed in as normal.
// 2. F12 → Console.
// 3. Chrome blocks pasting into the console the first time: it will ask you to
//    type  allow pasting  and press Enter. That warning is there to stop people
//    being socially engineered into pasting code they don't understand — read
//    this file first, it is short.
// 4. Paste all of this, press Enter. You should see "Recording…".
// 5. Scroll through your WHOLE collection, slowly enough that every page loads.
// 6. Run:  collectrSave()
// 7. A collectr-capture.json lands in your Downloads. Then:
//      npm run collectr:from-har -- --har C:\Users\<you>\Downloads\collectr-capture.json
// ────────────────────────────────────────────────────────────────────────────

(() => {
  if (window.collectrSave) {
    console.log('%cAlready recording. Scroll, then run collectrSave()', 'color:#0a0');
    return;
  }

  const entries = [];
  const seen = new Set();

  const record = (url, text) => {
    if (typeof text !== 'string' || text.length < 2) return;
    const head = text.trimStart()[0];
    if (head !== '{' && head !== '[') return;
    // Same page fetched twice adds nothing; from-har dedupes rows anyway, but
    // keeping the file small makes it far easier to eyeball.
    const key = url + '::' + text.length;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({
      request: { url: String(url), method: 'GET' },
      response: { status: 200, content: { mimeType: 'application/json', text } },
    });
    if (entries.length % 5 === 0) console.log(`  …${entries.length} responses captured`);
  };

  const origFetch = window.fetch;
  window.fetch = function (...args) {
    return origFetch.apply(this, args).then((res) => {
      try {
        const url = res.url || (typeof args[0] === 'string' ? args[0] : args[0] && args[0].url) || '';
        const ct = res.headers && res.headers.get ? res.headers.get('content-type') || '' : '';
        if (/json/i.test(ct)) res.clone().text().then((t) => record(url, t)).catch(() => {});
      } catch { /* never let recording break the page */ }
      return res;
    });
  };

  // Collectr may use either transport, and missing one silently halves the
  // capture — so both are wrapped.
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__collectrUrl = url;
    return origOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', () => {
      try {
        const ct = this.getResponseHeader('content-type') || '';
        if (/json/i.test(ct) && typeof this.responseText === 'string') {
          record(this.__collectrUrl || '', this.responseText);
        }
      } catch { /* ignore */ }
    });
    return origSend.apply(this, args);
  };

  window.collectrSave = () => {
    if (entries.length === 0) {
      console.log('%cNothing captured yet — scroll your collection first.', 'color:#c00');
      return;
    }
    const blob = new Blob([JSON.stringify({ log: { version: '1.2', entries } })],
      { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'collectr-capture.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    console.log(`%cSaved ${entries.length} responses to collectr-capture.json`, 'color:#0a0');
  };

  window.collectrCount = () => entries.length;

  console.log('%cRecording…', 'color:#0a0;font-weight:bold');
  console.log('Scroll through your whole collection, then run:  collectrSave()');
  console.log('Check progress any time with:  collectrCount()');
})();
