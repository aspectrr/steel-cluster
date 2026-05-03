import WebSocket from "ws";

// Test: connect to ws-test-server via WebSocket
const url = process.env.WS_URL || "ws://ws-test-server:3099";
console.log(`Connecting to ${url}...`);

const ws = new WebSocket(url);

ws.on("open", () => {
	console.log("[Client] Connected!");
	ws.send("hello from client");
});

ws.on("message", (data: Buffer) => {
	console.log(`[Client] Received: ${data}`);
	// After getting echo, close
	setTimeout(() => {
		ws.close();
	}, 500);
});

ws.on("close", () => {
	console.log("[Client] Disconnected - TEST PASSED");
	process.exit(0);
});

ws.on("error", (err) => {
	console.error("[Client] Error:", err.message);
	process.exit(1);
});

setTimeout(() => {
	console.error("[Client] Timeout - TEST FAILED");
	process.exit(1);
}, 10000);
