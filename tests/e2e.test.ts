/**
 * E2E test: Create browser sessions via the orchestrator,
 * connect Puppeteer, and scrape Hacker News.
 *
 * Flow:
 *   1. POST /v1/sessions on the orchestrator → spins up a browser pod AND
 *      forwards to the browser pod to launch a browser instance in one step.
 *      Returns the full Steel SessionDetails response.
 *   2. Connect Puppeteer via the browser's websocketUrl through CDP proxy
 *   3. Navigate to Hacker News, scrape top 5 stories
 *   4. Release the session
 */

import puppeteer from "puppeteer-core";

const ORCHESTRATOR_URL =
	process.env.ORCHESTRATOR_URL || "http://localhost:3000";

// ─── Types ──────────────────────────────────────────────

/** Steel SessionDetails — returned by POST /v1/sessions and GET /v1/sessions/:id */
interface SessionDetails {
	id: string;
	createdAt: string;
	status: string;
	duration: number;
	eventCount: number;
	timeout: number;
	creditsUsed: number;
	websocketUrl: string;
	debugUrl: string;
	debuggerUrl: string;
	sessionViewerUrl: string;
	userAgent: string;
	dimensions?: { width: number; height: number };
}

// ─── Helpers ──────────────────────────────────────────────

async function createSession(): Promise<SessionDetails> {
	const res = await fetch(`${ORCHESTRATOR_URL}/v1/sessions`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ timeout: 3600 }),
	});
	if (!res.ok) {
		throw new Error(
			`Create session failed (${res.status}): ${await res.text()}`,
		);
	}
	const data = (await res.json()) as SessionDetails;
	if (data.status !== "live") {
		throw new Error(`Session not live: ${JSON.stringify(data)}`);
	}
	return data;
}

async function releaseSession(sessionId: string) {
	const res = await fetch(
		`${ORCHESTRATOR_URL}/v1/sessions/${sessionId}/release`,
		{ method: "POST" },
	);
	const data = (await res.json()) as { success?: boolean; [key: string]: any };
	if (data.success === false) {
		console.warn(
			`   ⚠ Release returned success=false: ${JSON.stringify(data)}`,
		);
	}
}

async function getSessionDetails(sessionId: string): Promise<SessionDetails> {
	const res = await fetch(`${ORCHESTRATOR_URL}/v1/sessions/${sessionId}`);
	if (!res.ok) {
		throw new Error(
			`Get session details failed (${res.status}): ${await res.text()}`,
		);
	}
	return (await res.json()) as SessionDetails;
}

async function listSessions(): Promise<{
	sessions: SessionDetails[];
	totalCount: number;
}> {
	const res = await fetch(`${ORCHESTRATOR_URL}/v1/sessions`);
	if (!res.ok) {
		throw new Error(
			`List sessions failed (${res.status}): ${await res.text()}`,
		);
	}
	return (await res.json()) as {
		sessions: SessionDetails[];
		totalCount: number;
	};
}

async function getSessionContext(sessionId: string) {
	const res = await fetch(
		`${ORCHESTRATOR_URL}/v1/sessions/${sessionId}/context`,
	);
	if (!res.ok) {
		throw new Error(`Get context failed (${res.status}): ${await res.text()}`);
	}
	return (await res.json()) as Record<string, any>;
}

async function getLiveDetails(sessionId: string) {
	const res = await fetch(
		`${ORCHESTRATOR_URL}/v1/sessions/${sessionId}/live-details`,
	);
	if (!res.ok) {
		throw new Error(
			`Get live-details failed (${res.status}): ${await res.text()}`,
		);
	}
	return (await res.json()) as Record<string, any>;
}

// Get the CDP websocket URL for a browser session.
// Fetches /json/version from the browser pod via the orchestrator proxy,
// then rewrites the websocket URL to go through the orchestrator's CDP proxy.
async function getCdpWebsocketUrl(sessionId: string): Promise<string> {
	const res = await fetch(
		`${ORCHESTRATOR_URL}/v1/sessions/${sessionId}/json/version`,
	);
	const data = (await res.json()) as { webSocketDebuggerUrl?: string };
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

// ─── Test: API Response Format ─────────────────────────────

async function testApiResponseFormat() {
	console.log("\n🧪 Test: API response format matches Steel API");
	console.log("=".repeat(50));

	const session = await createSession();
	console.log(`   ✓ Created session: ${session.id}`);

	// Verify required Steel SessionDetails fields
	const requiredFields = [
		"id",
		"createdAt",
		"status",
		"duration",
		"eventCount",
		"timeout",
		"creditsUsed",
		"websocketUrl",
		"debugUrl",
		"sessionViewerUrl",
	];
	for (const field of requiredFields) {
		if ((session as any)[field] === undefined) {
			throw new Error(`Missing required field '${field}' in create response`);
		}
	}
	console.log(`   ✓ All required fields present in create response`);

	// GET session details
	const details = await getSessionDetails(session.id);
	if (details.id !== session.id) throw new Error(`Details ID mismatch`);
	if (details.status !== "live") throw new Error(`Details status not live`);
	console.log(`   ✓ GET /sessions/:id returns full Steel SessionDetails`);

	// GET context
	const context = await getSessionContext(session.id);
	if (typeof context.cookies === "undefined")
		throw new Error(`Missing cookies in context`);
	console.log(`   ✓ GET /sessions/:id/context returns browser context`);

	// GET live-details
	const live = await getLiveDetails(session.id);
	if (!Array.isArray(live.pages))
		throw new Error(`Missing pages in live-details`);
	console.log(
		`   ✓ GET /sessions/:id/live-details returns live state (${live.pages.length} page(s))`,
	);

	// List sessions
	const list = await listSessions();
	if (typeof list.totalCount !== "number")
		throw new Error(`Missing totalCount`);
	const found = list.sessions.some((s) => s.id === session.id);
	if (!found) throw new Error(`Session not found in list`);
	console.log(`   ✓ GET /sessions returns array with totalCount`);

	await releaseSession(session.id);
	console.log(`   ✓ Session released`);
}

// ─── Test: Single Session ──────────────────────────────────

async function testSingleSession() {
	console.log("\n🧪 Test: Single session — scrape Hacker News");
	console.log("=".repeat(50));

	let sessionId: string | undefined;
	let browser: puppeteer.Browser | undefined;

	try {
		// 1. Create session (orchestrator + browser in one step)
		console.log("1. Creating session...");
		const session = await createSession();
		sessionId = session.id;
		console.log(`   ✓ Session: ${sessionId}`);
		console.log(`   websocketUrl: ${session.websocketUrl}`);

		// 2. Connect Puppeteer via CDP
		console.log("2. Connecting Puppeteer...");
		const wsEndpoint = await getCdpWebsocketUrl(sessionId);
		console.log(`   wsEndpoint: ${wsEndpoint}`);
		browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });
		console.log("   ✓ Connected");

		// 3. Scrape Hacker News
		console.log("3. Navigating to Hacker News...");
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
		if (browser) browser.disconnect();
		if (sessionId) {
			await releaseSession(sessionId);
			console.log("   ✓ Session cleaned up");
		}
	}
}

// ─── Test: Concurrent Sessions ────────────────────────────

async function testConcurrentSessions() {
	console.log("\n🧪 Test: 3 concurrent sessions — isolated scraping");
	console.log("=".repeat(50));

	type SessionInfo = {
		session: SessionDetails;
		browser: puppeteer.Browser;
	};

	const sessions: SessionInfo[] = [];

	try {
		// 1. Create 3 sessions in parallel
		console.log("1. Creating 3 sessions in parallel...");
		const results = await Promise.all([
			createSession(),
			createSession(),
			createSession(),
		]);
		console.log(
			`   ✓ Sessions: ${results.map((s) => s.id.slice(0, 8)).join(", ")}...`,
		);

		// 2. Connect Puppeteer to each
		console.log("2. Connecting Puppeteer to each...");
		for (const s of results) {
			const wsEndpoint = await getCdpWebsocketUrl(s.id);
			const browser = await puppeteer.connect({
				browserWSEndpoint: wsEndpoint,
			});
			sessions.push({ session: s, browser });
		}
		console.log(`   ✓ All 3 browsers connected`);

		// 3. Each session scrapes a different page
		console.log("3. Scraping different pages concurrently...");
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
					session: s.session.id.slice(0, 8),
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
		for (const s of sessions) {
			s.browser.disconnect();
			await releaseSession(s.session.id);
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
	const health = (await fetch(`${ORCHESTRATOR_URL}/v1/health`).then((r) =>
		r.json(),
	)) as { status: string; sessions: number; [key: string]: any };
	if (health.status !== "ok") {
		throw new Error(`Orchestrator unhealthy: ${JSON.stringify(health)}`);
	}
	console.log(`Health: ok (${health.sessions} existing sessions)`);

	await testApiResponseFormat();
	await testSingleSession();
	await testConcurrentSessions();

	console.log("\n✅ All tests passed!");
}

main().catch((err) => {
	console.error("\n❌ Test failed:", err);
	process.exit(1);
});
