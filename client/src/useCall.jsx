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
  const [videoOn, setVideoOn] = useState(true);
  const [remoteVideoOn, setRemoteVideoOn] = useState(true);

  const pcRef = useRef(null);
  const socketRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const remoteUserIdRef = useRef(null);

  useEffect(() => {
    remoteUserIdRef.current = remoteUserId;
  }, [remoteUserId]);

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

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
    } catch (err) {
      console.error("Could not access camera/microphone:", err);
      setCallStatus("idle");
      return;
    }
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

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
    } catch (err) {
      console.error("Could not access camera/microphone:", err);
      if (remoteUserIdRef.current) {
        socket.emit("call:end", { receiverId: remoteUserIdRef.current });
      }
      pc?.close();
      pcRef.current = null;
      setRemoteUserId(null);
      setCallStatus("idle");
      return;
    }
    setLocalStream(stream);
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    for (const candidate of pendingCandidatesRef.current) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("Error adding queued ICE candidate", err);
      }
    }
    pendingCandidatesRef.current = [];

    socket.emit("call:answer", { receiverId: remoteUserIdRef.current, answer });
    setCallStatus("in-call");
  }, []);

  const endCall = useCallback(() => {
    if (remoteUserIdRef.current) {
      socketRef.current?.emit("call:end", { receiverId: remoteUserIdRef.current });
    }
    pcRef.current?.close();
    pcRef.current = null;
    pendingCandidatesRef.current = [];
    localStream?.getTracks().forEach((t) => t.stop());
    setLocalStream(null);
    setRemoteStream(null);
    setRemoteUserId(null);
    setCallStatus("idle");
    setVideoOn(true);
    setRemoteVideoOn(true);
  }, [localStream]);

  // Mutes/unmutes the outgoing video track without renegotiating the
  // connection, and tells the other peer so they can show a
  // "camera off" placeholder instead of a frozen frame.
  const toggleVideo = useCallback(() => {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (!videoTrack) return;
    videoTrack.enabled = !videoTrack.enabled;
    setVideoOn(videoTrack.enabled);

    if (remoteUserIdRef.current) {
      socketRef.current?.emit("call:video-toggle", {
        receiverId: remoteUserIdRef.current,
        videoOn: videoTrack.enabled,
      });
    }
  }, [localStream]);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    socket.on("call:offer", async ({ from, offer }) => {
      if (pcRef.current) {
        socket.emit("call:end", { receiverId: from });
        return;
      }
      setRemoteUserId(from);
      const pc = createPeerConnection(from);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      setCallStatus("ringing");
    });

    socket.on("call:answer", async ({ answer }) => {
      await pcRef.current?.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
      for (const candidate of pendingCandidatesRef.current) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error("Error adding queued ICE candidate", err);
        }
      }
      pendingCandidatesRef.current = [];
      setCallStatus("in-call");
    });

    socket.on("call:ice-candidate", async ({ candidate }) => {
      const pc = pcRef.current;
      if (!pc || !pc.remoteDescription) {
        pendingCandidatesRef.current.push(candidate);
        return;
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("Error adding ICE candidate", err);
      }
    });

    socket.on("call:video-toggle", ({ videoOn: peerVideoOn }) => {
      setRemoteVideoOn(peerVideoOn);
    });

    socket.on("call:end", () => {
      pcRef.current?.close();
      pcRef.current = null;
      pendingCandidatesRef.current = [];
      setLocalStream((prev) => {
        prev?.getTracks().forEach((t) => t.stop());
        return null;
      });
      setRemoteStream(null);
      setRemoteUserId(null);
      setCallStatus("idle");
      setVideoOn(true);
      setRemoteVideoOn(true);
    });

    return () => {
      socket.off("call:offer");
      socket.off("call:answer");
      socket.off("call:ice-candidate");
      socket.off("call:video-toggle");
      socket.off("call:end");
    };
  }, [createPeerConnection]);

  return {
    callStatus,
    remoteUserId,
    localStream,
    remoteStream,
    videoOn,
    remoteVideoOn,
    startCall,
    answerCall,
    endCall,
    toggleVideo,
  };
}