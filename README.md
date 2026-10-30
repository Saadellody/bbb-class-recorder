# BBB Class Recorder

One click on the extension icon saves the séance you are watching, with its chat.

## Install (once)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder (the one that contains `manifest.json`).
4. Pin the extension (puzzle icon → pin) so its button is always visible.

## Download a séance that is already saved

1. Log in, open the course's BigBlueButton page and click **Lecture** on the séance you want.
2. When the player opens, click the extension icon and **keep the tab open** while the badge
   counts up to 100%.
3. You get **one video file** (screen share + class sound) in `Downloads`, named
   `<date> <séance name>.webm`. It joins the original files without re-encoding, so it takes
   about as long as a normal download, not the length of the class.

## Record a live class

1. Join the class and open the **public chat** panel. Only messages that appear in it are saved.
2. Click the extension icon. A red **REC** badge appears. You still hear the class normally.
3. Click the icon again at the end. The files go to `Downloads\BBB\<class name> <date time>\`.
   Closing the tab also stops and saves the recording.

## What you get

| File | Content |
|---|---|
| `<name>.webm` (saved séance) or `video.webm` (live) | Video + class sound in one file |
| `<name>.srt` / `chat.srt` | Chat as subtitles. VLC shows them automatically for the saved séance |
| `<name> - chat.txt` / `chat.txt` | Chat with timestamps |

If the teacher used slides and no screen share, the video shows the webcam (or a blank
picture if the webcam was off). The sound is always complete.

## Live recordings: fix seeking (optional)

Browser recordings sometimes can't be fast-forwarded. To fix that and put the chat inside:

1. Install ffmpeg once: `winget install Gyan.FFmpeg`, then reopen the terminal.
2. Run `powershell -ExecutionPolicy Bypass -File merge.ps1`

Each folder in `Downloads\BBB` gets a `.mkv` with the video, the sound and the chat as a
subtitle track.

## Credits

Joins video and sound with [Mediabunny](https://github.com/Vanilagy/mediabunny)
(MPL-2.0, see `vendor/mediabunny-LICENSE.txt`).

## If something goes wrong

Hover over the extension icon: when the badge shows **ERR**, the tooltip says why.
