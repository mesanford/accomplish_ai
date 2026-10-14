// Fetch official merit badge requirement text from scouting.org via the user's Chrome.
// Run from trailhead/app:  node ../scripts/fetch_badge_requirements.mjs [awardId ...]
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolve Playwright from the cwd (trailhead/app) so the script can live outside app/.
const { chromium } = createRequire(path.join(process.cwd(), 'noop.js'))('@playwright/test')
const here = path.dirname(fileURLToPath(import.meta.url))
const CATALOG = path.join(here, '../functions/trailhead_core/content/merit_badges.json')
const OUT = path.join(here, '../app/public/requirements')
fs.mkdirSync(OUT, { recursive: true })
const BASE = 'https://www.scouting.org/merit-badges/'
const LIST = 'https://www.scouting.org/skills/merit-badges/all/'
const SLUG_OVERRIDES = {
  'fish-and-wildlife-management': 'fish-wildlife-management',
  woodcarving: 'wood-carving',
}
const NON_BADGE = new Set(['digital-resource-guides', 'all', 'eagle-required', 'counselor-information', 'featured-career-partners', 'tips-guides', 'test-lab'])
const today = new Date().toISOString().slice(0, 10)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Runs in the page. Returns { note, items } where items are raw nested nodes {label,text,resources,children}.
function extractPage() {
  const clean = (s) => s.replace(/\s+/g, ' ').trim()
  const parseLabel = (t) => {
    const m = t.match(/^(\(?[0-9]+\)?\.?|\([a-zA-Z0-9]+\)|[a-zA-Z]\.)\s+/)
    return m ? { label: m[1], rest: t.slice(m[0].length) } : { label: '', rest: t }
  }
  // Extract own text + resources from an element, excluding nested lists.
  const own = (el) => {
    const c = el.cloneNode(true)
    c.querySelectorAll('ul, ol').forEach((u) => u.remove())
    c.querySelectorAll('.mb-requirement-listnumber').forEach((u) => u.remove())
    const resources = []
    // Split at "Resources:" marker
    let html = c.innerHTML
    const idx = html.search(/(<[^>]+>\s*)*Resources?\s*:/i)
    let resHtml = ''
    if (idx >= 0) {
      resHtml = html.slice(idx)
      html = html.slice(0, idx)
    }
    const tmp = document.createElement('div')
    tmp.innerHTML = html
    // Links in the main text stay as plain text; links after Resources become resources.
    const rtmp = document.createElement('div')
    rtmp.innerHTML = resHtml
    rtmp.querySelectorAll('a[href]').forEach((a) => {
      resources.push({ title: clean(a.textContent), url: a.href })
    })
    // Also treat anchors on their own <br>-separated lines after the first as resources if no marker
    return { text: clean(tmp.textContent), resources }
  }
  const walkList = (ul) => {
    const out = []
    ul.querySelectorAll(':scope > li').forEach((li) => {
      const o = own(li)
      const { label, rest } = parseLabel(o.text)
      const sub = li.querySelector(':scope > ul, :scope > ol')
      out.push({ label, text: rest, resources: o.resources, children: sub ? walkList(sub) : [] })
    })
    return out
  }
  const items = []
  const notes = []
  document.querySelectorAll('.mb-requirement-container .mb-requirement-item').forEach((item) => {
    const parent = item.querySelector('.mb-requirement-parent')
    if (!parent) return
    const numEl = parent.querySelector('.mb-requirement-listnumber')
    const num = clean(numEl ? numEl.textContent : '')
    const o = own(parent)
    const list = item.querySelector(':scope > ul, :scope > ol')
    const children = list ? walkList(list) : []
    if (!num) {
      if (/^NOTE/i.test(o.text) || (!children.length && o.text)) {
        notes.push(o.text)
        return
      }
      items.push({ label: '', text: o.text, resources: o.resources, children })
      return
    }
    items.push({ label: num, text: o.text, resources: o.resources, children })
  })
  return { notes, items }
}

// The site renders some structure flat (every "(a)", "(1)" in one <ul>). Rebuild it:
//  - an unlabeled "Option A—..." heading owns the siblings that follow it, until the next heading;
//  - within a list, "(a)" / "(1)" / "(i)" runs are nested by sequence: a run starting at a/1/i opens a
//    new level under the previous item; a continuation (b after a, 2 after 1) returns to its level.
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x']
function kindOf(label, stack) {
  let m = label.match(/^\((\d+)\)$/)
  if (m) return { kind: 'n', val: Number(m[1]) }
  m = label.match(/^\(([a-z]+)\)$/)
  if (!m) return null
  const roman = ROMAN.indexOf(m[1]) + 1
  const letterVal = m[1].length === 1 ? m[1].charCodeAt(0) - 96 : 0
  const asLetterContinues = stack.some((l) => l.kind === 'l' && l.last + 1 === letterVal)
  if (roman && !(letterVal && (asLetterContinues || letterVal === 1))) return { kind: 'r', val: roman }
  return letterVal ? { kind: 'l', val: letterVal } : null
}
function nest(items) {
  const groups = []
  let head = null
  let sub = null
  for (const it of items) {
    // "(5)(a) Corn": a sub-heading that belongs under item (5) of the current Option group.
    const combo = !it.label && head && it.text.match(/^\((\d+)\)\(([a-z])\)\s+(.*)$/)
    const owner = combo && head.children.find((c) => c.label === `(${combo[1]})`)
    if (owner) {
      it.label = `(${combo[1]})(${combo[2]})`
      it.text = combo[3]
      owner.children.push(it)
      sub = it
    } else if (!it.label && !it.children.length && items.some((x) => x !== it && x.label)) {
      head = it
      sub = null
      groups.push(it)
    } else if (sub) {
      sub.children.push(it)
    } else if (head) {
      head.children.push(it)
    } else {
      groups.push(it)
    }
  }
  const out = []
  let stack = []
  let lastNode = null
  for (const it of groups) {
    const k = kindOf(it.label, stack)
    if (!k) {
      stack = []
      lastNode = it
      out.push(it)
      continue
    }
    let idx = -1
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].kind === k.kind && stack[i].last + 1 === k.val) { idx = i; break }
    }
    const top = stack[stack.length - 1]
    if (idx >= 0) {
      stack.length = idx + 1
      stack[idx].list.push(it)
      stack[idx].last = k.val
    } else if (!top) {
      stack.push({ kind: k.kind, last: k.val, list: out })
      out.push(it)
    } else if (k.val === 1 && top.kind !== k.kind && lastNode) {
      stack.push({ kind: k.kind, last: 1, list: lastNode.children })
      lastNode.children.push(it)
    } else {
      let j = stack.length - 1
      while (j > 0 && stack[j].kind !== k.kind) j--
      stack.length = j + 1
      stack[j].kind = k.kind
      stack[j].list.push(it)
      stack[j].last = k.val
    }
    lastNode = it
  }
  out.forEach((it) => { it.children = nest(it.children) })
  return out
}
const norm = (label) => label.replace(/[().\s]/g, '')

function buildIds(items, parentId, seen, depth) {
  return items.map((it, i) => {
    let base = norm(it.label)
    const combo = it.label.match(/^\(\d+\)\(([a-z])\)$/)
    if (combo) base = combo[1]
    if (!it.label) {
      // Unlabeled heading such as "Option A—Beef Cattle. Do ALL of the following:"
      const m = it.text.match(/^(Option\s+([A-Z0-9]+))\s*[—–:-]\s*(.*)$/i)
      if (m) {
        it.label = m[1]
        it.text = m[3]
        base = `-${m[2].toUpperCase()}`
      } else {
        base = `-h${i + 1}`
      }
    }
    const isHeading = base.startsWith('-')
    let id
    if (!parentId) id = base
    else if (isHeading) id = parentId + base
    else if (/^\d+$/.test(base)) id = `${parentId}(${base})`
    else if (depth === 1 || combo) id = parentId + base.toLowerCase()
    else id = `${parentId}(${base.toLowerCase()})`
    let uniq = id, n = 2
    while (seen.has(uniq)) uniq = `${id}-${n++}`
    seen.add(uniq)
    return {
      id: uniq,
      label: it.label || '',
      text: it.text,
      resources: it.resources,
      children: buildIds(it.children, uniq, seen, isHeading ? 1 : depth + 1),
    }
  })
}
const countAll = (rs) => rs.reduce((n, r) => n + 1 + countAll(r.children), 0)

const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8')).badges
const wanted = process.argv.slice(2)
const targets = wanted.length ? catalog.filter((b) => wanted.includes(b.id)) : catalog
const missingArg = wanted.filter((w) => !catalog.some((b) => b.id === w))
if (missingArg.length) console.log('Unknown ids:', missingArg.join(', '))

const browser = await chromium.launch({ channel: 'chrome', headless: false })
const page = await browser.newPage()
const summary = []
const failures = []
try {
  await page.goto(LIST, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(3000)
  // The list may lazy-load; scroll to bottom a few times.
  for (let i = 0; i < 15; i++) { await page.mouse.wheel(0, 6000); await sleep(400) }
  const slugs = new Set(await page.evaluate(() => [...document.querySelectorAll('a[href*="/merit-badges/"]')]
    .map((a) => (a.getAttribute('href').match(/\/merit-badges\/([^/?#]+)\/?/) || [])[1]).filter(Boolean)))
  for (const s of NON_BADGE) slugs.delete(s)
  console.log(`All-badges page lists ${slugs.size} badge slugs`)
  const used = new Set()
  const mismatches = []
  for (const b of targets) {
    const slug = SLUG_OVERRIDES[b.id] || b.id
    used.add(slug)
    if (!slugs.has(slug)) mismatches.push(`${b.id} -> ${slug} (not on list page)`)
  }
  if (!wanted.length) {
    console.log('Slugs on site not in catalog:', [...slugs].filter((s) => !used.has(s)).join(', ') || 'none')
  }
  console.log('Catalog ids with no site slug:', mismatches.join('; ') || 'none')

  for (const b of targets) {
    const slug = SLUG_OVERRIDES[b.id] || b.id
    const url = `${BASE}${slug}/`
    try {
      for (let attempt = 1; ; attempt++) {
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
          break
        } catch (e) {
          if (attempt >= 3) throw e
          await sleep(5000) // scouting.org occasionally stalls; retry politely
        }
      }
      await page.waitForSelector('.mb-requirement-item', { timeout: 20000 })
      const raw = await page.evaluate(extractPage)
      const requirements = buildIds(nest(raw.items), '', new Set(), 0)
      if (!requirements.length) throw new Error('no requirements parsed')
      const name = (await page.evaluate(() => (document.querySelector('h1')?.textContent || '').trim())) || b.name
      const doc = { awardId: b.id, name: b.name, kind: 'merit_badge', sourceUrl: url, fetchedAt: today }
      // Drop the site's boilerplate about resource guides/pamphlets; keep any real note.
      const note = raw.notes
        .map((n) => n.replace(/NOTE:\s*/i, '').replace(/Check out the Digital Resource Guide[^!]*!/gi, '').replace(/The official merit badge pamphlets are now free[^.]*\./gi, '').trim())
        .filter(Boolean)
        .join(' ')
      if (note) doc.note = note.slice(0, 600)
      doc.requirements = requirements
      fs.writeFileSync(path.join(OUT, `${b.id}.json`), JSON.stringify(doc, null, 2) + '\n')
      summary.push({ id: b.id, name: b.name, count: requirements.length, total: countAll(requirements), url, h1: name })
      console.log(`${b.id}: ${requirements.length} top-level, ${countAll(requirements)} total`)
    } catch (e) {
      failures.push(`${b.id} (${url}): ${e.message}`)
      console.log(`FAILED ${b.id}: ${e.message}`)
    }
    await sleep(1000 + Math.random() * 1000)
  }
} finally {
  await browser.close()
}

// Merge into index.json (awards sorted by id).
const idxPath = path.join(OUT, 'index.json')
let idx = { fetchedAt: today, attribution: 'Requirements © Scouting America. Shown from scouting.org for troop use.', awards: {} }
if (fs.existsSync(idxPath)) idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'))
idx.fetchedAt = today
for (const s of summary) idx.awards[s.id] = { name: s.name, kind: 'merit_badge', count: s.count, sourceUrl: s.url }
idx.awards = Object.fromEntries(Object.entries(idx.awards).sort(([a], [b]) => (a < b ? -1 : 1)))
fs.writeFileSync(idxPath, JSON.stringify(idx, null, 2) + '\n')

console.log(`\nFetched ${summary.length}/${targets.length}. Failures: ${failures.length}`)
failures.forEach((f) => console.log('  ' + f))
const odd = summary.filter((s) => s.count < 2)
if (odd.length) console.log('Few requirements (check):', odd.map((s) => `${s.id}=${s.count}`).join(', '))
