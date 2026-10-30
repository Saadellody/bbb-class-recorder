// Records the captured tab with MediaRecorder. Chunks are written straight to disk
// (the extension's private storage), so a 2-hour class doesn't fill up memory.

let recorder = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== "offscreen") return;
  if (msg.type === "start") start(msg.streamId).catch(fail);
  else if (msg.type === "stop" && recorder?.state === "recording") recorder.stop();
});

function fail(e) {
  console.error(e);
  recorder = null;
  chrome.runtime.sendMessage({ type: "recording-error", error: e.message || String(e) });
}

async function start(streamId) {
  const tab = { chromeMediaSource: "tab", chromeMediaSourceId: streamId };
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: tab },
    video: { mandatory: { ...tab, maxWidth: 1920, maxHeight: 1080, maxFrameRate: 30 } },
  });

  // Capturing mutes the tab, so play the sound back to keep hearing the class
  const audioCtx = new AudioContext();
  audioCtx.createMediaStreamSource(stream).connect(audioCtx.destination);

  // Remove files from previous recordings (already handed to Downloads)
  const dir = await navigator.storage.getDirectory();
  for await (const name of dir.keys()) await dir.removeEntry(name).catch(() => {});
  const fileHandle = await dir.getFileHandle(`rec-${Date.now()}.webm`, { create: true });
  const writable = await fileHandle.createWritable();
  let writes = Promise.resolve();

  const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((t) =>
    MediaRecorder.isTypeSupported(t)
  );
  recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_500_000 });

  recorder.ondataavailable = (e) => {
    if (e.data.size) writes = writes.then(() => writable.write(e.data));
  };
  recorder.onstop = async () => {
    try {
      await writes;
      await writable.close();
      stream.getTracks().forEach((t) => t.stop());
      audioCtx.close();
      const file = await fileHandle.getFile();
      chrome.runtime.sendMessage({ type: "recording-saved", url: URL.createObjectURL(file) });
    } catch (e) {
      fail(e);
    }
    recorder = null;
  };

  // Tab closed or navigated away: stop and save what we have
  stream.getVideoTracks()[0].onended = () => recorder?.state === "recording" && recorder.stop();

  recorder.start(5000); // write a chunk every 5 s
}
