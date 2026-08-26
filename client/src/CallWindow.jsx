// client/src/CallWindow.jsx
import { useEffect, useRef } from "react";
import { useCall } from "./useCall";
import "./CallWindow.css";

const AVATAR_COLORS = ["#d4af37", "#c9a961", "#b8935a", "#e0c068", "#a68a52", "#cbb26a"];

function avatarColor(username) {
  let hash = 0;
  for (const ch of username || "?") hash = ch.charCodeAt(0) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initial(username) {
  return (username || "?").charAt(0).toUpperCase();
}

export default function CallWindow({ currentUserId, targetUserId, targetName }) {
  const {
    callStatus,
    localStream,
    remoteStream,
    startCall,
    answerCall,
    endCall,
  } = useCall(currentUserId);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  if (callStatus === "idle") {
    return (
      <button
        className="call-trigger-btn"
        onClick={() => startCall(targetUserId)}
        title={`Call ${targetName}`}
      >
        📞
      </button>
    );
  }

  return (
    <div className="call-overlay">
      {callStatus !== "in-call" && (
        <>
          <div className="call-avatar-ring" style={{ background: avatarColor(targetName) }}>
            {initial(targetName)}
          </div>
          <h2 className="call-overlay-name">{targetName}</h2>
          <p className="call-overlay-status">
            {callStatus === "calling" ? "Calling…" : "Incoming call"}
          </p>
        </>
      )}

      {callStatus === "in-call" && (
        <div className="call-video-stage">
          <video ref={remoteVideoRef} autoPlay playsInline className="call-video-remote" />
          <video ref={localVideoRef} autoPlay muted playsInline className="call-video-local" />
        </div>
      )}

      <div className="call-actions">
        {callStatus === "ringing" && (
          <button className="call-btn accept" onClick={answerCall} title="Answer">
            ✅
          </button>
        )}
        <button
          className={`call-btn ${callStatus === "ringing" ? "decline" : "hangup"}`}
          onClick={endCall}
          title={callStatus === "ringing" ? "Decline" : "End call"}
        >
          {callStatus === "ringing" ? "❌" : "🔴"}
        </button>
      </div>
    </div>
  );
}