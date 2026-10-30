# BBB Class Recorder

One click on the extension icon saves the séance you are watching, with its chat.

## Install (once)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder (the one that contains `manifest.json`).
4. Pin the extension (puzzle icon → pin) so its button is always visible.

## Download a séance that is already saved

1. Log in, open the course's BigBlueButton page and click **Lecture** on the séance you want.
2. When the player opens, click the extension icon.
3. The files go to `Downloads\BBB\<date> <séance name>\`. It downloads the original files,
   so it takes about as long as a normal download, not the length of the class.

## Record a live class

1. Join the class and open the **public chat** panel. Only messages that appear in it are saved.
2. Click the extension icon. A red **REC** badge appears. You still hear the class normally.
3. Click the icon again at the end. The files go to `Downloads\BBB\<class name> <date time>\`.
   Closing the tab also stops and saves the recording.

## What you get

| File | Content |
|---|---|
| `webcams.webm` / `video.webm` | Class audio + video |
| `deskshare.webm` | Teacher's screen share (saved séances only) |
| `chat.txt` | Chat with timestamps |
| `chat.srt` | Chat as subtitles |

## Make one video with the chat inside (optional)

1. Install ffmpeg once: `winget install Gyan.FFmpeg`, then reopen the terminal.
2. Run `powershell -ExecutionPolicy Bypass -File merge.ps1`

Each folder gets a `.mkv` with the video, the sound and the chat as a subtitle track (turn
subtitles on in VLC). It also fixes seeking in live recordings.

## If something goes wrong

Hover over the extension icon: when the badge shows **ERR**, the tooltip says why.
