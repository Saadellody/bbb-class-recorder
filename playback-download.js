// Injected into a BBB recording page (/playback/presentation/...) when the icon is clicked.
// Saves the séance as ONE video file (screen share + class sound) plus its chat.
(async () => {
  const report = (msg) => chrome.runtime.sendMessage(msg);

  const pathMatch = location.pathname.match(/\/playback\/presentation\/[\d.]+\/([^/?#.]+)$/);
  const meetingId = pathMatch ? pathMatch[1] : new URLSearchParams(location.search).get("meetingId");
  if (!meetingId) {
    report({ type: "playback-error", error: "No recording found on this page" });
    return;
  }
  const base = `${location.origin}/presentation/${meetingId}/`;

  async function exists(path) {
    try {
      const r = await fetch(base + path, { method: "HEAD", credentials: "include" });
      if (r.ok) return true;
      if (r.status !== 405) return false;
    } catch { /* fall through to range request */ }
    try {
      const r = await fetch(base + path, { headers: { Range: "bytes=0-0" }, credentials: "include" });
      return r.ok;
    } catch {
      return false;
    }
  }

  async function firstExisting(paths) {
    for (const p of paths) if (await exists(p)) return p;
    return null;
  }

  async function fetchXml(path) {
    try {
      const r = await fetch(base + path, { credentials: "include" });
      return r.ok ? new DOMParser().parseFromString(await r.text(), "text/xml") : null;
    } catch {
      return null;
    }
  }

  const stripHtml = (s) => new DOMParser().parseFromString(s, "text/html").body.textContent || "";

  try {
    // Title: "<date> <séance name>"
    const meta = await fetchXml("metadata.xml");
    const name =
      meta?.querySelector("meta > meetingName")?.textContent ||
      meta?.querySelector("meta > name")?.textContent ||
      meta?.querySelector("meeting")?.getAttribute("name") ||
      document.title ||
      meetingId;
    const start = Number(meta?.querySelector("start_time")?.textContent);
    const title = (start ? new Date(start).toISOString().slice(0, 10) + " " : "") + name;

    // Chat: <chattimeline in="secs" name="..." message="..."/> in slides_new.xml
    const slides = await fetchXml("slides_new.xml");
    const chat = [...(slides?.querySelectorAll("chattimeline") || [])]
      .map((el) => ({
        t: parseFloat(el.getAttribute("in")) || 0,
        name: el.getAttribute("name") || "",
        text: stripHtml(el.getAttribute("message") || "").trim(),
      }))
      .filter((m) => m.text)
      .sort((a, b) => a.t - b.t);

    const camPath = await firstExisting(["video/webcams.webm", "video/webcams.mp4"]);
    const deskPath = await firstExisting(["deskshare/deskshare.webm", "deskshare/deskshare.mp4"]);
    if (!camPath) throw new Error("No video/sound file found for this séance");

    // No screen share: the webcams file already has picture + sound together
    if (!deskPath) {
      report({ type: "playback-files", title, url: base + camPath, chat });
      return;
    }

    // Screen share + sound -> one file, written to the browser's private storage, then saved
    const [mb, { mergeVideoAndAudio }] = await Promise.all([
      import(chrome.runtime.getURL("vendor/mediabunny.min.mjs")),
      import(chrome.runtime.getURL("merge.js")),
    ]);
    const dir = await navigator.storage.getDirectory();
    for await (const n of dir.keys()) if (n.startsWith("bbb-")) await dir.removeEntry(n).catch(() => {});
    const handle = await dir.getFileHandle(`bbb-${Date.now()}`, { create: true });
    const writable = await handle.createWritable();

    const source = (path) => new mb.UrlSource(base + path, { requestInit: { credentials: "include" } });
    const ext = await mergeVideoAndAudio({
      mb,
      videoSrc: source(deskPath),
      audioSrc: source(camPath),
      writable,
      onProgress: (p) => report({ type: "progress", p }),
    });
    await writable.close().catch(() => {}); // may already be closed by the muxer

    const url = URL.createObjectURL(await handle.getFile());
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);

    report({ type: "playback-files", title, url: null, chat });
  } catch (e) {
    console.error(e);
    report({ type: "playback-error", error: e.message || String(e) });
  }
})();
