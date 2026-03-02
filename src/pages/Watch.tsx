import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { MonitorPlay, AlertCircle, Loader2, Maximize, Minimize, Volume2, VolumeX, Plus, Minus } from "lucide-react";
import { Button } from "@/src/components/ui/button";

export default function Watch() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"connecting" | "waiting" | "connected" | "disconnected" | "error">("connecting");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const broadcasterIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!roomId) {
      setStatus("error");
      return;
    }

    const socket = io();
    socketRef.current = socket;

    const createPeerConnection = () => {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }

      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });
      peerConnectionRef.current = peerConnection;

      peerConnection.ontrack = (event) => {
        if (videoRef.current) {
          videoRef.current.srcObject = event.streams[0];
          setStatus("connected");
        }
      };

      peerConnection.onicecandidate = (event) => {
        if (event.candidate && broadcasterIdRef.current) {
          socket.emit("ice-candidate", roomId, broadcasterIdRef.current, event.candidate);
        }
      };

      return peerConnection;
    };

    createPeerConnection();

    socket.on("connect", () => {
      setStatus("waiting");
      socket.emit("join-room", roomId, "viewer");
    });

    socket.on("broadcaster-joined", () => {
      setStatus("waiting");
      createPeerConnection();
      socket.emit("join-room", roomId, "viewer");
    });

    socket.on("offer", async (broadcasterId: string, offer: RTCSessionDescriptionInit) => {
      try {
        const pc = peerConnectionRef.current;
        if (!pc) return;
        broadcasterIdRef.current = broadcasterId;
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("answer", roomId, broadcasterId, answer);
      } catch (error) {
        console.error("Error handling offer:", error);
        setStatus("error");
      }
    });

    socket.on("ice-candidate", async (broadcasterId: string, candidate: RTCIceCandidateInit) => {
      try {
        const pc = peerConnectionRef.current;
        if (pc) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (error) {
        console.error("Error adding ice candidate:", error);
      }
    });

    socket.on("peer-disconnected", () => {
      setStatus("disconnected");
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    });

    return () => {
      socket.disconnect();
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, [roomId]);

  const handleMouseEvent = (type: string, e: React.MouseEvent<HTMLVideoElement>) => {
    if (status !== "connected" || !socketRef.current || !broadcasterIdRef.current || !videoRef.current) return;

    const rect = videoRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left);
    const y = (e.clientY - rect.top);
    // Calculate normalized coordinates if needed, or pass absolute pixel values relative to the video element.
    // The server expects absolute coordinates, but usually based on the screen resolution.
    // Here we will pass the normalized coordinates and let the receiver handle scaling, 
    // OR we can try to pass what we have.
    // However, the provided JSON format example shows "absolute: true" and large integers (1920, 1080).
    // This implies the receiver expects screen coordinates.
    // Since we don't know the broadcaster's screen resolution, we should probably send normalized coordinates
    // and let the broadcaster scale them.
    // BUT, the new format asks for "x", "y", "absolute".
    // Let's send normalized coordinates (0-1) and let Home.tsx handle the conversion if it knows the screen size,
    // OR we can just send the normalized values and let the local service handle it if it supports it.
    // Given the prompt says "1920, 1080", let's assume we need to send normalized values 
    // and the Home.tsx will have to figure out how to scale it, 
    // OR we send normalized and the local agent scales it.
    
    // Let's stick to sending normalized coordinates from here as we did before, 
    // but mapped to the new structure in Home.tsx.
    // Wait, the user provided a specific JSON format for the *service*.
    // We are in Watch.tsx (Viewer). We should send a generic event to Home.tsx (Broadcaster),
    // and Home.tsx should transform it to the specific JSON format.
    // So we can keep sending the same data from here, or slightly improve it.

    const normalizedX = x / rect.width;
    const normalizedY = y / rect.height;

    const event = {
      type,
      x: normalizedX,
      y: normalizedY,
      button: e.button,
    };

    socketRef.current.emit("control-event", roomId, broadcasterIdRef.current, event);
  };

  const handleKeyEvent = (type: string, e: React.KeyboardEvent<HTMLDivElement>) => {
    if (status !== "connected" || !socketRef.current || !broadcasterIdRef.current) return;

    const event = {
      type,
      key: e.key,
      code: e.code,
    };

    socketRef.current.emit("control-event", roomId, broadcasterIdRef.current, event);
  };

  const handleWheelEvent = (e: React.WheelEvent<HTMLVideoElement>) => {
    if (status !== "connected" || !socketRef.current || !broadcasterIdRef.current) return;
    // e.preventDefault(); // Passive event listeners cannot prevent default, but let's try just sending
    const event = {
      type: "wheel",
      deltaY: e.deltaY,
    };
    socketRef.current.emit("control-event", roomId, broadcasterIdRef.current, event);
  };

  const handlePasteEvent = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (status !== "connected" || !socketRef.current || !broadcasterIdRef.current) return;
    const text = e.clipboardData.getData("text");
    if (text) {
      const event = {
        type: "text",
        text: text,
      };
      socketRef.current.emit("control-event", roomId, broadcasterIdRef.current, event);
    }
  };

  const sendVolumeCommand = (mode: "up" | "down" | "mute") => {
    if (status !== "connected" || !socketRef.current || !broadcasterIdRef.current) return;
    const event = {
      type: "volume",
      mode: mode,
    };
    socketRef.current.emit("control-event", roomId, broadcasterIdRef.current, event);
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  return (
    <div 
      className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4"
      onKeyDown={(e) => handleKeyEvent("keydown", e)}
      onKeyUp={(e) => handleKeyEvent("keyup", e)}
      onPaste={(e) => handlePasteEvent(e)}
      tabIndex={0}
    >
      <div className="w-full max-w-5xl bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-800 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-500/10 text-indigo-400 rounded-xl flex items-center justify-center">
              <MonitorPlay className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-medium text-zinc-100">Live Stream</h1>
              <p className="text-xs text-zinc-500 font-mono">{roomId}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Windowed Mode Controls */}
            <div className="hidden md:flex items-center gap-1 bg-zinc-800/50 p-1 rounded-lg border border-zinc-700/50">
              <button
                onClick={toggleMute}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-md transition-colors"
                title={isMuted ? "Unmute Local Audio" : "Mute Local Audio"}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <div className="w-px h-4 bg-zinc-700 mx-1" />
              <button
                onClick={() => sendVolumeCommand("down")}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-md transition-colors"
                title="Remote Volume Down"
              >
                <Minus className="w-4 h-4" />
              </button>
              <button
                onClick={() => sendVolumeCommand("up")}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-md transition-colors"
                title="Remote Volume Up"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={toggleFullScreen}
              className="hidden md:flex p-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg border border-zinc-700/50 transition-colors"
              title="Enter Fullscreen"
            >
              <Maximize className="w-4 h-4" />
            </button>

            <div className="w-px h-6 bg-zinc-800 mx-1" />

            <Button variant="outline" size="sm" onClick={() => navigate("/")} className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white">
              Leave
            </Button>
          </div>
        </div>

        <div 
          ref={containerRef}
          className="relative aspect-video bg-black flex items-center justify-center group"
        >
          {status === "connecting" && (
            <div className="flex flex-col items-center gap-3 text-zinc-400">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <p>Connecting to server...</p>
            </div>
          )}
          
          {status === "waiting" && (
            <div className="flex flex-col items-center gap-3 text-zinc-400">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <p>Waiting for broadcaster to start sharing...</p>
            </div>
          )}

          {status === "disconnected" && (
            <div className="flex flex-col items-center gap-3 text-zinc-400">
              <AlertCircle className="w-8 h-8 text-red-500" />
              <p>Broadcaster disconnected.</p>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center gap-3 text-zinc-400">
              <AlertCircle className="w-8 h-8 text-red-500" />
              <p>An error occurred.</p>
            </div>
          )}

          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            controls={false}
            className={`w-full h-full object-contain ${status === "connected" ? "block" : "hidden"}`}
            onLoadedMetadata={() => {
              if (videoRef.current) {
                videoRef.current.play().catch(e => console.error("Error playing video:", e));
              }
            }}
            onMouseMove={(e) => handleMouseEvent("mousemove", e)}
            onMouseDown={(e) => handleMouseEvent("mousedown", e)}
            onMouseUp={(e) => handleMouseEvent("mouseup", e)}
            onClick={(e) => handleMouseEvent("click", e)}
            onContextMenu={(e) => {
              e.preventDefault();
              handleMouseEvent("contextmenu", e);
            }}
            onWheel={handleWheelEvent}
          />
          
          {status === "connected" && (
             <>
               <div className="absolute bottom-4 left-4 flex items-center gap-2 z-10 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity md:hidden">
                 <button
                   onClick={(e) => {
                     e.stopPropagation();
                     toggleMute();
                   }}
                   className="p-2 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors"
                   title={isMuted ? "Unmute Local Audio" : "Mute Local Audio"}
                 >
                   {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                 </button>
                 
                 <div className="h-6 w-px bg-white/20 mx-1" />

                 <button
                   onClick={(e) => {
                     e.stopPropagation();
                     sendVolumeCommand("down");
                   }}
                   className="p-2 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors"
                   title="Remote Volume Down"
                 >
                   <Minus className="w-5 h-5" />
                 </button>
                 <button
                   onClick={(e) => {
                     e.stopPropagation();
                     sendVolumeCommand("up");
                   }}
                   className="p-2 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors"
                   title="Remote Volume Up"
                 >
                   <Plus className="w-5 h-5" />
                 </button>
               </div>

               <button
                 onClick={(e) => {
                   e.stopPropagation();
                   toggleFullScreen();
                 }}
                 className="absolute bottom-4 right-4 p-2 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors z-10 opacity-0 group-hover:opacity-100 focus:opacity-100 md:hidden"
                 title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
               >
                 {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
               </button>
             </>
           )}
        </div>
      </div>
    </div>
  );
}
