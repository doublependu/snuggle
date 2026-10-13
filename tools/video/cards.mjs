// SPDX-License-Identifier: GPL-3.0-only
// Cards, captions and thumbnails for the videos, in the game's own look: rendered from HTML with Playwright, at
// the video's size, using the same colours, fonts and pictures as the game (the loading screen's cream and
// sleeping Bean, the in-game chapter card). Everything is a PNG; captions are transparent, to lay over footage.
//
//   kinds: title, spoiler, end (cream, like the loading screen), chapter (dark, like the game's chapter card),
//          caption (big words over footage), thumb (a frame from the game with words over it)
//
//   import { renderCards } from './cards.mjs'
//   await renderCards([{ kind: 'title', title: 'Snuggle Sorcery', sub: '…', out: 'a.png' }], { width: 1920, height: 1080 })
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const html = readFileSync(new URL('index.html', ROOT), 'utf8');
// the loading screen's sleeping Bean, as the game draws it
const BEAN = html.match(/<svg class="doudou"[\s\S]*?<\/svg>/)[0];
const VARS = html.match(/:root \{[^}]*\}/)[0];
const FONT = 'ui-rounded, "Nunito", "Segoe UI Rounded", "Hiragino Maru Gothic ProN", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const GAME_URL = 'sn0.maize.live';

const esc = (t = '') => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// **bold** and line breaks in card text
const rich = (t = '') => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');

function page(card, { width, height }) {
  const s = Math.min(width, height) / 1080; // sizes below are for 1080 lines
  const px = (n) => `${Math.round(n * s)}px`;
  const portrait = height > width;
  const cream = `background: radial-gradient(ellipse at 50% 38%, #fff7ea 0%, var(--cream) 55%, #e6cfae 100%);`;
  const base = `${VARS} *{box-sizing:border-box} html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;font-family:${FONT};color:var(--ink)}
    .doudou .z{opacity:.85}.doudou .z2{opacity:.6} h1 span{color:var(--orange)} b{color:var(--orange)}`;
  let css = '',
    body = '';
  switch (card.kind) {
    case 'title':
      css = `body{${cream}display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${px(18)};text-align:center}
        .doudou{width:${px(300)}} h1{margin:0;font-size:${px(110)};font-weight:800;letter-spacing:1px}
        .sub{margin:0;font-size:${px(40)};font-style:italic;opacity:.8;max-width:80%} .part{font-size:${px(30)};font-weight:800;letter-spacing:3px;color:var(--teal);text-transform:uppercase}`;
      body = `${BEAN}<h1>Snuggle <span>Sorcery</span></h1>${card.part ? `<div class="part">${esc(card.part)}</div>` : ''}${card.sub ? `<p class="sub">${rich(card.sub)}</p>` : ''}`;
      break;
    case 'spoiler':
      css = `body{${cream}display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${px(26)};text-align:center;padding:0 ${px(portrait ? 70 : 220)}}
        .tag{font-size:${px(34)};font-weight:800;letter-spacing:4px;color:#fff;background:var(--orange);padding:${px(10)} ${px(28)};border-radius:999px}
        p{margin:0;font-size:${px(44)};line-height:1.35} .url{font-size:${px(48)};font-weight:800;color:var(--teal)} .doudou{width:${px(170)}}`;
      body = `${BEAN}<div class="tag">SPOILER WARNING</div><p>${rich(card.text)}</p><div class="url">${esc(card.url || GAME_URL)}</div>`;
      break;
    case 'end':
      // the words sit high: the lower part of the screen is left for YouTube's end-screen elements
      css = `body{${cream}display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:${px(portrait ? 260 : 90)};gap:${px(14)};text-align:center}
        h1{margin:0;font-size:${px(78)};font-weight:800} .play{font-size:${px(40)};margin-top:${px(6)}} .url{font-size:${px(72)};font-weight:800;color:var(--teal)}
        .small{font-size:${px(30)};opacity:.8;line-height:1.5} .doudou{width:${px(150)};position:absolute;right:${px(60)};bottom:${px(40)}}`;
      body = `<h1>Snuggle <span>Sorcery</span></h1><div class="play">${rich(card.text || 'Free to play in your browser. No install, no account.')}</div><div class="url">${esc(card.url || GAME_URL)}</div>
        <div class="small">${rich(card.small || 'Open source: github.com/doublependu/snuggle\nMore at @RadWebGame')}</div>${BEAN}`;
      break;
    case 'chapter':
      // the in-game chapter card (src/ui/ui.css .card), full screen
      css = `body{background:radial-gradient(ellipse, #1d2a2cd0, #1d2a2cf8), #1d2a2c;color:var(--cream);display:grid;place-items:center;text-align:center;padding:0 ${px(140)}}
        h2{margin:0;font-size:${px(card.big ? 96 : 76)};font-weight:800;line-height:1.15} p{margin:${px(16)} 0 0;font-size:${px(40)};opacity:.85;font-style:italic;line-height:1.35}`;
      body = `<div><h2>${rich(card.title)}</h2>${card.sub ? `<p>${rich(card.sub)}</p>` : ''}</div>`;
      break;
    case 'caption': {
      // big words over footage, inside the platform's safe area (where: top | middle | bottom | low: above the
      // game's dialogue box and speech bubbles, for captions over gameplay)
      const where = card.where || 'bottom';
      const pad = portrait ? { top: 300, middle: 0, bottom: 560, low: 560 } : { top: 70, middle: 0, bottom: 110, low: 250 };
      const end = where === 'bottom' || where === 'low';
      css = `body{background:transparent;display:flex;flex-direction:column;align-items:center;justify-content:${where === 'top' ? 'flex-start' : where === 'middle' ? 'center' : 'flex-end'};
          padding:${where === 'top' ? px(pad.top) : 0} ${px(portrait ? 90 : 160)} ${end ? px(pad[where]) : 0};text-align:center}
        div{font-size:${px(card.size || (portrait ? 72 : 64))};font-weight:800;color:#fff;line-height:1.2;
          text-shadow:0 ${px(4)} ${px(14)} #000a, 0 0 ${px(3)} #000c;-webkit-text-stroke:${px(1)} #0006}
        div b{color:#ffd98a}`;
      body = `<div>${rich(card.text)}</div>`;
      break;
    }
    case 'thumb': {
      // (embedded: a page from setContent can't read files)
      const bg = card.image && existsSync(card.image) ? `url('data:image/${/png$/i.test(card.image) ? 'png' : 'jpeg'};base64,${readFileSync(card.image).toString('base64')}')` : '#1d2a2c';
      css = `body{background:${bg} center/cover;display:flex;flex-direction:column;justify-content:flex-end;padding:${px(48)}}
        .shade{position:absolute;inset:0;background:linear-gradient(0deg,#1d2a2ce6 0%,#1d2a2c55 45%,#0000 70%)}
        h1{position:relative;margin:0;font-size:${px(150)};font-weight:800;color:#fff;line-height:1;text-shadow:0 ${px(6)} ${px(20)} #000a}
        .sub{position:relative;font-size:${px(70)};font-weight:800;color:#ffd98a;margin-top:${px(12)};text-shadow:0 ${px(4)} ${px(14)} #000a}
        .tag{position:absolute;top:${px(40)};right:${px(40)};font-size:${px(56)};font-weight:800;color:#fff;background:var(--orange);padding:${px(10)} ${px(30)};border-radius:999px}`;
      body = `<div class="shade"></div>${card.tag ? `<div class="tag">${esc(card.tag)}</div>` : ''}<h1>${rich(card.title || 'Snuggle Sorcery')}</h1>${card.sub ? `<div class="sub">${rich(card.sub)}</div>` : ''}`;
      break;
    }
    default:
      throw new Error('unknown card kind: ' + card.kind);
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>${base}${css}</style></head><body>${body}</body></html>`;
}

// Render each card ({ kind, out, ...words }) to its PNG.
export async function renderCards(cards, { width = 1920, height = 1080 } = {}) {
  const executablePath = process.env.CHROME || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    for (const c of cards) {
      const w = c.width || width,
        h = c.height || height;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      const p = await ctx.newPage();
      await p.setContent(page(c, { width: w, height: h }), { waitUntil: 'load' });
      await p.screenshot({ path: c.out, omitBackground: c.kind === 'caption', type: 'png' });
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
}
