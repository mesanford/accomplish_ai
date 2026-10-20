// Renders profile.html and cover.html to forthright-profile.png and forthright-cover.png at Facebook's sizes.
// From trailhead/: NODE_PATH=app/node_modules node marketing/facebook/render.cjs
const { chromium } = require('@playwright/test');
const path = require('path');
(async () => {
  const dir = __dirname;
  const b = await chromium.launch();
  for (const [name, w, h] of [['profile', 1080, 1080], ['cover', 1640, 856]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto('file://' + path.join(dir, name + '.html'));
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(dir, `forthright-${name}.png`) });
  }
  await b.close();
})();
