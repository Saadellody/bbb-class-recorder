// Runs on Moodle BigBlueButton activity pages. Adds a "Télécharger" button next to each
// recording's playback link; clicking it opens the player and starts the download there.
(() => {
  const PLAY_LINKS = [
    'a[href*="/playback/presentation/"]',
    'a[href*="bbb_view.php"][href*="action=play"]',
  ].join(",");

  function addButton(link) {
    if (link.dataset.bbbDl) return;
    link.dataset.bbbDl = "1";

    const btn = document.createElement("a");
    btn.href = "#";
    btn.textContent = "⬇ Télécharger";
    btn.title = "Télécharger cette séance (vidéo + son)";
    btn.className = "btn btn-sm btn-primary bbb-dl-btn";
    btn.style.marginLeft = "6px";
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: "open-and-download", url: link.href });
      btn.textContent = "✓ Ouvert";
      setTimeout(() => (btn.textContent = "⬇ Télécharger"), 4000);
    };
    link.after(btn);
  }

  const scan = () => document.querySelectorAll(PLAY_LINKS).forEach(addButton);
  scan();
  // The recordings table is loaded after the page, so keep watching for new links
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
})();
