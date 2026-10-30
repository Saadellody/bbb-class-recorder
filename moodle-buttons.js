// Runs on Moodle BigBlueButton activity pages. Adds a "Télécharger" button next to each
// recording's playback link; clicking it opens the player and starts the download there.
(() => {
  // Moodle 4 keeps the real address in data-href (href="#"); older versions use href
  const PLAY_LINKS = [
    '[data-href*="bbb_view.php"][data-href*="action=play"]',
    '[data-href*="/playback/"]',
    'a[href*="bbb_view.php"][href*="action=play"]',
    'a[href*="/playback/presentation/"]',
  ].join(",");

  const playUrl = (el) => {
    const raw = el.getAttribute("data-href") || el.getAttribute("href");
    return raw && raw !== "#" ? new URL(raw, location.href).href : null;
  };

  function addButton(link) {
    if (link.dataset.bbbDl || !playUrl(link)) return;
    link.dataset.bbbDl = "1";

    const btn = document.createElement("a");
    btn.href = "#";
    btn.textContent = "⬇ Télécharger";
    btn.title = "Télécharger cette séance (vidéo + son)";
    btn.className = "btn btn-sm btn-primary bbb-dl-btn";
    btn.style.margin = "2px 0 2px 6px";
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: "open-and-download", url: playUrl(link) });
      btn.textContent = "✓ Ouvert";
      setTimeout(() => (btn.textContent = "⬇ Télécharger"), 4000);
    };
    link.after(btn);
  }

  let found = false;
  const scan = () =>
    document.querySelectorAll(PLAY_LINKS).forEach((l) => {
      addButton(l);
      found = true;
    });
  scan();
  // The recordings table is loaded after the page, so keep watching for new links
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });

  setTimeout(() => {
    if (!found) console.info("[BBB Class Recorder] No recording links found on this page yet.");
  }, 8000);
})();
