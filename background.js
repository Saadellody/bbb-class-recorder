// Click the toolbar icon to start recording the current tab, click again to stop.
// The video is recorded in an offscreen document. On a saved séance, the click downloads it instead.

let chain = Promise.resolve(); // serializes state updates

const getState = async () => (await chrome.storage.session.get("rec")).rec || null;
const setState = (rec) => chrome.storage.session.set({ rec });
const queue = (fn) => (chain = chain.then(fn).catch((e) => console.error(e)));

function setBadge(text, title) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: text === "REC" ? "#d93025" : "#555" });
  chrome.action.setTitle({ title });
}

function safeName(s) {
  return (
    s.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").slice(0, 100) ||
    "recording"
  );
}

function stamp(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}h${p(d.getMinutes())}`;
}

function download(url, filename) {
  return chrome.downloads.download({ url, filename, conflictAction: "uniquify", saveAs: false });
}

async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (existing.length) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["USER_MEDIA"],
    justification: "Record the class tab's video and audio",
  });
}

// ---------- start / stop ----------

chrome.action.onClicked.addListener(async (tab) => {
  // On a saved séance: download its files directly (fast, full quality)
  if (/\/playback\/presentation\//.test(tab.url || "") && !(await getState())) {
    setBadge("⬇", "Downloading this séance…");
    try {
      // Usually already loaded by the manifest; inject it if the page was open before install
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["playback-download.js"] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => globalThis.bbbDownload() });
    } catch (e) {
      setBadge("ERR", "Could not read this page: " + e.message);
    }
    return;
  }

  if (await getState()) {
    setBadge("...", "Saving…");
    chrome.runtime.sendMessage({ target: "offscreen", type: "stop" });
    return;
  }

  try {
    // Must be called right after the click (user gesture)
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
    await ensureOffscreen();
    await setState({ title: safeName(tab.title || "class"), startedAt: Date.now() });
    chrome.runtime.sendMessage({ target: "offscreen", type: "start", streamId });
    setBadge("REC", "Recording… click to stop and save");
  } catch (e) {
    console.error(e);
    await setState(null);
    setBadge("ERR", "Could not start: " + e.message);
  }
});

// ---------- messages from the tab and the offscreen recorder ----------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target === "offscreen") return;

  if (msg.type === "open-and-download") {
    // "Télécharger" button in Moodle: open the player and remember to download there
    queue(async () => {
      const tab = await chrome.tabs.create({ url: msg.url, active: true, openerTabId: sender.tab?.id });
      const { pending = [] } = await chrome.storage.session.get("pending");
      await chrome.storage.session.set({ pending: [...pending, tab.id] });
    });
  } else if (msg.type === "should-download") {
    // Asked by the player page when it loads
    queue(async () => {
      const { pending = [] } = await chrome.storage.session.get("pending");
      const yes = pending.includes(sender.tab?.id);
      if (yes) {
        await chrome.storage.session.set({ pending: pending.filter((id) => id !== sender.tab.id) });
        setBadge("⬇", "Downloading this séance…");
      }
      sendResponse(yes);
    });
    return true; // answer asynchronously
  } else if (msg.type === "progress") {
    setBadge(`${Math.round(msg.p * 100)}%`, "Joining video and sound…");
  } else if (msg.type === "playback-files") {
    queue(async () => {
      if (msg.url) await download(msg.url, `${safeName(msg.title)}.${msg.url.split(".").pop()}`);
      setBadge("", "Start recording this tab");
    });
  } else if (msg.type === "playback-error") {
    setBadge("ERR", msg.error);
  } else if (msg.type === "recording-saved") {
    queue(async () => {
      const rec = await getState();
      await setState(null);
      setBadge("", "Start recording this tab");
      if (!rec) return;
      await download(msg.url, `BBB/${rec.title} ${stamp(rec.startedAt)}/video.webm`);
    });
  } else if (msg.type === "recording-error") {
    queue(async () => {
      await setState(null);
      setBadge("ERR", "Recording failed: " + msg.error);
    });
  }
});
