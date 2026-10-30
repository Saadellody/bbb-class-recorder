// Runs on BBB recording pages (/playback/presentation/...).
// Saves the séance as ONE video file (screen share + class sound) when asked: by a click on
// the extension icon, or when the page was opened from a "Télécharger" button in Moodle.
// A small panel shows the progress and lets you cancel.
(() => {
  if (globalThis.bbbDownload) return; // already loaded in this page
  let controller = null; // AbortController of the running download

  // Icon click: start, or cancel if already running
  globalThis.bbbDownload = async () => {
    if (controller) {
      controller.abort();
      return;
    }
    controller = new AbortController();
    try {
      await download(controller.signal);
    } finally {
      controller = null;
    }
  };

  // Opened from a "Télécharger" button in Moodle?
  chrome.runtime.sendMessage({ type: "should-download" }, (yes) => {
    void chrome.runtime.lastError;
    if (yes || location.hash.includes("bbb-download")) globalThis.bbbDownload();
  });

  // ---------- progress panel ----------

  function createPanel() {
    document.getElementById("bbb-dl-panel")?.remove();
    const host = document.createElement("div");
    host.id = "bbb-dl-panel";
    host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        .box { font: 13px/1.4 system-ui, sans-serif; background:#fff; color:#1d1d1f; width:260px;
               border:1px solid #ccc; border-radius:10px; box-shadow:0 4px 18px rgba(0,0,0,.25); padding:12px; }
        .title { font-weight:600; margin-bottom:6px; }
        .bar { height:8px; background:#e5e5e5; border-radius:4px; overflow:hidden; margin:8px 0; }
        .fill { height:100%; width:0; background:#1a73e8; transition:width .3s; }
        .row { display:flex; justify-content:space-between; align-items:center; gap:8px; }
        button { border:none; border-radius:6px; padding:6px 12px; cursor:pointer; font-weight:600; }
        .cancel { background:#d93025; color:#fff; }
        .close { background:#e5e5e5; color:#1d1d1f; display:none; }
      </style>
      <div class="box">
        <div class="title">⬇ Téléchargement de la séance</div>
        <div class="bar"><div class="fill"></div></div>
        <div class="row">
          <span class="msg">Préparation…</span>
          <button class="cancel">Annuler</button>
          <button class="close">Fermer</button>
        </div>
      </div>`;
    document.documentElement.appendChild(host);

    const $ = (s) => root.querySelector(s);
    return {
      onCancel: (fn) => ($(".cancel").onclick = fn),
      progress(p) {
        $(".fill").style.width = `${Math.round(p * 100)}%`;
        $(".msg").textContent = `${Math.round(p * 100)} %`;
      },
      finish(text, color) {
        $(".msg").textContent = text;
        $(".fill").style.background = color;
        $(".fill").style.width = "100%";
        $(".cancel").style.display = "none";
        $(".close").style.display = "inline-block";
        $(".close").onclick = () => host.remove();
      },
    };
  }

  // ---------- download ----------

  async function download(signal) {
    const report = (msg) => chrome.runtime.sendMessage(msg);
    const panel = createPanel();
    panel.onCancel(() => controller?.abort());

    const pathMatch = location.pathname.match(/\/playback\/presentation\/[\d.]+\/([^/?#.]+)\/?$/);
    const meetingId = pathMatch ? pathMatch[1] : new URLSearchParams(location.search).get("meetingId");
    if (!meetingId) {
      panel.finish("Aucun enregistrement sur cette page", "#d93025");
      report({ type: "playback-error", error: "No recording found on this page" });
      return;
    }
    const base = `${location.origin}/presentation/${meetingId}/`;

    async function exists(path) {
      try {
        const r = await fetch(base + path, { method: "HEAD", credentials: "include", signal });
        if (r.ok) return true;
        if (r.status !== 405) return false;
      } catch (e) {
        if (signal.aborted) throw e;
      }
      try {
        const r = await fetch(base + path, { headers: { Range: "bytes=0-0" }, credentials: "include", signal });
        return r.ok;
      } catch (e) {
        if (signal.aborted) throw e;
        return false;
      }
    }

    async function firstExisting(paths) {
      for (const p of paths) if (await exists(p)) return p;
      return null;
    }

    async function fetchXml(path) {
      try {
        const r = await fetch(base + path, { credentials: "include", signal });
        return r.ok ? new DOMParser().parseFromString(await r.text(), "text/xml") : null;
      } catch (e) {
        if (signal.aborted) throw e;
        return null;
      }
    }

    let dir = null;
    let fileName = null;
    let writable = null;

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

      // No screen share: the webcams file already has picture + sound, Chrome downloads it
      if (!deskPath) {
        report({ type: "playback-files", title, url: base + camPath });
        panel.finish("Lancé dans les téléchargements de Chrome", "#188038");
        return;
      }

      // Screen share + sound -> one file, written to the browser's private storage, then saved
      const [mb, { mergeVideoAndAudio }] = await Promise.all([
        import(chrome.runtime.getURL("vendor/mediabunny.min.mjs")),
        import(chrome.runtime.getURL("merge.js")),
      ]);
      dir = await navigator.storage.getDirectory();
      for await (const n of dir.keys()) if (n.startsWith("bbb-")) await dir.removeEntry(n).catch(() => {});
      fileName = `bbb-${Date.now()}`;
      const handle = await dir.getFileHandle(fileName, { create: true });
      writable = await handle.createWritable();

      const source = (path) => new mb.UrlSource(base + path, { requestInit: { credentials: "include" } });
      const ext = await mergeVideoAndAudio({
        mb,
        videoSrc: source(deskPath),
        audioSrc: source(camPath),
        writable,
        signal,
        onProgress: (p) => {
          panel.progress(p);
          report({ type: "progress", p });
        },
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

      panel.finish("Terminé ✓", "#188038");
      report({ type: "playback-files", title, url: null });
    } catch (e) {
      if (signal.aborted) {
        await writable?.abort().catch(() => {});
        if (fileName) await dir.removeEntry(fileName).catch(() => {});
        panel.finish("Téléchargement annulé", "#999");
        report({ type: "playback-cancelled" });
      } else {
        console.error(e);
        panel.finish("Erreur : " + (e.message || e), "#d93025");
        report({ type: "playback-error", error: e.message || String(e) });
      }
    }
  }
})();
