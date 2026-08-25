// client/src/useCall.jsx
import { useState, useRef, useCallback, useEffect } from "react";
import { getSocket } from "./socket";

const ICE_SERVERS = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export function useCall(currentUserId) {
  const [callStatus, setCallStatus] = useState("idle"); // idle | calling | ringing | in-call
  const [remoteUserId, setRemoteUserId] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  const pcRef = useRef(null);
  const socketRef = useRef(null);

  const createPeerConnection = useCallback((targetUserId) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit("call:ice-candidate", {
          receiverId: targetUserId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };

    pcRef.current = pc;
    return pc;
  }, []);

  const startCall = useCallback(async (targetUserId) => {
    const socket = getSocket();
    socketRef.current = socket;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    setLocalStream(stream);

    const pc = createPeerConnection(targetUserId);
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    setRemoteUserId(targetUserId);
    setCallStatus("calling");

    socket.emit("call:offer", { receiverId: targetUserId, offer });
  }, [createPeerConnection]);

  const answerCall = useCallback(async () => {
    const socket = socketRef.current;
    const pc = pcRef.current;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    setLocalStream(stream);
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit("call:answer", { receiverId: remoteUserId, answer });
    setCallStatus("in-call");
  }, [remoteUserId]);

  const endCall = useCallback(() => {
    if (remoteUserId) {
      socketRef.current?.emit("call:end", { receiverId: remoteUserId });
    }
    pcRef.current?.close();
    pcRef.current = null;
    localStream?.getTracks().forEach((t) => t.stop());
    setLocalStream(null);
    setRemoteStream(null);
    setRemoteUserId(null);
    setCallStatus("idle");
  }, [remoteUserId, localStream]);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    socket.on("call:offer", async ({ from, offer }) => {
      setRemoteUserId(from);
      const pc = createPeerConnection(from);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      setCallStatus("ringing");
    });

    socket.on("call:answer", async ({ answer }) => {
      await pcRef.current?.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
      setCallStatus("in-call");
    });

    socket.on("call:ice-candidate", async ({ candidate }) => {
      try {
        await pcRef.current?.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("Error adding ICE candidate", err);
      }
    });

    socket.on("call:end", () => {
      pcRef.current?.close();
      pcRef.current = null;
      localStream?.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
      setRemoteStream(null);
      setRemoteUserId(null);
      setCallStatus("idle");
    });

    return () => {
      socket.off("call:offer");
      socket.off("call:answer");
      socket.off("call:ice-candidate");
      socket.off("call:end");
    };
  }, [createPeerConnection, localStream]);

  return {
    callStatus,
    remoteUserId,
    localStream,
    remoteStream,
    startCall,
    answerCall,
    endCall,
  };
}
