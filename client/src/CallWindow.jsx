// client/src/CallWindow.jsx
import { useEffect, useRef } from "react";
import { useCall } from "./useCall";
import "./CallWindow.css";

const AVATAR_COLORS = ["#4fd1c5", "#ff7a45", "#8a8aff", "#5fd98a", "#e0c341", "#ff6b9d"];

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
    videoOn,
    remoteVideoOn,
    startCall,
    answerCall,
    endCall,
    toggleVideo,
  } = useCall(currentUserId);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
        localVideoRef.current.play().catch((err) => console.error("Local play() failed:", err));
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.play().catch((err) => console.error("Remote play() failed:", err));
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
        <div style={{position:"absolute",top:0,left:0,background:"black",color:"lime",fontSize:"10px",zIndex:999,padding:"4px"}}>local:{localStream ? localStream.getTracks().length : "none"} remote:{remoteStream ? remoteStream.getTracks().length : "none"} | lp:{localVideoRef.current?.paused ? "paused" : "playing"} rp:{remoteVideoRef.current?.paused ? "paused" : "playing"} lrs:{localVideoRef.current?.readyState} rrs:{remoteVideoRef.current?.readyState}</div>
          <video ref={remoteVideoRef} autoPlay playsInline className="call-video-remote" />
          {!remoteVideoOn && (
            <div className="call-video-off-placeholder">
              <span>{targetName}'s camera is off</span>
            </div>
          )}
          <div className="call-video-local-wrap">
            <video ref={localVideoRef} autoPlay muted playsInline className="call-video-local" />
            {!videoOn && (
              <div className="call-video-off-placeholder">
                <span>Camera off</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="call-actions">
        {callStatus === "ringing" && (
          <button className="call-btn accept" onClick={answerCall} title="Answer">
            ✅
          </button>
        )}
        {callStatus === "in-call" && (
          <button
            className={`call-btn ${videoOn ? "video-toggle" : "video-toggle off"}`}
            onClick={toggleVideo}
            title={videoOn ? "Turn camera off" : "Turn camera on"}
          >
            {videoOn ? "📹" : "🚫"}
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