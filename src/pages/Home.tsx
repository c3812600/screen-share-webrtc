import React, { useState, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { io, Socket } from "socket.io-client";
import { Button } from "@/src/components/ui/button";
import { Monitor, Copy, Check, StopCircle } from "lucide-react";
import { cn } from "@/src/lib/utils";

export default function Home() {
  const [isSharing, setIsSharing] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [allowControl, setAllowControl] = useState(false);
  const [lanIp, setLanIp] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionsRef = useRef<{ [key: string]: RTCPeerConnection }>({});

  const startSharing = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920, max: 3840 },
          height: { ideal: 1080, max: 2160 },
          frameRate: { ideal: 30, max: 60 },
        },
        audio: true,
      });

      // Optimize for detail/text clarity (good for coding/docs)
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && "contentHint" in videoTrack) {
        videoTrack.contentHint = "detail";
      }
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const newRoomId = uuidv4();
      setRoomId(newRoomId);
      setIsSharing(true);

      // Connect to signaling server
      const socket = io();
      socketRef.current = socket;

      socket.emit("join-room", newRoomId, "broadcaster");

      socket.on("viewer-joined", async (viewerId: string) => {
        console.log("Viewer joined:", viewerId);
        if (peerConnectionsRef.current[viewerId]) {
          peerConnectionsRef.current[viewerId].close();
        }

        const peerConnection = new RTCPeerConnection({
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
          ],
        });

        peerConnectionsRef.current[viewerId] = peerConnection;

        // Add local stream tracks to the peer connection
        stream.getTracks().forEach((track) => {
          const sender = peerConnection.addTrack(track, stream);
          if (track.kind === "video") {
            const params = sender.getParameters();
            if (!params.encodings) {
              params.encodings = [{}];
            }
            // Set max bitrate to 6 Mbps for high quality screen sharing
            params.encodings[0].maxBitrate = 6000000; 
            sender.setParameters(params).catch((e) => console.error("Error setting bitrate:", e));
          }
        });

        peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit("ice-candidate", newRoomId, viewerId, event.candidate);
          }
        };

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit("offer", newRoomId, viewerId, offer);
      });

      socket.on("answer", async (viewerId: string, answer: RTCSessionDescriptionInit) => {
        const peerConnection = peerConnectionsRef.current[viewerId];
        if (peerConnection) {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        }
      });

      socket.on("ice-candidate", async (viewerId: string, candidate: RTCIceCandidateInit) => {
        const peerConnection = peerConnectionsRef.current[viewerId];
        if (peerConnection) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
      });

      socket.on("control-event", (viewerId: string, event: any) => {
        if (!allowControl) return;
        
        console.log("Received control event from viewer:", event);
        
        // Transform the event into the format required by the local service
        let payload = null;

        // Helper to map JS button codes to service strings
        const getButtonName = (btn: number) => {
          switch (btn) {
            case 0: return "left";
            case 1: return "middle";
            case 2: return "right";
            default: return "left";
          }
        };

        if (event.type === "mousemove") {
            // We received normalized coordinates (0-1). 
            // We need to convert them to absolute screen coordinates.
            // Since we don't know the exact screen resolution easily in the browser *accurately* for the shared screen
            // (window.screen.width/height might differ from the shared screen if multi-monitor),
            // we will make a best effort guess using window.screen.
            // Ideally, the user should configure this or the agent handles normalized coords.
            // Assuming the agent expects absolute coordinates as per the example (1920, 1080).
            const screenX = Math.round(event.x * window.screen.width);
            const screenY = Math.round(event.y * window.screen.height);

            payload = {
              action: "input_control",
              type: "mouse_move",
              x: screenX,
              y: screenY,
              absolute: true
            };
        } else if (event.type === "mousedown" || event.type === "mouseup" || event.type === "click" || event.type === "contextmenu") {
           const btn = event.type === "contextmenu" ? "right" : getButtonName(event.button);
           
           if (event.type === "mousedown") {
             payload = {
               action: "input_control",
               type: "mouse_down",
               button: btn
             };
           } else if (event.type === "mouseup") {
             payload = {
               action: "input_control",
               type: "mouse_up",
               button: btn
             };
           } else if (event.type === "click" || event.type === "contextmenu") {
             payload = {
               action: "input_control",
               type: "mouse_click",
               button: btn,
               double: false
             };
           }
        } else if (event.type === "keydown" || event.type === "keyup") {
            // Map keys. The service expects "key": "enter", "mode": "press" | "down" | "up".
            const mode = event.type === "keydown" ? "down" : "up";
            // Simple key mapping
            let key = event.key.toLowerCase();
            if (key === "control") key = "ctrl";
            if (key === "escape") key = "esc";
            // Add more mappings as needed.
            
            payload = {
              action: "input_control",
              type: "keyboard",
              key: key,
              mode: mode
            };
        } else if (event.type === "wheel") {
            // Mouse scroll
            // event.deltaY > 0 means scroll down.
            // API expects "positive up, negative down" (or similar? doc says: "正数向上，负数向下")
            // DOM deltaY: positive is DOWN.
            // So we need to invert deltaY.
            // Also, usually 120 is one step.
            // Let's just invert it.
            payload = {
              action: "input_control",
              type: "mouse_scroll",
              delta: -event.deltaY
            };
        } else if (event.type === "text") {
            payload = {
              action: "input_control",
              type: "text",
              text: event.text
            };
        } else if (event.type === "volume") {
            payload = {
              action: "input_control",
              type: "volume",
              mode: event.mode
            };
        }

        if (payload) {
            // Send to local WinPilot HTTP endpoint
            fetch("http://localhost:34301/api/execute", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(payload),
            }).catch(err => console.error("Failed to send control event to WinPilot:", err));
        }
      });

      socket.on("peer-disconnected", (viewerId: string) => {
        if (peerConnectionsRef.current[viewerId]) {
          peerConnectionsRef.current[viewerId].close();
          delete peerConnectionsRef.current[viewerId];
        }
      });

      // Handle stream stop from browser UI
      stream.getVideoTracks()[0].onended = () => {
        stopSharing();
      };

    } catch (error) {
      console.error("Error sharing screen:", error);
    }
  };

  const stopSharing = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
    peerConnectionsRef.current = {};
    
    setIsSharing(false);
    setRoomId(null);
  };

  const shareUrl = roomId
    ? `${window.location.protocol}//${lanIp ?? window.location.hostname}${window.location.port ? `:${window.location.port}` : ""}/watch/${roomId}`
    : "";

  const copyLink = () => {
    if (roomId) {
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  useEffect(() => {
    return () => {
      stopSharing();
    };
  }, []);

  useEffect(() => {
    fetch("/api/local-ip")
      .then((res) => res.json())
      .then((data) => {
        if (typeof data?.ip === "string" && data.ip) {
          setLanIp(data.ip);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-3xl w-full bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
        <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-zinc-900">Screen Share</h1>
              <p className="text-sm text-zinc-500">Share your screen with anyone via a link</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label htmlFor="allow-control" className="text-sm font-medium text-zinc-700 cursor-pointer select-none">
                Allow Remote Control
              </label>
              <button
                id="allow-control"
                role="switch"
                aria-checked={allowControl}
                onClick={() => setAllowControl(!allowControl)}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
                  allowControl ? "bg-indigo-600" : "bg-zinc-200"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform",
                    allowControl ? "translate-x-2" : "-translate-x-2"
                  )}
                />
              </button>
            </div>

            {!isSharing ? (
              <Button onClick={startSharing} className="gap-2">
                <Monitor className="w-4 h-4" />
                Start Sharing
              </Button>
            ) : (
              <Button variant="destructive" onClick={stopSharing} className="gap-2">
                <StopCircle className="w-4 h-4" />
                Stop Sharing
              </Button>
            )}
          </div>
        </div>

        <div className="p-6 bg-zinc-50/50">
          <div className="aspect-video bg-zinc-900 rounded-xl overflow-hidden relative shadow-inner flex items-center justify-center">
            {!isSharing ? (
              <div className="text-zinc-500 flex flex-col items-center gap-2">
                <Monitor className="w-12 h-12 opacity-20" />
                <p>Click "Start Sharing" to begin</p>
              </div>
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-contain"
              />
            )}
          </div>

          {isSharing && roomId && (
            <div className="mt-6 p-4 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-between gap-4">
              <div className="flex-1 truncate">
                <p className="text-xs font-medium text-indigo-600 uppercase tracking-wider mb-1">Share Link</p>
                <p className="text-sm text-indigo-900 truncate font-mono">
                  {shareUrl}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={copyLink}
                className="shrink-0 gap-2 bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copied!" : "Copy Link"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
