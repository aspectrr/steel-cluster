import http from "http";
import { WebSocketServer, type WebSocket } from "ws";

// Minimal HTTP + WebSocket server to test if K8s networking blocks WS upgrades
const server = http.createServer((req, res) => {
	if (req.url === "/health") {
		res.writeHead(200);
		res.end(JSON.stringify({ status: "ok" }));
	} else {
		res.writeHead(404);
		res.end("not found");
	}
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
	console.log(`[WS] Upgrade request: ${req.url}`);
	wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
		console.log("[WS] Client connected");
		ws.on("message", (data: Buffer) => {
			console.log(`[WS] Received: ${data}`);
			ws.send(`echo: ${data}`);
		});
		ws.on("close", () => {
			console.log("[WS] Client disconnected");
		});
		ws.send("hello from ws-test-server");
	});
});

const PORT = 3099;
server.listen(PORT, "0.0.0.0", () => {
	console.log(`WS test server listening on ${PORT}`);
});
