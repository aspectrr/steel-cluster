import WebSocket from "ws";

const ORCH = process.env.ORCHESTRATOR_URL || "http://browser-orchestrator:3000";

async function main() {
	// Create an orchestrator session
	console.log("1. Creating orchestrator session...");
	const createResp = await fetch(ORCH + "/v1/sessions", { method: "POST" });
	const session: any = await createResp.json();
	console.log("   Session:", session.sessionId);

	// Wait for browser pod to be ready
	console.log("2. Waiting for browser pod...");
	await new Promise((r) => setTimeout(r, 15000));

	// Create a browser instance via the Steel API
	console.log("3. Creating browser instance...");
	const browserResp = await fetch(
		ORCH + "/v1/sessions/" + session.sessionId + "/v1/sessions",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url: "about:blank" }),
		},
	);
	const browserSession = await browserResp.json();
	console.log("   Browser:", JSON.stringify(browserSession));

	// Get CDP version info through the orchestrator proxy
	console.log("4. Fetching /json/version...");
	const versionResp = await fetch(
		ORCH + "/v1/sessions/" + session.sessionId + "/json/version",
	);
	const version: any = await versionResp.json();
	console.log("   CDP:", JSON.stringify(version));

	// Build the WS URL through the orchestrator proxy
	const wsBrowserUrl = version.webSocketDebuggerUrl;
	console.log("   Original wsUrl:", wsBrowserUrl);
	const match = wsBrowserUrl.match(/ws:\/\/[^/]+(.+)/);
	if (!match) {
		console.error("   Could not parse wsUrl");
		process.exit(1);
	}
	const wsPath = match[1];
	const wsUrl = `ws://browser-orchestrator:3000/v1/sessions/${session.sessionId}/cdp${wsPath}`;
	console.log("5. Connecting WebSocket:", wsUrl);

	const ws = new WebSocket(wsUrl);
	ws.on("open", () => {
		console.log("   WS OPEN! ✅");
		ws.close();
	});
	ws.on("message", (d: Buffer) => console.log("   WS MSG:", d.toString()));
	ws.on("error", (e: Error) => {
		console.log("   WS ERROR:", e.message);
		process.exit(1);
	});
	ws.on("close", () => {
		console.log("   WS CLOSED");
		process.exit(0);
	});
	setTimeout(() => {
		console.log("   TIMEOUT waiting for WS");
		process.exit(1);
	}, 15000);
}

main().catch((e) => {
	console.error("Error:", e);
	process.exit(1);
});
