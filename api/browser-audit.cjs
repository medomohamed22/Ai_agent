const { chromium: playwright } = require('/vercel/sandbox/.aiway-tools/node_modules/playwright-core');
const chromium = require('/vercel/sandbox/.aiway-tools/node_modules/@sparticuz/chromium');
const fs = require('node:fs');
(async () => {
  const input = JSON.parse(Buffer.from(process.argv[1], 'base64url').toString());
  const output = { phase: 'launch', checks: [], pageErrors: [], consoleErrors: [], requestsFailed: [], viewport: input.viewport || { width: 390, height: 844 }, screenshotPath: '/vercel/sandbox/.aiway-tools/last-audit.jpg' };
  let browser;
  const check = (label, passed, details) => output.checks.push({ label, passed, details: String(details || '').slice(0, 250) });
  const bounded = (ms, fallback) => Math.min(Math.max(Number(ms) || fallback, 500), 10000);
  try {
    browser = await playwright.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true, timeout: 20000 });
    output.phase = 'navigate';
    // Avoid extra browser contexts on serverless Chromium builds that don't support them reliably.
    const page = await browser.newPage({ viewport: output.viewport });
    browser.on('disconnected', () => { output.browserDisconnected = true; });
    page.on('pageerror', error => output.pageErrors.push(String(error.message).slice(0, 500)));
    page.on('console', message => { if(message.type() === 'error') output.consoleErrors.push(message.text().slice(0, 500)); });
    page.on('requestfailed', request => output.requestsFailed.push({ url: request.url().slice(0, 150), reason: request.failure()?.errorText }));
    const response = await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: 12000 });
    check('HTTP response', input.url.startsWith('data:') || (!!response && response.ok()), response?.status() ?? (input.url.startsWith('data:')?'data url':'no response'));
    await page.waitForTimeout(500);
    output.phase = 'inspect';
    output.title = await page.title();
    output.url = page.url();
    const h = await page.locator('h1').first().textContent({ timeout: 1500 }).catch(() => '');
    output.heading = (h || '').slice(0, 120);
    const metrics = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth, viewportWidth: innerWidth,
      bodyText: (document.body?.innerText || '').slice(0, 900),
      buttons: [...document.querySelectorAll('button')].slice(0, 16).map(b => ({ label: (b.innerText || b.getAttribute('aria-label') || '').trim().slice(0, 70), disabled: b.disabled })),
      brokenImages: [...document.images].filter(i => !i.complete || i.naturalWidth === 0).length
    }));
    output.dom = metrics;
    check('No horizontal overflow', metrics.width <= metrics.viewportWidth + 3, `${metrics.width}px / ${metrics.viewportWidth}px`);
    check('Images load', metrics.brokenImages === 0, `${metrics.brokenImages} broken`);
    // Steps are supplied by the AI after it knows the app structure. Never click blindly.
    output.phase = 'interact';
    for(const [i, step] of (input.steps || []).entries()) {
      const label = `Interaction ${i + 1}: ${step.action} ${step.selector || step.text || ''}`;
      try {
        let target;
        if(step.selector) target = page.locator(step.selector).first();
        else if(step.text) target = page.getByText(step.text, { exact: false }).first();
        else throw Error('selector or text is required');
        const timeout = bounded(step.timeoutMs, 3500);
        if(step.action === 'click') await target.click({ timeout });
        else if(step.action === 'fill') await target.fill(step.value || '', { timeout });
        else if(step.action === 'check') await target.check({ timeout });
        else if(step.action === 'assertVisible') await target.waitFor({ state: 'visible', timeout });
        else if(step.action === 'assertText') {
          const actual = (await target.textContent({ timeout })) || '';
          if(!actual.includes(step.value || '')) throw Error(`Expected ${JSON.stringify(step.value)} in ${JSON.stringify(actual.slice(0, 120))}`);
        } else throw Error('Unsupported action');
        check(label, true, 'completed');
      } catch(e) { check(label, false, e.message); }
    }
    output.phase = 'screenshot';
    await page.screenshot({ path: output.screenshotPath, type: 'jpeg', quality: 45, animations: 'disabled', timeout: 8000 });
    output.screenshotCaptured = fs.existsSync(output.screenshotPath);
    check('JavaScript exceptions', output.pageErrors.length === 0, output.pageErrors.join('; '));
    output.ok = output.checks.every(c => c.passed);
    output.phase = 'verified';
  } catch(e) { output.ok = false; output.error = String(e.stack || e).slice(0, 2000); }
  finally { if(browser) await browser.close().catch(() => {}); }
  console.log('AIWAY_AUDIT_JSON:' + JSON.stringify(output));
  if(!output.ok) process.exitCode = 1;
})().catch(e => { console.log('AIWAY_AUDIT_JSON:' + JSON.stringify({ ok:false, phase:'fatal', error:String(e) })); process.exitCode=1; });
