// Render the front page to a single PNG: build the HTML, hand it to Chrome headless, keep the shot.
//
// The judge sees exactly the bytes in the file, at most 1024 by 1024 and at most 1 MiB, so the page is
// laid out at 1024x1024 and screenshotted at that size. Everything is inline: no network, no webfonts,
// no images — the composition has to survive the grader's no-network sandbox.

import { writeFileSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { DAY, LEADS, STORIES, TICKER, DATE_CHECK, FOOTER } from './data.mjs';

const CHROME =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const lead = (l) => `
  <article class="lead">
    <div class="lead-kicker"><span class="num">${l.no}</span><span>${esc(l.kicker)}</span><span class="tag">${esc(l.tag)}</span></div>
    <h2>${esc(l.title)}</h2>
    <p>${esc(l.body)}</p>
    <div class="src">${esc(l.source)}</div>
  </article>`;

const brief = (s) => `
  <article class="brief">
    <div class="brief-kicker"><span class="num sm">${s.no}</span><span>${esc(s.kicker)}</span></div>
    <h3>${esc(s.title)}</h3>
    <p>${esc(s.body)}</p>
    <div class="src">${esc(s.source)}</div>
  </article>`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1024px; height: 1024px; overflow: hidden; }
  body {
    background: #f4efe4; color: #12233d;
    font-family: Georgia, "Times New Roman", serif;
    -webkit-font-smoothing: antialiased;
    padding: 14px 18px 12px;
    display: flex; flex-direction: column;
  }
  .masthead {
    display: flex; justify-content: space-between; align-items: baseline;
    border-bottom: 3px solid #12233d; padding-bottom: 5px;
    font-family: "Segoe UI", Arial, sans-serif; font-weight: 700;
    font-size: 10px; letter-spacing: .17em; text-transform: uppercase;
  }
  .masthead .right { font-weight: 600; letter-spacing: .1em; color: #4a5a72; font-size: 9px; }
  h1 {
    font-size: 54px; line-height: 1; letter-spacing: -.022em; font-weight: 700;
    margin: 7px 0 5px; text-align: center; white-space: nowrap;
  }
  .standfirst {
    font-style: italic; font-size: 12.5px; text-align: center; color: #2c3c56;
    margin: 0 0 7px;
  }
  .ticker {
    display: flex; border-top: 2.5px solid #12233d; border-bottom: 2.5px solid #12233d;
    background: #ece4d4; margin-bottom: 11px;
  }
  .tick { flex: 1; padding: 6px 4px; text-align: center; border-right: 1px solid #c3b79f; }
  .tick:last-child { border-right: 0; }
  .tick b { display: block; font-size: 19px; line-height: 1; letter-spacing: -.012em; }
  .tick span {
    display: block; font-family: "Segoe UI", Arial, sans-serif; font-size: 7.4px;
    letter-spacing: .05em; text-transform: uppercase; color: #4a5a72; margin-top: 3px;
    line-height: 1.15;
  }
  .leads { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 13px; margin-bottom: 10px; }
  .lead { border-top: 4px solid #8c1d1d; padding-top: 6px; display: flex; flex-direction: column; }
  .lead-kicker {
    font-family: "Segoe UI", Arial, sans-serif; font-size: 9px; font-weight: 700;
    letter-spacing: .1em; text-transform: uppercase; color: #8c1d1d;
    display: flex; align-items: center; gap: 6px; margin-bottom: 5px;
  }
  .num {
    display: inline-flex; align-items: center; justify-content: center;
    width: 17px; height: 17px; border-radius: 50%; background: #8c1d1d; color: #f4efe4;
    font-size: 10px; font-weight: 700; letter-spacing: 0; flex: none;
  }
  .num.sm { width: 13px; height: 13px; font-size: 8px; background: #4a5a72; }
  .tag { margin-left: auto; font-size: 7px; letter-spacing: .08em; color: #7b6f59; font-weight: 600; }
  .lead h2 { font-size: 19px; line-height: 1.06; letter-spacing: -.014em; margin-bottom: 5px; }
  .lead p { font-size: 10.8px; line-height: 1.33; color: #24334b; }
  .src {
    font-family: "Segoe UI", Arial, sans-serif; font-size: 7.4px; letter-spacing: .045em;
    color: #7b6f59; margin-top: auto; padding-top: 5px; text-transform: uppercase;
  }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 15px; flex: 1; align-content: start; }
  .brief { border-top: 1.5px solid #b9ad95; padding-top: 6px; display: flex; flex-direction: column; }
  .brief-kicker {
    font-family: "Segoe UI", Arial, sans-serif; font-size: 8px; font-weight: 700;
    letter-spacing: .075em; text-transform: uppercase; color: #4a5a72;
    display: flex; align-items: center; gap: 5px; margin-bottom: 4px;
  }
  .brief h3 { font-size: 13px; line-height: 1.1; letter-spacing: -.01em; margin-bottom: 4px; }
  .brief p { font-size: 9.6px; line-height: 1.32; color: #33415a; }
  .brief .src { font-size: 7px; padding-top: 4px; }
  .check {
    margin-top: auto; border: 2px solid #8c1d1d; padding: 8px 11px;
    background: #f0e7d6; display: flex; gap: 14px;
  }
  .check h4 {
    font-family: "Segoe UI", Arial, sans-serif; font-size: 9px; font-weight: 800;
    letter-spacing: .1em; text-transform: uppercase; color: #8c1d1d;
    white-space: nowrap; padding-top: 2px;
  }
  .check .kept { font-size: 9.4px; line-height: 1.3; color: #12233d; margin-bottom: 3px; }
  .check ul { list-style: none; }
  .check li { font-size: 8.2px; line-height: 1.3; color: #4a5a72; }
  .check li::before { content: "\\2715  "; color: #8c1d1d; font-weight: 700; }
  footer {
    margin-top: 7px; border-top: 2.5px solid #12233d; padding-top: 5px;
    display: flex; justify-content: space-between; gap: 16px;
    font-family: "Segoe UI", Arial, sans-serif;
  }
  footer .rule { font-size: 8.4px; color: #8c1d1d; font-weight: 700; letter-spacing: .04em; }
  footer .sources { font-size: 7px; color: #7b6f59; letter-spacing: .03em; text-align: right; }
</style></head>
<body>
  <div class="masthead">
    <div>THE WORLD IN ONE DAY</div>
    <div class="right">${DAY.stories} STORIES &middot; ${DAY.regions} REGIONS &middot; ALL FROM THIS ONE DAY</div>
  </div>

  <h1>${DAY.weekday} ${DAY.date}</h1>
  <div class="standfirst">
    Three leaders meet in Shenzhen &middot; A court finds genocide in Myanmar &middot; The largest IPO ever debuts
  </div>

  <div class="ticker">
    ${TICKER.map((t) => `<div class="tick"><b>${esc(t.value)}</b><span>${esc(t.label)}</span></div>`).join('')}
  </div>

  <div class="leads">${LEADS.map(lead).join('')}</div>

  <div class="grid">${STORIES.map(brief).join('')}</div>

  <div class="check">
    <h4>Date check</h4>
    <div>
      <div class="kept">&#10003; ${esc(DATE_CHECK.kept)}</div>
      <ul>${DATE_CHECK.dropped.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
    </div>
  </div>

  <footer>
    <div class="rule">${esc(FOOTER.rule)}</div>
    <div class="sources">${esc(FOOTER.sources)}</div>
  </footer>
</body></html>`;

const out = process.argv[2] ?? 'entry.png';
const dir = mkdtempSync(join(tmpdir(), 'ni-render-'));
const page = join(dir, 'page.html');
const shot = join(dir, 'shot.png');
writeFileSync(page, html, 'utf8');

execFileSync(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=1024,1024',
    '--screenshot=' + shot,
    '--no-sandbox',
    '--virtual-time-budget=2000',
    pathToFileURL(page).href,
  ],
  { stdio: 'ignore' }
);

copyFileSync(shot, out);
rmSync(dir, { recursive: true, force: true });
console.log('wrote', out);
