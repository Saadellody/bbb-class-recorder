// Runs on BBB recording pages (/playback/presentation/...).
// Saves the séance as ONE video file (screen share + class sound) when asked: by a click on
// the extension icon, or when the page was opened from a "Télécharger" button in Moodle.
(() => {
  if (globalThis.bbbDownload) return; // already loaded in this page
  let running = false;

  globalThis.bbbDownload = async () => {
    if (running) return;
    running = true;
    try {
      await download();
    } finally {
      running = false;
    }
  };

  // Opened from a "Télécharger" button in Moodle?
  chrome.runtime.sendMessage({ type: "should-download" }, (yes) => {
    void chrome.runtime.lastError;
    if (yes || location.hash.includes("bbb-download")) globalThis.bbbDownload();
  });

  async function download() {
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

      const camPath = await firstExisting(["video/webcams.webm", "video/webcams.mp4"]);
      const deskPath = await firstExisting(["deskshare/deskshare.webm", "deskshare/deskshare.mp4"]);
      if (!camPath) throw new Error("No video/sound file found for this séance");

      // No screen share: the webcams file already has picture + sound together
      if (!deskPath) {
        report({ type: "playback-files", title, url: base + camPath });
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

      report({ type: "playback-files", title, url: null });
    } catch (e) {
      console.error(e);
      report({ type: "playback-error", error: e.message || String(e) });
    }
  }
})();
