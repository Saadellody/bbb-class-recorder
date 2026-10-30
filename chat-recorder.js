// Injected into a live BBB class while it is being recorded.
// Watches the public chat panel and sends each new message to the background.
(() => {
  if (window.__bbbChatRecorder) return;

  const MSG_SEL = [
    '[data-test="chatUserMessageText"]',
    '[data-test="chatPollMessageText"]',
    '[data-test="chatClearMessageText"]',
  ].join(",");
  const recent = new Map(); // "name|text" -> last seen time, to skip re-rendered messages

  function senderOf(el) {
    for (let a = el.parentElement, i = 0; a && i < 6; a = a.parentElement, i++) {
      const n = a.querySelector('[data-test*="name" i], [class*="name" i]');
      if (n && !n.contains(el) && n.innerText.trim()) return n.innerText.trim().split("\n")[0];
    }
    return "";
  }

  function handle(el) {
    const text = el.innerText.trim();
    if (!text) return;
    const name = senderOf(el);
    const key = name + "|" + text;
    const now = Date.now();
    if (recent.has(key) && now - recent.get(key) < 120000) return;
    recent.set(key, now);
    chrome.runtime.sendMessage({ type: "chat", name, text });
  }

  // Messages already in the chat when recording starts
  document.querySelectorAll(MSG_SEL).forEach(handle);

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches(MSG_SEL)) handle(n);
        n.querySelectorAll(MSG_SEL).forEach(handle);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  const onStop = (msg) => {
    if (msg.type !== "chat-stop") return;
    observer.disconnect();
    chrome.runtime.onMessage.removeListener(onStop);
    window.__bbbChatRecorder = null;
  };
  chrome.runtime.onMessage.addListener(onStop);
  window.__bbbChatRecorder = true;
})();
