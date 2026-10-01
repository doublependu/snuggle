// SPDX-License-Identifier: GPL-3.0-only
// The autoplayer's eyes (and ears): runs inside the page and reports what a player could see and hear right
// now, and nothing else. It is the only part of tools/playtest that touches the game (window.__G, dev builds).
//
// What it reports:
//  - the UI as it is on screen (objective, dialogue, prompts, toasts, cards, menus, mini-game panels, HUD)
//  - things in view: inside the camera's view, not hidden behind a wall, and big enough to notice. Each is
//    described by how it looks ("an old lady with glasses and a cardigan"), never by its id or name; names
//    come from dialogue. Its position is included so the player can remember where it saw things.
//  - what's in front of her: how far to the nearest wall in each direction across the view, and drops
//  - her own movement, and where the camera points (a player knows where they are and where they look)
//  - the lullaby's beat (you can hear it)
// It never reports story flags, the save, triggers, colliders, or anything out of sight.
//
// Injected with page.addInitScript(`(${installEyes})()`): no imports, and three's classes are borrowed from
// the game's own objects.

export function installEyes() {
  // ---------------------------------------------------------------- how things look
  const PEOPLE = {
    fang: 'an old lady with round glasses, a flat cap and an orange cardigan',
    tangtang: 'a girl in a teal beret',
    weibao: 'a boy in an orange cap with a white goose puppet on his hand',
    folk_a: 'someone in a purple top and a shawl',
    folk_b: 'someone in a blue top with a sash',
    folk_c: 'a tall person in a green top and a hat',
    folk_kid: 'a small child in an orange top',
  };
  // what someone is doing, when you can tell by looking
  const ROLE = {
    station: { tangtang: ' holding a big sign' },
    market: { lanternseller: ' behind a lantern stall', toyseller: ' behind a toy stall', chestnut: ' at a chestnut cart with a wok', musician: ' playing an erhu', dumpling: ' behind a dumpling stall' },
    quiet: { ferryman: ' by a small ferry boat', barber: ' in a barber shop doorway', noodle: ' at a noodle stall', oldman: ' sitting alone on a stool' },
  };
  const CREATURES = {
    cloud: 'a little grey rain cloud with a face',
    sock: 'a striped sock with a face',
    homework: 'a crumpled page of homework with a face',
    pompom: 'a fluffy pom-pom with a face',
    sparrow: 'a small round sparrow with big eyes',
    grey: 'a heavy grey blanket-lump with a face',
    doudou: 'a little bun with ears',
  };
  // kit pieces, as you'd describe them
  const PLACES = {
    gate: ['the big front gate of the Academy', 3],
    wall: ['a white wall', 2],
    hall: ['a big hall with a tiled roof', 5],
    hall_open: ['an open-fronted hall with a stove and a table: a kitchen', 5],
    hall_small: ['a small hall with a tiled roof', 4],
    pavilion: ['an open pavilion with benches', 3],
    pagoda: ['a pagoda up on the hill', 3],
    library: ['a two-storey building with an outside staircase: a library', 5],
    moongate: ['a white wall with a round moon gate', 2],
    bridge: ['an arched stone bridge over the stream', 4],
    rack: ['a laundry rack with washing hanging on it', 2],
    basket: ['a laundry basket', 1],
    railing: ['a railing at the edge of the harbour overlook', 2],
    bench: ['a bench', 1],
    stone_lantern: ['a stone lantern', 0.6],
    lamp_post: ['a lamp post', 0.4],
    canopy: ['a platform canopy', 3],
    stall: ['a market stall', 2],
    train_shell: ['a train', 8],
    stove: ['a stove', 1],
    table: ['a table', 1],
    shelf: ['a shelf', 1],
    stairs: ['stone stairs', 2],
    // the night market
    mstall_lantern: ['a lantern stall', 2],
    mstall_toy: ['a toy stall with pinwheels', 2],
    mstall_sweets: ['a sweets stall', 2],
    mstall_tea: ['a tea stall', 2],
    mstall_fish: ['a fishball stall', 2],
    mdumpling: ['a dumpling stall with bamboo steamers', 2],
    mcart: ['a chestnut cart with a wok', 1.5],
    stage: ['a little stage', 2],
    facade_a: ['a shopfront', 3],
    facade_b: ['a shopfront', 3],
    lantern_post: ['a lantern post', 0.4],
    lantern_string: ['a string of lanterns', 3],
    boat: ['a boat moored at the pier', 2],
    bollard: ['a bollard on the pier', 0.4],
    crate: ['a crate', 0.6],
    stool: ['a stool', 0.4],
    bench_m: ['a bench', 1],
    // the Quiet District
    qshop_a: ['a shuttered shop', 3],
    qshop_b: ['a shuttered shop', 3],
    qshop_c: ['a shuttered shop', 3],
    qhouse_a: ['an old house', 3],
    qhouse_b: ['an old house', 3],
    dead_post: ['an unlit lantern post', 0.4],
    dead_string: ['a string of unlit lanterns', 3],
    planter: ['a planter', 0.6],
  };
  // features you can see that aren't kit pieces: [zone, marker name pattern, looks, radius]
  const FEATURES = [
    ['station', /^TRIGGER_academy$/, 'the top of the path up the hill, toward the Academy', 4],
    ['academy', /^POINT_tag$/, 'Charm Sprites playing tag in the courtyard', 3],
    ['academy', /^POINT_fang_court$/, 'the middle of the courtyard', 4],
    ['academy', /^NPC_player1$/, 'students playing ball on the practice field', 5],
    ['academy', /^POINT_overlook$/, 'the harbour overlook, a railing above the bay', 3],
    ['academy', /^POINT_bigtree$/, 'a big tree in the courtyard', 2],
    ['market', /^TRIGGER_academy$/, 'stairs going up the hill, toward the Academy', 3],
    ['market', /^POINT_launch$/, 'the very end of the pier, over the water', 2],
    ['market', /^POINT_hook$/, 'the harbour wall at the end of the promenade, looking across the bay', 3],
    ['quiet', /^TRIGGER_fogwall$/, 'a thick wall of fog at the end of the street', 5],
    ['quiet', /^POINT_banyan$/, 'a huge banyan tree in a square', 3],
    ['quiet', /^POINT_ferry$/, 'the ferry jetty', 3],
  ];
  const INTERACT = {
    'Tuck in the sleepy sprite': 'a sleepy little creature curled up',
    'Read the note': 'a note pinned to a post',
    'Sit with them': 'a stool with sparrows fluttering around it',
    'Look closer': 'a faint glow',
    'Float lanterns': 'paper lanterns stacked at the end of the pier',
    'Sit down': 'a bench',
    'Look at the lotus buds': 'drooping lotus buds in the pond',
    'Water the lotus buds': 'drooping lotus buds in the pond',
  };
  const HAZARD = { 0x8fc3e8: 'a rain ring on the ground', 0x4a3428: 'a shadow on the ground where something will land', 0xb69ccf: 'a sighing ripple', 0x9aa6bf: 'a grey ripple' };

  // ---------------------------------------------------------------- sensing
  const keys = new Map(); // object -> opaque key, so the player can keep track of what it saw
  let nextKey = 1;
  const keyOf = (o) => {
    if (!keys.has(o)) keys.set(o, 'k' + nextKey++);
    return keys.get(o);
  };
  const beats = []; // times the hum ring or a mini-game pulse was seen to pulse
  let V3, v, w;
  const seeBeats = () => {
    // the soothe ring's pulse and the lanterns' pulse restart their animation on each beat
    const mo = new MutationObserver((list) => {
      for (const m of list) if (m.target.classList?.contains('beat')) beats.push(performance.now());
      while (beats.length > 16) beats.shift();
    });
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  };
  addEventListener('DOMContentLoaded', seeBeats);

  const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  const shown = (el) => !!el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && el.getClientRects().length > 0;

  function ui() {
    const q = (s) => document.querySelector(s);
    const out = {};
    const loading = q('#loading');
    out.loading = loading && !loading.classList.contains('gone') ? { begin: !q('#begin')?.disabled, status: text(q('#status')) } : null;
    out.objective = text(q('.objective'));
    const dlg = q('.dialogue');
    if (dlg?.classList.contains('show')) {
      const who = q('.dialogue .who');
      const choices = [...document.querySelectorAll('.dialogue .choices button')].map(text);
      out.dialogue = { who: shown(who) ? text(who) : '', text: text(q('.dialogue .text')), typed: shown(q('.dialogue .more')) || choices.length > 0, choices, memory: dlg.classList.contains('memory') };
    }
    const pr = q('.prompt');
    if (pr && pr.innerHTML) out.prompt = { key: text(pr.querySelector('.key')), label: text(pr).replace(text(pr.querySelector('.key')), '').trim() };
    out.toasts = [...document.querySelectorAll('.toasts .toast')].map(text);
    const card = q('.card');
    if (card?.classList.contains('show')) out.card = { title: text(card.querySelector('h2')), sub: text(card.querySelector('p')) };
    out.fade = !!q('.fade')?.classList.contains('on');
    const so = q('.soothe');
    if (so && !so.classList.contains('off')) {
      const off = parseFloat(q('.soothe .prog')?.style.strokeDashoffset || '207.3');
      out.ring = { progress: +(1 - off / 207.3).toFixed(3), calm: document.querySelectorAll('.soothe .calm i:not(.gone)').length, feeling: text(q('.soothe .feel')), label: text(q('.soothe .label')), company: so.classList.contains('company') };
    }
    out.goodChips = [...document.querySelectorAll('.goodchip')].map((b) => ({ text: text(b), selected: b.classList.contains('sel') }));
    const menu = [...document.querySelectorAll('.menu')].find((m) => shown(m));
    if (menu) out.menu = { id: menu.id.replace('menu-', ''), title: text(menu.querySelector('h2')), text: text(menu), buttons: [...menu.querySelectorAll('button')].filter(shown).map(text) };
    const cook = q('.cook');
    if (cook) {
      const mark = cook.querySelector('.mark');
      const zones = [...cook.querySelectorAll('.meter .zone')].map((z) => [parseFloat(z.style.left) / 100, (parseFloat(z.style.left) + parseFloat(z.style.width)) / 100]);
      out.panel = {
        kind: cook.classList.contains('nuts') ? 'chestnuts' : cook.classList.contains('lanterns') ? 'lanterns' : 'cooking',
        title: text(cook.querySelector('h3')),
        text: text(cook),
        mark: mark ? parseFloat(mark.style.left) / 100 : null,
        zone: zones.find((_, i) => i === 0) || null,
        perfect: zones[1] || null,
        nuts: [...cook.querySelectorAll('.nut')].map((b) => ({ gold: b.classList.contains('gold'), out: b.classList.contains('out'), hot: b.classList.contains('hot') })),
        result: text(cook.querySelector('.res')),
      };
    }
    const hud = q('.hud-tl');
    if (hud) out.hud = { cozy: +text(q('.cozy b')) || 0, chips: [...document.querySelectorAll('.chips .chip')].map(text).filter(Boolean) };
    out.helper = text(q('.helper'));
    out.bubbles = [...document.querySelectorAll('.bubble')].filter((b) => +(b.style.opacity || 1) > 0.2).map((b) => ({ text: text(b), x: parseFloat(b.style.left) / innerWidth, y: parseFloat(b.style.top) / innerHeight }));
    out.floaties = [...document.querySelectorAll('.floaty')].map(text);
    out.combo = [...document.querySelectorAll('.combo')].map(text).join(' ');
    return out;
  }

  // Is a world point on screen, and not behind a wall? Returns screen coords (-1..1, y up) or null.
  function onScreen(G, p, slack = 0) {
    v.copy(p).project(G.camera);
    if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) return null;
    const cam = G.camera.position;
    const d = cam.distanceTo(p);
    w.subVectors(p, cam).normalize();
    const hit = G.collision ? G.collision.raycast(cam, w, d) : Infinity;
    if (hit < d - 0.3 - slack) return null;
    return { x: +v.x.toFixed(3), y: +v.y.toFixed(3) };
  }
  function tall(G, a, b) {
    v.copy(a).project(G.camera);
    const y0 = v.y;
    v.copy(b).project(G.camera);
    return Math.abs(v.y - y0) * 0.5 * innerHeight;
  }

  function things(G) {
    const out = [];
    const me = G.player.position;
    const zone = G.zone;
    const see = (o, looks, kind, foot, headH, extra = {}, slack = 0) => {
      const head = foot.clone().setY(foot.y + headH);
      const mid = foot.clone().setY(foot.y + headH * 0.5);
      const low = foot.clone().setY(foot.y + headH * 0.15);
      const s = onScreen(G, mid, slack) || onScreen(G, head, slack) || onScreen(G, low, slack);
      if (!s) return;
      const px = tall(G, foot, head);
      if (px < 8) return;
      out.push({ key: keyOf(o), kind, looks, x: s.x, y: s.y, px: Math.round(px), dist: +foot.distanceTo(me).toFixed(2), pos: [+foot.x.toFixed(2), +foot.y.toFixed(2), +foot.z.toFixed(2)], ...extra });
    };
    // people
    for (const [id, n] of G.npcs) {
      if (n.hidden || !n.root.visible || !n.root.parent) continue;
      const model = n.h.name;
      const appearance = id === 'fang' || id === 'tangtang' || id === 'weibao' ? PEOPLE[id] : PEOPLE[model] || 'a person';
      const looks = appearance + (ROLE[zone.id]?.[id] || '');
      see(n, looks, 'person', n.root.position, model === 'folk_kid' ? 0.95 : 1.25, { appearance, talking: !!n.talking, sitting: !!n.seated, walking: !!n.walkTarget, following: !!n.follower });
    }
    // Grumblings
    for (const g of G.grumblings) {
      if (g.state === 'gone' || !g.obj.parent || !g.obj.visible) continue;
      const looks = CREATURES[g.species] || 'a strange little creature';
      const extra = { noticed: g.noticed, asleep: g.state === 'cocoon' || g.state === 'sleep', wrapped: +g.progress.toFixed(2), size: +g.size.toFixed(2) };
      if (g.species === 'grey') extra.colour = g.ready ? 'warm, looking up at her' : g.company > 0.5 ? 'a little less grey' : 'grey';
      if (g.perched) extra.perched = true;
      // its body: from a little below its centre (a cloud floats; others sit on the ground)
      const foot = g.obj.position.clone();
      see(g, looks, 'creature', foot.setY(foot.y - 0.05), 0.5 * g.size, extra);
    }
    // lemon candies
    zone.group.traverse((o) => {
      if (o.name === 'candy' && o.visible && o.parent) see(o, 'a wrapped yellow candy', 'candy', o.position, 0.2);
    });
    // things you could walk up to (NPCs and Grumblings are already described above)
    const skip = new Set([...G.npcs.values()].map((n) => n.interactable).concat([...G.grumblings].map((g) => g.interactable)));
    for (const it of G.interactables) {
      if (skip.has(it) || (it.enabled && !it.enabled())) continue;
      const label = typeof it.label === 'function' ? it.label() : it.label;
      see(it, INTERACT[label] || 'something you could look at', 'object', it.position, 0.6, {}, 1);
    }
    // places
    for (const m of zone.markersBy('PLACE_')) {
      const piece = m.name.slice(6).replace(/[._]?\d+$/, '');
      const [looks, r] = PLACES[piece] || [];
      if (!looks || r < 1.5) continue; // small props are scenery
      see(m, looks, 'place', m.position, Math.min(4, r), { size: r }, r + 1);
    }
    // name boards near enough to read (the letters about 10 px tall or more). A board names the building it
    // stands by: its words go with that building, if she can see it too (walking to the board itself would
    // leave her standing outside). A board with no building by it (a field, a pond) is a place of its own.
    for (const sg of zone.signs?.list || []) {
      if (sg.kind === 'finger' || sg.dim?.()) continue;
      const foot = sg.kind === 'post' ? sg.at : sg.at.clone().setY(sg.at.y - 1.6);
      if (foot.distanceTo(me) >= 16 || !onScreen(G, foot.clone().setY(foot.y + 1.7), 1)) continue;
      const by = zone
        .markersBy('PLACE_')
        .filter((m) => (PLACES[m.name.slice(6).replace(/[._]?\d+$/, '')] || [0, 0])[1] >= 2 && Math.hypot(m.position.x - foot.x, m.position.z - foot.z) < 9)
        .sort((a, b) => Math.hypot(a.position.x - foot.x, a.position.z - foot.z) - Math.hypot(b.position.x - foot.x, b.position.z - foot.z))[0];
      const said = `a sign that says “${sg.text}”`;
      if (!by) see(sg, said, 'place', foot, 1.9, { size: 2 }, 1);
      else {
        const t = out.find((o) => o.kind === 'place' && Math.hypot(o.pos[0] - by.position.x, o.pos[2] - by.position.z) < 0.1);
        if (t && !t.looks.includes(said)) t.looks += ', with ' + said;
      }
    }
    for (const [z, re, looks, r] of FEATURES) {
      if (z !== zone.id) continue;
      // a way out (a TRIGGER box) is seen where it is: the top of the stairs, the top of the path
      for (const m of zone.markers.values()) if (re.test(m.name)) see(m, looks, 'place', m.position.clone().setY(m.position.y - (m.name.startsWith('TRIGGER') ? 0.5 : 0)), 1.5, { size: r }, r);
    }
    // rings on the ground: rain about to fall, a paper ball about to land
    zone.group.traverse((o) => {
      if (!o.isMesh || o.geometry?.type !== 'RingGeometry' || !o.visible || !(o.material.opacity > 0.08)) return;
      const hex = o.material.color.getHex();
      if (!HAZARD[hex]) return;
      const r = (o.geometry.parameters.outerRadius || 1) * o.scale.x;
      const s = onScreen(G, o.position, 1);
      if (s) out.push({ key: keyOf(o), kind: 'hazard', looks: HAZARD[hex], x: s.x, y: s.y, dist: +o.position.distanceTo(me).toFixed(2), pos: [+o.position.x.toFixed(2), +o.position.y.toFixed(2), +o.position.z.toFixed(2)], r: +r.toFixed(2) });
    });
    return out;
  }

  // How far she could walk in each direction across the view (walls, fences, benches), and whether the ground
  // drops away a couple of metres ahead. Two rays a little apart in height tell a wall (both stop at the same
  // distance) from a slope or steps (the higher one goes further), like seeing that steps go up.
  function ahead(G) {
    const p = G.player.position;
    const yaw = G.cam.yaw;
    const rays = [];
    const waters = G.zone.markersBy('WATER_');
    const dist = (h, dx, dz) => G.collision.raycast(v.set(p.x, p.y + h, p.z), w.set(dx, 0, dz), 14);
    for (let deg = -80; deg <= 80; deg += 10) {
      const a = yaw + Math.PI + (deg * Math.PI) / 180; // the camera looks along yaw + π
      const dx = Math.sin(a),
        dz = Math.cos(a);
      let d = 14;
      for (const [lo, hi] of [[0.3, 0.45], [0.95, 1.1]]) {
        const a1 = dist(lo, dx, dz),
          a2 = dist(hi, dx, dz);
        if (a1 < 14 && Math.abs(a1 - a2) < 0.1) d = Math.min(d, a1, a2);
      }
      // a drop (no ground within 1.2 m below, 1.6 m ahead), or water there (you can see it)
      const gy = G.collision.groundY(p.x + dx * 1.6, p.z + dz * 1.6, p.y + 1);
      // where the ground ahead is under water (you can see a pond's edge)
      const waterAt = [1.6, 3, 5, 8].filter((k) => {
        if (k > d) return false;
        const ax = p.x + dx * k,
          az = p.z + dz * k;
        const g = G.collision.groundY(ax, az, p.y + 2);
        return waters.some((m) => Math.abs(ax - m.position.x) < m.scale.x && Math.abs(az - m.position.z) < m.scale.z && g !== null && g < m.position.y - 0.05 && p.y > m.position.y - 0.3);
      });
      rays.push({ deg, dist: +d.toFixed(2), drop: gy === null || gy < p.y - 1.2, water: waterAt.includes(1.6), waterAt });
    }
    return rays;
  }

  window.__eyes = {
    // just the UI and the beat: cheap enough to call many times a second in a mini-game
    peek() {
      const b = window.__G?.audio?.beat?.();
      return { t: Math.round(performance.now()), ui: ui(), beat: b ? { phase: +b.phase.toFixed(3), index: b.index, spb: +(60 / 84).toFixed(4) } : null };
    },
    look() {
      const G = window.__G;
      const snap = { t: Math.round(performance.now()), ui: ui() };
      if (!G || !G.player || !G.zone || !G.camera) return snap;
      if (!V3) {
        V3 = G.camera.position.constructor;
        v = new V3();
        w = new V3();
      }
      const p = G.player;
      snap.me = {
        pos: [+p.position.x.toFixed(2), +p.position.y.toFixed(2), +p.position.z.toFixed(2)],
        facing: +p.facing.toFixed(3),
        speed: +p.speed.toFixed(2),
        state: p.state, // standing / sitting / sat down, overwhelmed / busy with something
        humming: !!p.humming,
        onGround: !!p.onGround,
      };
      snap.view = { yaw: +G.cam.yaw.toFixed(3), pitch: +G.cam.pitch.toFixed(3), cutscene: !!G.cam.shot };
      snap.place = G.zone.id; // where she is (the zone's look is obvious: a train, a station, the Academy…)
      snap.things = things(G);
      if (G.collision) snap.ahead = ahead(G);
      // the lullaby's beat, as you hear it: the phase (0..1) of the current beat, and seconds per beat
      const b = G.audio?.beat?.();
      if (b) snap.beat = { phase: +b.phase.toFixed(3), index: b.index, spb: +(60 / 84).toFixed(4) };
      snap.pulses = beats.slice(-6);
      return snap;
    },
  };
}
