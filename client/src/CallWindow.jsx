
// client/src/components/CallWindow.jsx
import { useEffect, useRef } from "react";
import { useCall } from "../useCall";

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

  return (
    <div>
      {callStatus === "idle" && (
        <button onClick={() => startCall(targetUserId)}>
          📞 Call {targetName}
        </button>
      )}

      {callStatus === "calling" && <p>Calling {targetName}...</p>}

      {callStatus === "ringing" && (
        <div>
          <p>Incoming call...</p>
          <button onClick={answerCall}>✅ Answer</button>
          <button onClick={endCall}>❌ Decline</button>
        </div>
      )}

      {callStatus === "in-call" && (
        <div>
          <video ref={localVideoRef} autoPlay muted playsInline style={{ width: 150 }} />
          <video ref={remoteVideoRef} autoPlay playsInline style={{ width: 300 }} />
          <button onClick={endCall}>🔴 End Call</button>
        </div>
      )}
    </div>
  );
}