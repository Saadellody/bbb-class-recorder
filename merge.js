// Joins the picture of one recording file with the sound of another into a single file,
// without re-encoding (fast, same quality). Used for BBB séances, where the screen share
// (deskshare) and the class audio (webcams) are stored separately.
//
//   mb        - the Mediabunny module
//   videoSrc  - Mediabunny Source for the file that provides the picture
//   audioSrc  - Mediabunny Source for the file that provides the sound
//   writable  - WritableStream that accepts {type:"write", data, position} chunks
//               (e.g. a FileSystemWritableFileStream)
//   onProgress(fraction 0..1)
//   signal    - optional AbortSignal; aborting stops the merge with an AbortError
//
// Returns the file extension of the result ("webm", "mp4" or "mkv").
export async function mergeVideoAndAudio({ mb, videoSrc, audioSrc, writable, onProgress = () => {}, signal }) {
  const videoInput = new mb.Input({ source: videoSrc, formats: mb.ALL_FORMATS });
  const audioInput = new mb.Input({ source: audioSrc, formats: mb.ALL_FORMATS });

  try {
    const vTrack = await videoInput.getPrimaryVideoTrack();
    const aTrack = await audioInput.getPrimaryAudioTrack();
    if (!vTrack) throw new Error("The screen share file has no video");
    if (!aTrack) throw new Error("The webcams file has no sound");

    const vCodec = vTrack.codec;
    const aCodec = aTrack.codec;

    // Pick a container that can hold both codecs as they are
    let format;
    if (["vp8", "vp9", "av1"].includes(vCodec) && ["opus", "vorbis"].includes(aCodec)) {
      format = new mb.WebMOutputFormat();
    } else if (["avc", "hevc", "vp9", "av1"].includes(vCodec) && ["aac", "opus", "mp3"].includes(aCodec)) {
      format = new mb.Mp4OutputFormat({ fastStart: false });
    } else {
      format = new mb.MkvOutputFormat();
    }

    const output = new mb.Output({ format, target: new mb.StreamTarget(writable) });
    const vSource = new mb.EncodedVideoPacketSource(vCodec);
    const aSource = new mb.EncodedAudioPacketSource(aCodec);
    output.addVideoTrack(vSource, { rotation: vTrack.rotation });
    output.addAudioTrack(aSource);
    await output.start();

    const vConfig = await vTrack.getDecoderConfig();
    const aConfig = await aTrack.getDecoderConfig();
    const duration = Math.max(await aTrack.computeDuration(), 1);

    // Add packets from both files in time order so neither track piles up in memory
    const vPackets = new mb.EncodedPacketSink(vTrack).packets();
    const aPackets = new mb.EncodedPacketSink(aTrack).packets();
    let v = await vPackets.next();
    let a = await aPackets.next();
    let vFirst = true;
    let aFirst = true;
    let lastReported = 0;

    while (!v.done || !a.done) {
      signal?.throwIfAborted();
      if (!v.done && (a.done || v.value.timestamp <= a.value.timestamp)) {
        await vSource.add(v.value, vFirst ? { decoderConfig: vConfig } : undefined);
        vFirst = false;
        v = await vPackets.next();
      } else {
        await aSource.add(a.value, aFirst ? { decoderConfig: aConfig } : undefined);
        aFirst = false;
        const p = Math.min(a.value.timestamp / duration, 1);
        if (p - lastReported >= 0.01) {
          lastReported = p;
          onProgress(p);
        }
        a = await aPackets.next();
      }
    }

    vSource.close();
    aSource.close();
    await output.finalize();
    onProgress(1);
    return format.fileExtension.replace(/^\./, "");
  } finally {
    videoInput.dispose?.();
    audioInput.dispose?.();
  }
}
