// Injected into a BBB recording page (/playback/presentation/...) when the icon is clicked.
// Finds the séance's raw files and chat, and asks the background to download them.
(async () => {
  const pathMatch = location.pathname.match(/\/playback\/presentation\/[\d.]+\/([^/?#.]+)$/);
  const meetingId = pathMatch ? pathMatch[1] : new URLSearchParams(location.search).get("meetingId");
  if (!meetingId) {
    chrome.runtime.sendMessage({ type: "playback-error", error: "No recording found on this page" });
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

  async function fetchXml(path) {
    try {
      const r = await fetch(base + path, { credentials: "include" });
      return r.ok ? new DOMParser().parseFromString(await r.text(), "text/xml") : null;
    } catch {
      return null;
    }
  }

  const stripHtml = (s) => new DOMParser().parseFromString(s, "text/html").body.textContent || "";

  // Title: "<date> <class name>"
  const meta = await fetchXml("metadata.xml");
  const name =
    meta?.querySelector("meta > meetingName")?.textContent ||
    meta?.querySelector("meta > name")?.textContent ||
    meta?.querySelector("meeting")?.getAttribute("name") ||
    document.title ||
    meetingId;
  const start = Number(meta?.querySelector("start_time")?.textContent);
  const title = (start ? new Date(start).toISOString().slice(0, 10) + " " : "") + name;

  // Video files (webcams.* holds all the class audio)
  const files = [];
  for (const group of [
    ["video/webcams.webm", "video/webcams.mp4"],
    ["deskshare/deskshare.webm", "deskshare/deskshare.mp4"],
  ]) {
    for (const p of group) {
      if (await exists(p)) {
        files.push(base + p);
        break;
      }
    }
  }

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

  chrome.runtime.sendMessage({ type: "playback-files", title, files, chat });
})();
