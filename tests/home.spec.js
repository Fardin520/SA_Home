import { expect, test } from "@playwright/test";
for (const width of [390, 768, 1280, 1440]) {
    test(`homepage works at ${width}px`, async ({ page }, testInfo) => {
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/");
        await page.evaluate(() => document.fonts.ready);
        await expect(page.getByRole("heading", { level: 1 })).toContainText("Hosting without limits.");
        await expect(page.locator(".hero-image")).toBeVisible();
        expect(await page.locator(".hero-image").evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
        await expect(page.locator(".pricing-card")).toHaveCount(3);
        await expect(page.locator('a[href*="//"][href*="serveranywhere.net"], form[action*="//"][action*="serveranywhere.net"]')).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Client area", exact: true })).toBeDisabled();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath("homepage.png"), fullPage: true });
        const explorePlans = page.getByRole("link", { name: "Explore hosting plans", exact: true });
        for (let attempt = 0; attempt < 2; attempt++) {
            await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
            await explorePlans.click();
            await expect(page).toHaveURL(/#hosting-plans$/);
            await expect.poll(() => page.locator("#hosting-plans").evaluate((section) => Math.abs(section.getBoundingClientRect().top - 28))).toBeLessThan(5);
        }
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
        if (width < 901) {
            await page.getByLabel("Open navigation", { exact: true }).click();
            await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
            await expect(page.getByRole("navigation", { name: "Mobile navigation" }).getByText("AMD Ryzen VPS", { exact: true })).toHaveAttribute("href", "/amd-ryzen-vps");
            await page.getByLabel("Open navigation", { exact: true }).click();
            await expect(page.getByRole("navigation", { name: "Mobile navigation" })).not.toBeVisible();
        }
        else {
            const nav = page.getByRole("navigation", { name: "Main navigation", exact: true });
            await nav.getByText("Web Hosting", { exact: true }).click();
            await expect(nav.getByText("BDIX Web Hosting", { exact: true })).toBeVisible();
            await nav.getByText("VPS", { exact: true }).click();
            await expect(nav.getByText("BDIX Web Hosting", { exact: true })).not.toBeVisible();
            await expect(nav.getByText("AMD Ryzen VPS", { exact: true })).toBeVisible();
            await nav.getByText("VPS", { exact: true }).click();
        }
        await page.getByRole("button", { name: "Yearly", exact: true }).click();
        await expect(page.locator(".pricing-card").first().locator(".price")).toHaveText("৳999/year");
        await expect(page.locator(".pricing-card").first()).toContainText("1.5 Core CPU");
        await page.getByRole("button", { name: "Monthly", exact: true }).click();
        await expect(page.locator(".pricing-card").first().locator(".price")).toHaveText("৳99/month");
        const categories = [
            { name: "VPS hosting", price: "৳450/month" },
            { name: "RDP hosting", price: "৳599/month" },
            { name: "Dedicated servers", price: "৳8,000/month" },
        ];
        for (const category of categories) {
            await page.getByRole("tab", { name: category.name, exact: true }).click();
            await expect(page.locator(".pricing-card").first().locator(".price")).toHaveText(category.price);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        }
        await page.getByRole("tab", { name: "Web hosting", exact: true }).click();
        await page.getByRole("tab", { name: "Web hosting", exact: true }).press("ArrowRight");
        await expect(page.getByRole("tab", { name: "VPS hosting", exact: true })).toBeFocused();
        await page.getByRole("tab", { name: "VPS hosting", exact: true }).press("Home");
        await expect(page.getByRole("tab", { name: "Web hosting", exact: true })).toBeFocused();
        expect(errors).toEqual([]);
    });
}
test("local links resolve and reduced motion is respected", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const links = await page.locator('a[href^="/"]').evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute("href")));
    expect(links.every((href) => href && !href.startsWith("//"))).toBe(true);
    const anchors = await page.locator('a[href^="#"]').evaluateAll((elements) => elements.map((element) => element.getAttribute("href")?.slice(1)));
    for (const anchor of anchors)
        await expect(page.locator(`[id="${anchor}"]`)).toHaveCount(1);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
});
