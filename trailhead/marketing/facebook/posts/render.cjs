// Renders one 1080x1350 image per entry in posts.json, from post.html.
// From trailhead/: NODE_PATH=app/node_modules node marketing/facebook/posts/render.cjs
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

(async () => {
  const posts = JSON.parse(fs.readFileSync(path.join(__dirname, 'posts.json'), 'utf8'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  for (const post of posts) {
    await page.goto('file://' + path.join(__dirname, 'post.html') + '#' + encodeURIComponent(JSON.stringify(post)));
    await page.reload(); // a hash-only change doesn't reload the page, so the script would not run again
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(__dirname, `${post.file}.png`) });
  }
  await browser.close();
})();
