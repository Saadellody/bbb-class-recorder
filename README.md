# BBB Class Recorder

One click on the extension icon saves the séance you are watching as one video file.

## Install (once)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder (the one that contains `manifest.json`).
4. Pin the extension (puzzle icon → pin) so its button is always visible.

## Download a séance that is already saved

1. Log in and open the course's BigBlueButton page. Each recording now has a
   **⬇ Télécharger** button next to its playback link: click it.
   (Or open the séance with **Lecture** and click the extension icon.)
2. The player opens in a new tab and the download starts by itself. **Keep that tab open**
   while the badge on the icon counts up to 100%.
3. You get **one video file** (screen share + class sound) in `Downloads`, named
   `<date> <séance name>.webm`. It joins the original files without re-encoding, so it takes
   about as long as a normal download, not the length of the class.

## Record a live class

1. Join the class, then click the extension icon. A red **REC** badge appears. You still hear
   the class normally.
2. Click the icon again at the end. The video goes to
   `Downloads\BBB\<class name> <date time>\video.webm`.
   Closing the tab also stops and saves the recording.

If the teacher used slides and no screen share, the video of a saved séance shows the webcam
(or a blank picture if the webcam was off). The sound is always complete.

## Live recordings: fix seeking (optional)

Browser recordings sometimes can't be fast-forwarded. To fix that:

1. Install ffmpeg once: `winget install Gyan.FFmpeg`, then reopen the terminal.
2. Run `powershell -ExecutionPolicy Bypass -File merge.ps1`

Each folder in `Downloads\BBB` gets a `.mkv` copy that you can fast-forward.

## Credits

Joins video and sound with [Mediabunny](https://github.com/Vanilagy/mediabunny)
(MPL-2.0, see `vendor/mediabunny-LICENSE.txt`).

## If something goes wrong

Hover over the extension icon: when the badge shows **ERR**, the tooltip says why.
