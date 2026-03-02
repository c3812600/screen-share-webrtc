import express from "express";
import { createServer as createViteServer } from "vite";
import { Server as SocketIOServer } from "socket.io";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);
  const io = new SocketIOServer(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  const PORT = 3000;

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/local-ip", (req, res) => {
    const nets = os.networkInterfaces();
    const addresses: string[] = [];

    for (const netList of Object.values(nets)) {
      if (!netList) continue;
      for (const net of netList) {
        if (net.family !== "IPv4") continue;
        if (net.internal) continue;
        if (net.address.startsWith("169.254.")) continue;
        addresses.push(net.address);
      }
    }

    const isPrivate = (ip: string) =>
      ip.startsWith("10.") ||
      ip.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip);

    const preferred = addresses.find(isPrivate) ?? addresses[0] ?? null;
    res.json({ ip: preferred });
  });

  // Signaling logic
  io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    socket.on("join-room", (roomId, role) => {
      socket.join(roomId);
      console.log(`Socket ${socket.id} joined room ${roomId} as ${role}`);
      
      if (role === "viewer") {
        // Notify the broadcaster that a viewer joined
        socket.to(roomId).emit("viewer-joined", socket.id);
      } else if (role === "broadcaster") {
        // Notify viewers that the broadcaster joined (in case they were waiting)
        socket.to(roomId).emit("broadcaster-joined", socket.id);
      }
    });

    socket.on("offer", (roomId, viewerId, offer) => {
      socket.to(viewerId).emit("offer", socket.id, offer);
    });

    socket.on("answer", (roomId, broadcasterId, answer) => {
      socket.to(broadcasterId).emit("answer", socket.id, answer);
    });

    socket.on("ice-candidate", (roomId, targetId, candidate) => {
      socket.to(targetId).emit("ice-candidate", socket.id, candidate);
    });

    socket.on("control-event", (roomId, targetId, event) => {
      socket.to(targetId).emit("control-event", socket.id, event);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      // We could broadcast a disconnect event to rooms the user was in
      socket.rooms.forEach((roomId) => {
        socket.to(roomId).emit("peer-disconnected", socket.id);
      });
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
