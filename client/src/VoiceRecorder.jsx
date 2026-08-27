import { useRef, useState } from "react";

// Lightweight voice recorder using the browser's MediaRecorder API.
// Renders a mic button; tap to start recording, tap again to stop.
// Calls onRecorded(fileBlob) with a ready-to-upload File once done.
export default function VoiceRecorder({ onRecorded, onCancel }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const ext = mimeType === "audio/webm" ? "webm" : "m4a";
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: mimeType });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        clearInterval(timerRef.current);
        setRecording(false);
        setSeconds(0);
        onRecorded(file);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      console.error("Mic access failed", err);
      alert("Microphone access is required to record a voice note.");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
  };

  const cancelRecording = () => {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    clearInterval(timerRef.current);
    setRecording(false);
    setSeconds(0);
    chunksRef.current = [];
    onCancel?.();
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (!recording) {
    return (
      <button
        type="button"
        className="voice-record-btn"
        onClick={startRecording}
        title="Record voice reply"
      >
        🎤
      </button>
    );
  }

  return (
    <div className="voice-recording-bar">
      <span className="voice-recording-dot">●</span>
      <span className="voice-recording-time">{formatTime(seconds)}</span>
      <button type="button" onClick={cancelRecording} className="voice-cancel-btn" title="Cancel">
        ✕
      </button>
      <button type="button" onClick={stopRecording} className="voice-stop-btn" title="Send">
        ✓
      </button>
    </div>
  );
}
