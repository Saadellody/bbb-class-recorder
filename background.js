// Click the toolbar icon to start recording the current tab, click again to stop.
// The video is recorded in an offscreen document; the chat is captured by chat-recorder.js
// in the tab and kept here (in session storage, so it survives the service worker sleeping).

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

function fmt(sec, srt) {
  const t = Math.floor(sec);
  const hms = [Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
  return srt ? `${hms},${String(Math.round((sec % 1) * 1000)).padStart(3, "0")}` : hms;
}

function chatToTxt(chat) {
  return chat.map((m) => `[${fmt(m.t)}] ${m.name ? m.name + ": " : ""}${m.text}`).join("\r\n") + "\r\n";
}

function chatToSrt(chat) {
  return chat
    .map((m, i) => {
      const next = chat[i + 1]?.t ?? Infinity;
      const end = Math.min(m.t + 6, Math.max(next, m.t + 2));
      return `${i + 1}\r\n${fmt(m.t, true)} --> ${fmt(end, true)}\r\n${m.name ? m.name + ": " : ""}${m.text}\r\n`;
    })
    .join("\r\n");
}

function download(url, filename) {
  return chrome.downloads.download({ url, filename, conflictAction: "uniquify", saveAs: false });
}

function downloadText(text, filename) {
  return download("data:text/plain;charset=utf-8," + encodeURIComponent(text), filename);
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
    chrome.scripting
      .executeScript({ target: { tabId: tab.id }, files: ["playback-download.js"] })
      .catch((e) => setBadge("ERR", "Could not read this page: " + e.message));
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
    await setState({
      tabId: tab.id,
      title: safeName(tab.title || "class"),
      startedAt: Date.now(),
      chat: [],
    });
    chrome.runtime.sendMessage({ target: "offscreen", type: "start", streamId });
    await chrome.scripting
      .executeScript({ target: { tabId: tab.id }, files: ["chat-recorder.js"] })
      .catch((e) => console.warn("Chat capture unavailable on this page:", e.message));
    setBadge("REC", "Recording… click to stop and save");
  } catch (e) {
    console.error(e);
    await setState(null);
    setBadge("ERR", "Could not start: " + e.message);
  }
});

// ---------- messages from the tab and the offscreen recorder ----------

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.target === "offscreen") return;

  if (msg.type === "chat") {
    queue(async () => {
      const rec = await getState();
      if (!rec || sender.tab?.id !== rec.tabId) return;
      rec.chat.push({ t: Math.max(0, (Date.now() - rec.startedAt) / 1000), name: msg.name, text: msg.text });
      await setState(rec);
    });
  } else if (msg.type === "playback-files") {
    queue(async () => {
      const folder = `BBB/${safeName(msg.title)}`;
      for (const url of msg.files) await download(url, `${folder}/${url.split("/").pop()}`);
      if (msg.chat.length) {
        await downloadText(chatToSrt(msg.chat), `${folder}/chat.srt`);
        await downloadText(chatToTxt(msg.chat), `${folder}/chat.txt`);
      }
      setBadge(
        msg.files.length ? "" : "ERR",
        msg.files.length ? "Start recording this tab" : "No video files found for this séance"
      );
    });
  } else if (msg.type === "playback-error") {
    setBadge("ERR", msg.error);
  } else if (msg.type === "recording-saved") {
    queue(async () => {
      const rec = await getState();
      await setState(null);
      setBadge("", "Start recording this tab");
      if (!rec) return;

      const folder = `BBB/${rec.title} ${stamp(rec.startedAt)}`;
      await download(msg.url, `${folder}/video.webm`);
      if (rec.chat.length) {
        await downloadText(chatToSrt(rec.chat), `${folder}/chat.srt`);
        await downloadText(chatToTxt(rec.chat), `${folder}/chat.txt`);
      }
      chrome.tabs.sendMessage(rec.tabId, { type: "chat-stop" }).catch(() => {});
    });
  } else if (msg.type === "recording-error") {
    queue(async () => {
      await setState(null);
      setBadge("ERR", "Recording failed: " + msg.error);
    });
  }
});
