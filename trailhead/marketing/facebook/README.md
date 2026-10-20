# Facebook page graphics

Images for the Forthright Facebook page ("Forthright - Scout Troop App"), in the site's colors, fonts and trail map.

| File                     | Size      | Used as         |
| ------------------------ | --------- | --------------- |
| `forthright-profile.png` | 1080×1080 | Profile picture |
| `forthright-cover.png`   | 1640×856  | Cover photo     |

Each PNG is rendered from the HTML file of the same name (`profile.html`, `cover.html`) with the app's Playwright
Chromium. To change one, edit the HTML and run, from `trailhead/`:

```bash
NODE_PATH=app/node_modules node marketing/facebook/render.cjs
```

The cover loads its fonts from Google Fonts, so render it online. Facebook crops the cover's top and bottom on desktop
and its sides on mobile; keep text inside the middle band (roughly 120 px from the top and bottom).
