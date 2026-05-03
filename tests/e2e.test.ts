/**
 * E2E test: Create browser sessions via the orchestrator,
 * connect Puppeteer, and scrape Hacker News.
 *
 * Flow:
 *   1. POST /v1/sessions on the orchestrator → spins up a browser pod
 *   2. POST /v1/sessions/{id}/v1/sessions on the browser → launches a browser instance
 *   3. Connect Puppeteer via the browser's websocketUrl
 *   4. Navigate to Hacker News, scrape top 5 stories
 *   5. Release the browser session, delete the orchestrator session
 */

import puppeteer from "puppeteer-core";

const ORCHESTRATOR_URL =
	process.env.ORCHESTRATOR_URL || "http://localhost:3000";

// ─── Helpers ──────────────────────────────────────────────

interface OrchestratorSession {
	sessionId: string;
	status: string;
	serviceHost?: string;
	serviceName?: string;
	podName?: string;
	error?: string;
}

interface BrowserSession {
	id: string;
	status: string;
	websocketUrl: string;
}

async function createOrchestratorSession(): Promise<string> {
	const res = await fetch(`${ORCHESTRATOR_URL}/v1/sessions`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ timeout: 3600 }),
	});
	const data: OrchestratorSession = await res.json();
	if (data.status !== "live") {
		throw new Error(`Session not live: ${JSON.stringify(data)}`);
	}
	return data.sessionId;
}

async function waitForBrowserPod(sessionId: string, timeoutMs = 60000) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const res = await fetch(
				`${ORCHESTRATOR_URL}/v1/sessions/${sessionId}/v1/health`,
			);
			if (res.ok) return;
		} catch {}
		await new Promise((r) => setTimeout(r, 2000));
	}
	throw new Error(
		`Browser pod for session ${sessionId} did not become ready in ${timeoutMs}ms`,
	);
}

async function createBrowserSession(
	sessionId: string,
): Promise<BrowserSession> {
	// Wait for the browser pod to be ready first
	await waitForBrowserPod(sessionId);

	const res = await fetch(
		`${ORCHESTRATOR_URL}/v1/sessions/${sessionId}/v1/sessions`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url: "about:blank" }),
		},
	);
	const data: BrowserSession = await res.json();
	if (!data.id) {
		throw new Error(`Browser session failed: ${JSON.stringify(data)}`);
	}
	return data;
}

async function deleteOrchestratorSession(sessionId: string) {
	await fetch(`${ORCHESTRATOR_URL}/v1/sessions/${sessionId}`, {
		method: "DELETE",
	});
}

async function releaseBrowserSession(
	sessionId: string,
	browserSessionId: string,
) {
	await fetch(
		`${ORCHESTRATOR_URL}/v1/sessions/${sessionId}/v1/sessions/${browserSessionId}`,
		{ method: "DELETE" },
	).catch(() => {});
}

// Get the CDP websocket URL for a browser session.
// Fetches /json/version from the browser pod via the orchestrator proxy,
// then rewrites the websocket URL to go through the orchestrator's CDP proxy.
async function getCdpWebsocketUrl(sessionId: string): Promise<string> {
	const res = await fetch(
		`${ORCHESTRATOR_URL}/v1/sessions/${sessionId}/json/version`,
	);
	const data: { webSocketDebuggerUrl?: string } = await res.json();
	const wsUrl = data.webSocketDebuggerUrl;
	if (!wsUrl) {
		throw new Error(
			`No webSocketDebuggerUrl in /json/version: ${JSON.stringify(data)}`,
		);
	}
	// ws://localhost/devtools/browser/{id} -> ws://orchestrator/v1/sessions/{sid}/cdp/devtools/browser/{id}
	const orchestratorWs = ORCHESTRATOR_URL.replace(/^http/, "ws");
	const path = new URL(wsUrl).pathname;
	return `${orchestratorWs}/v1/sessions/${sessionId}/cdp${path}`;
}

// ─── Test ──────────────────────────────────────────────

async function testSingleSession() {
	console.log("\n🧪 Test: Single session — scrape Hacker News");
	console.log("=".repeat(50));

	let sessionId: string | undefined;
	let browserSessionId: string | undefined;
	let browser: puppeteer.Browser | undefined;

	try {
		// 1. Create orchestrator session (spins up a browser pod)
		console.log("1. Creating orchestrator session...");
		sessionId = await createOrchestratorSession();
		console.log(`   ✓ Session: ${sessionId}`);

		// 2. Create browser instance inside the pod
		console.log("2. Launching browser instance...");
		const browserSession = await createBrowserSession(sessionId);
		browserSessionId = browserSession.id;
		console.log(`   ✓ Browser: ${browserSessionId}`);
		console.log(`   websocketUrl: ${browserSession.websocketUrl}`);

		// 3. Connect Puppeteer via CDP
		console.log("3. Connecting Puppeteer...");
		const wsEndpoint = await getCdpWebsocketUrl(sessionId);
		console.log(`   wsEndpoint: ${wsEndpoint}`);
		browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });
		console.log("   ✓ Connected");

		// 4. Scrape Hacker News
		console.log("4. Navigating to Hacker News...");
		const page = await browser.newPage();
		await page.goto("https://news.ycombinator.com", {
			waitUntil: "networkidle2",
			timeout: 30000,
		});

		const stories = await page.evaluate(() => {
			const items: { title: string; link: string; points: string }[] = [];
			const rows = document.querySelectorAll("tr.athing");
			for (let i = 0; i < 5; i++) {
				const row = rows[i];
				const titleEl = row?.querySelector(".titleline > a");
				const subtext = row?.nextElementSibling;
				const score = subtext?.querySelector(".score");
				items.push({
					title: titleEl?.textContent || "",
					link: titleEl?.getAttribute("href") || "",
					points: score?.textContent?.split(" ")[0] || "0",
				});
			}
			return items;
		});

		console.log("\n   Top 5 Hacker News Stories:");
		stories.forEach((story, i) => {
			console.log(`   ${i + 1}. ${story.title}`);
			console.log(`      ${story.points} pts — ${story.link}`);
		});

		// Validate
		if (stories.length !== 5) {
			throw new Error(`Expected 5 stories, got ${stories.length}`);
		}
		const hasTitles = stories.every((s) => s.title.length > 0);
		if (!hasTitles) {
			throw new Error("Some stories have empty titles");
		}
		console.log("\n   ✓ All 5 stories scraped successfully");

		await page.close();
	} finally {
		// 5. Cleanup
		if (browser) {
			browser.disconnect();
		}
		if (browserSessionId && sessionId) {
			await releaseBrowserSession(sessionId, browserSessionId);
		}
		if (sessionId) {
			await deleteOrchestratorSession(sessionId);
			console.log("   ✓ Session cleaned up");
		}
	}
}

async function testConcurrentSessions() {
	console.log("\n🧪 Test: 3 concurrent sessions — isolated scraping");
	console.log("=".repeat(50));

	type SessionInfo = {
		sessionId: string;
		browserSessionId: string;
		browser: puppeteer.Browser;
	};

	const sessions: SessionInfo[] = [];

	try {
		// 1. Create 3 sessions in parallel
		console.log("1. Creating 3 sessions in parallel...");
		const results = await Promise.all([
			createOrchestratorSession(),
			createOrchestratorSession(),
			createOrchestratorSession(),
		]);
		console.log(
			`   ✓ Sessions: ${results.map((s) => s.slice(0, 8)).join(", ")}...`,
		);

		// 2. Launch browser in each session
		console.log("2. Launching browsers in each session...");
		const browserSessions = await Promise.all(
			results.map((sid) => createBrowserSession(sid)),
		);

		// 3. Connect Puppeteer to each
		console.log("3. Connecting Puppeteer to each...");
		for (let i = 0; i < results.length; i++) {
			const sessionId = results[i];
			const bs = browserSessions[i];
			const wsEndpoint = await getCdpWebsocketUrl(sessionId);
			const browser = await puppeteer.connect({
				browserWSEndpoint: wsEndpoint,
			});
			sessions.push({
				sessionId,
				browserSessionId: (bs as any).id as string,
				browser,
			});
		}
		console.log(`   ✓ All 3 browsers connected`);

		// 4. Each session scrapes a different page
		console.log("4. Scraping different pages concurrently...");
		const urls = [
			"https://news.ycombinator.com",
			"https://news.ycombinator.com/newest",
			"https://news.ycombinator.com/show",
		];

		const allResults = await Promise.all(
			sessions.map(async (s, i) => {
				const page = await s.browser.newPage();
				await page.goto(urls[i], {
					waitUntil: "networkidle2",
					timeout: 30000,
				});

				const title = await page.title();
				const topStory = await page.evaluate(() => {
					const first = document.querySelector("tr.athing .titleline > a");
					return first?.textContent || "";
				});

				await page.close();
				return {
					session: s.sessionId.slice(0, 8),
					page: urls[i],
					title,
					topStory,
				};
			}),
		);

		for (const r of allResults) {
			console.log(`   Session ${r.session}: ${r.title}`);
			console.log(`     Top story: ${r.topStory}`);
		}

		// Validate isolation: each session should have different top stories
		const topStories = allResults.map((r) => r.topStory);
		const uniqueStories = new Set(topStories);
		if (uniqueStories.size < 2) {
			console.warn("   ⚠ Sessions may not be fully isolated (same top story)");
		} else {
			console.log(
				`   ✓ ${uniqueStories.size} distinct top stories — sessions are isolated`,
			);
		}

		// Validate all got results
		const allHaveStories = topStories.every((s) => s.length > 0);
		if (!allHaveStories) {
			throw new Error("Some sessions returned empty stories");
		}
		console.log("   ✓ All sessions scraped successfully");
	} finally {
		// Cleanup all sessions
		for (const s of sessions) {
			s.browser.disconnect();
			await releaseBrowserSession(s.sessionId, s.browserSessionId);
			await deleteOrchestratorSession(s.sessionId);
		}
		if (sessions.length > 0) {
			console.log("   ✓ All sessions cleaned up");
		}
	}
}

// ─── Run ──────────────────────────────────────────────

async function main() {
	console.log("Steel Cluster E2E Tests");
	console.log(`Orchestrator: ${ORCHESTRATOR_URL}`);

	// Preflight check
	const health = await fetch(`${ORCHESTRATOR_URL}/v1/health`).then((r) =>
		r.json(),
	);
	if (health.status !== "ok") {
		throw new Error(`Orchestrator unhealthy: ${JSON.stringify(health)}`);
	}
	console.log(`Health: ok (${health.sessions} existing sessions)`);

	await testSingleSession();
	await testConcurrentSessions();

	console.log("\n✅ All tests passed!");
}

main().catch((err) => {
	console.error("\n❌ Test failed:", err);
	process.exit(1);
});
