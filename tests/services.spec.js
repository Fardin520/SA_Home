import { expect, test } from "@playwright/test";
import publicPages from "../data/pages.json" with { type: "json" };
for (const entry of publicPages) {
    test(`${entry.slug}: static content and responsive layout`, async ({ page }, testInfo) => {
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const response = await page.goto(`/${entry.slug}`);
        expect(response?.status()).toBe(200);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(entry.title);
        await expect(page).toHaveTitle(`${entry.title} | Server Anywhere`);
        await expect(page.locator('a[href*="//"][href*="serveranywhere.net"], form[action*="//"][action*="serveranywhere.net"]')).toHaveCount(0);
        const firstPeriod = entry.plans[0]?.period;
        const visiblePlans = entry.plans.filter((plan) => plan.period === firstPeriod);
        await expect(page.locator(".pricing-card:visible")).toHaveCount(visiblePlans.length);
        for (const [index, plan] of visiblePlans.entries()) {
            const card = page.locator(".pricing-card:visible").nth(index);
            await expect(card.getByRole("heading", { level: 3 })).toHaveText(plan.name);
            await expect(card.getByRole("button", { name: "Get started" })).toBeDisabled();
        }
        for (const width of [390, 768, 1280, 1440]) {
            await page.setViewportSize({ width, height: 900 });
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}px`).toBe(true);
            const images = await page.locator("img").evaluateAll((images) => images.every((image) => image instanceof HTMLImageElement && (image.loading === "lazy" || image.complete && image.naturalWidth > 0)));
            expect(images).toBe(true);
            if (["web-hosting", "ddr4-vps", "web-design", "privacy-policy"].includes(entry.slug) && [390, 1440].includes(width)) {
                await page.evaluate(() => document.fonts.ready);
                await page.screenshot({ path: testInfo.outputPath(`${width}.png`), fullPage: true });
            }
        }
        if (entry.faqs.length) {
            const faq = page.locator(".faq-list details").first();
            await faq.locator("summary").click();
            await expect(faq.locator("p")).toBeVisible();
            await expect(faq.locator("p")).toHaveText(entry.faqs[0].answer);
        }
        if (entry.plans.some((plan) => plan.period === "year")) {
            await page.getByText("Yearly", { exact: true }).click();
            await expect(page.locator(".pricing-card:visible")).toHaveCount(entry.plans.filter((plan) => plan.period === "year").length);
            await expect(page.locator(".pricing-card:visible").first().locator(".price")).toContainText("/year");
            await page.getByRole("radio", { name: "Yearly", exact: true }).press("ArrowLeft");
            await expect(page.getByRole("radio", { name: "Monthly", exact: true })).toBeChecked();
        }
        expect(errors).toEqual([]);
    });
}
test("service content, billing and FAQ work without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("http://localhost:3100/web-hosting");
    await expect(page.locator(".pricing-card:visible").first().locator(".price")).toHaveText("৳99/month");
    await page.getByText("Yearly", { exact: true }).click();
    await expect(page.locator(".pricing-card:visible").first().locator(".price")).toHaveText("৳999/year");
    await page.locator(".faq-list summary").first().click();
    await expect(page.locator(".faq-list details").first().locator("p")).toBeVisible();
    await context.close();
});
test("internal navigation preserves the document and closes mobile menus", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.evaluate(() => document.documentElement.dataset.navigationMarker = "preserved");
    await page.getByLabel("Open navigation", { exact: true }).click();
    await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "BDIX Web Hosting", exact: true }).click();
    await expect(page).toHaveURL(/\/web-hosting$/);
    await expect(page.getByRole("navigation", { name: "Mobile navigation" })).not.toBeVisible();
    expect(await page.locator("html").getAttribute("data-navigation-marker")).toBe("preserved");
    await expect(page.locator('.desktop-nav a[href="/"]')).not.toHaveAttribute("aria-current", "page");
    await page.getByRole("navigation", { name: "Footer Web Hosting", exact: true }).getByRole("link", { name: "SG Web Hosting", exact: true }).click();
    await expect(page).toHaveURL(/\/sg-web-hosting$/);
    expect(await page.locator("html").getAttribute("data-navigation-marker")).toBe("preserved");
});
test("all local links target exported pages and unknown routes return 404", async ({ page, request }) => {
    await page.goto("/");
    const links = await page.locator('a[href^="/"]').evaluateAll((elements) => [...new Set(elements.map((el) => el.getAttribute("href")))]);
    for (const link of links)
        expect(link === "/" || publicPages.some((entry) => `/${entry.slug}` === link)).toBe(true);
    expect((await request.get("/not-a-public-page")).status()).toBe(404);
});
