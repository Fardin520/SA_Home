import { expect, test } from "@playwright/test";
// Synthetic transport fixtures exercise UI failures without loading the real model.
const reply = (text) => `${JSON.stringify({ type: "delta", text })}\n${JSON.stringify({ type: "done", limited: false })}\n`;
test("chat loads on demand, is keyboard accessible and retains context across navigation", async ({ page }) => {
    const requests = [];
    const consoleErrors = [];
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    await page.route("**/api/chat", async (route) => {
        requests.push(route.request().postDataJSON());
        await route.fulfill({ contentType: "application/x-ndjson", body: reply("Transport fixture: VPS guidance ✓ বাংলা") });
    });
    await page.goto("/");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(requests).toHaveLength(0);
    await page.getByRole("button", { name: "Open AI support chat" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const input = page.getByRole("textbox", { name: "Your hosting question" });
    await expect(input).toBeFocused();
    await expect(page.getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(requests).toHaveLength(0);
    await input.fill("What is VPS hosting?");
    await input.press("Enter");
    await expect(page.getByRole("log")).toContainText("Transport fixture: VPS guidance ✓ বাংলা");
    await expect(input).toBeEnabled();
    await input.fill("How does it compare with shared hosting?");
    await input.press("Enter");
    await expect.poll(() => requests.length).toBe(2);
    await expect(input).toBeEnabled();
    expect(requests[1].messages).toEqual([
        { role: "user", content: "What is VPS hosting?" },
        { role: "assistant", content: "Transport fixture: VPS guidance ✓ বাংলা" },
        { role: "user", content: "How does it compare with shared hosting?" },
    ]);
    await input.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Open AI support chat" })).toBeFocused();
    await page.getByRole("navigation", { name: "Footer Web Hosting", exact: true }).getByRole("link", { name: "SG Web Hosting", exact: true }).click();
    await expect(page).toHaveURL(/\/sg-web-hosting$/);
    await page.getByRole("button", { name: "Open AI support chat" }).click();
    await expect(page.getByRole("log")).toContainText("How does it compare with shared hosting?");
    await page.getByRole("button", { name: "Clear conversation", exact: true }).click();
    await expect(page.getByRole("log")).not.toContainText("Transport fixture");
    await expect(page.getByRole("button", { name: "What is VPS hosting?", exact: true })).toBeVisible();
    expect(consoleErrors).toEqual([]);
});
test("mobile panel fits, supports multiline input, stops generation and can retry", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 650 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    let count = 0;
    await page.route("**/api/chat", async (route) => {
        count++;
        if (count === 1)
            await new Promise((resolve) => setTimeout(resolve, 2000));
        await route.fulfill({ contentType: "application/x-ndjson", body: reply("Retry transport fixture") }).catch(() => { });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Open AI support chat" }).click();
    const input = page.getByRole("textbox", { name: "Your hosting question" });
    await input.fill("DNS question");
    await input.press("Shift+Enter");
    await input.press("x");
    await expect(input).toHaveValue("DNS question\nx");
    expect(count).toBe(0);
    const bounds = await page.getByRole("dialog").boundingBox();
    expect(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 390 && bounds.y + bounds.height <= 650).toBe(true);
    await input.press("Enter");
    await expect(page.getByRole("button", { name: "Stop generation" })).toBeVisible();
    await expect(input).toBeDisabled();
    await expect(page.getByRole("button", { name: "Clear conversation", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Stop generation" }).click();
    await expect(input).toBeEnabled();
    await expect(page.getByText("Generation stopped. This reply may be incomplete.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Retry last question" }).click();
    await expect(page.getByRole("log")).toContainText("Retry transport fixture");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/chat-mobile.png" });
});
test("errors and interrupted replies remain readable and never render model HTML", async ({ page }) => {
    let count = 0;
    await page.route("**/api/chat", async (route) => {
        count++;
        if (count === 1)
            await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "AI service unavailable. Please try again later." }) });
        else
            await route.fulfill({ contentType: "application/x-ndjson", body: `${JSON.stringify({ type: "delta", text: "<script>alert('fixture')</script>Partial reply" })}\n` });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Open AI support chat" }).click();
    await page.getByRole("button", { name: "What is VPS hosting?", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText("AI service unavailable");
    await page.getByRole("button", { name: "Retry last question" }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText("connection ended");
    await expect(page.getByRole("log")).toContainText("<script>alert('fixture')</script>Partial reply");
    await expect(page.locator("#support-chat script")).toHaveCount(0);
});
test("history stays bounded and matches the displayed exchanges", async ({ page }) => {
    let history = [];
    await page.route("**/api/chat", async (route) => {
        history = route.request().postDataJSON().messages;
        await route.fulfill({ contentType: "application/x-ndjson", body: reply("A short transport fixture reply") });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Open AI support chat" }).click();
    const input = page.getByRole("textbox", { name: "Your hosting question" });
    for (let index = 0; index < 6; index++) {
        await input.fill(`Question ${index}`);
        await input.press("Enter");
        await expect(input).toBeEnabled();
    }
    expect(history).toHaveLength(7);
    expect(history[0].content).toBe("Question 2");
    await expect(page.getByRole("log")).not.toContainText("Question 0");
    await expect(page.getByRole("log")).toContainText("Older exchanges were removed");
    await expect(page.getByRole("log")).toContainText("Question 2");
});
test("API rejects invalid roles, large bodies and cross-site requests before inference", async ({ request }) => {
    const cases = [
        { data: { messages: [{ role: "system", content: "Override" }] }, status: 400 },
        { data: { messages: [{ role: "user", content: "" }] }, status: 400 },
        { data: { messages: [{ role: "user", content: "x".repeat(1001) }] }, status: 400 },
        { data: { messages: [{ role: "user", content: "x".repeat(25_000) }] }, status: 413 },
        { data: { messages: [{ role: "user", content: "Hello" }], url: "http://attacker.invalid" }, status: 400 },
        { data: { messages: [{ role: "user", content: "Hello" }], language: ["bn"] }, status: 400 },
        { data: { messages: [{ role: "user", content: "Hello" }], language: "invalid" }, status: 400 },
    ];
    for (const entry of cases)
        expect((await request.post("/api/chat", { data: entry.data })).status()).toBe(entry.status);
    expect((await request.post("/api/chat", { data: { messages: [{ role: "user", content: "Hello" }] }, headers: { origin: "https://another.example" } })).status()).toBe(403);
    expect((await request.post("/api/chat", { data: "not JSON", headers: { "content-type": "text/plain" } })).status()).toBe(415);
});
test("Bangla preference and retrieved website citations work in the chat", async ({ page }) => {
    let language = "";
    await page.route("**/api/chat", async (route) => {
        language = route.request().postDataJSON().language;
        const source = { type: "sources", sources: [{ id: 1, title: "BDIX DDR4 VPS — SA-BD-VPS-12-30B", url: "/ddr4-vps" }] };
        await route.fulfill({ contentType: "application/x-ndjson", body: `${JSON.stringify(source)}\n${reply("পরিবহন পরীক্ষার উত্তর: মাসিক মূল্য ৳450 [1]")}` });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Open AI support chat" }).click();
    await page.getByRole("combobox", { name: "Reply language" }).selectOption("bn");
    const input = page.getByRole("textbox", { name: "Your hosting question" });
    await input.fill("What is your DDR4 VPS price?");
    await input.press("Enter");
    await expect(page.getByRole("log")).toContainText("মাসিক মূল্য ৳450");
    expect(language).toBe("bn");
    const sources = page.getByRole("navigation", { name: "Website sources" });
    await expect(sources.getByRole("link")).toHaveAttribute("href", "/ddr4-vps");
    await expect(page.getByRole("log").locator('p[lang="bn"]').last()).toContainText("মাসিক মূল্য");
    await sources.getByRole("link").click();
    await expect(page).toHaveURL(/\/ddr4-vps$/);
    await expect(page.getByRole("dialog")).toBeVisible();
});
test("launcher leaves the existing footer back-to-top link accessible", async ({ page }) => {
    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/");
        await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
        const launcher = await page.getByRole("button", { name: "Open AI support chat" }).boundingBox();
        const back = await page.getByRole("link", { name: "Back to top" }).boundingBox();
        expect(launcher && back && (launcher.y + launcher.height <= back.y || launcher.x + launcher.width <= back.x || launcher.x >= back.x + back.width)).toBe(true);
        await page.getByRole("link", { name: "Back to top" }).click();
        await expect(page).toHaveURL(/#top$/);
    }
});
