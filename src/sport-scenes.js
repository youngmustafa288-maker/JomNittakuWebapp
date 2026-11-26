// Light, animated sport backgrounds for the login screens.
// Each centre's sport (set by the dev account) picks a scene. Everything is
// drawn from the side, so nets stand upright and balls travel over them.
// The animation stops while the tab is hidden, and phones set to
// "reduce motion" get a still frame.

export const LOGIN_SPORTS = [
  "Table tennis", "Badminton", "Tennis", "Pickleball", "Volleyball", "Sepak takraw",
  "Squash", "Football", "Futsal", "Hockey", "Basketball", "Netball", "Swimming", "Other"
];

const SCENES = {
  "table tennis": { kind: "net", floor: 430, surface: [170, 630, 372], netH: 22, ball: "tt", arc: 120, bounce: true, hand: "paddle" },
  badminton: { kind: "net", floor: 440, netH: 120, ball: "shuttle", arc: 190, bounce: false, hand: "racket" },
  tennis: { kind: "net", floor: 440, netH: 50, ball: "tennis", arc: 150, bounce: true, hand: "racket" },
  pickleball: { kind: "net", floor: 440, netH: 42, ball: "pickle", arc: 130, bounce: true, hand: "paddle" },
  volleyball: { kind: "net", floor: 440, netH: 140, ball: "volley", arc: 220, bounce: false, hand: "none" },
  "sepak takraw": { kind: "net", floor: 440, netH: 100, ball: "takraw", arc: 210, bounce: false, hand: "none" },
  squash: { kind: "wall", floor: 440, ball: "squash" },
  football: { kind: "goal", floor: 440, ball: "football", goalH: 110 },
  futsal: { kind: "goal", floor: 440, ball: "futsal", goalH: 80 },
  hockey: { kind: "goal", floor: 440, ball: "hockey", goalH: 70, roll: true },
  basketball: { kind: "hoop", floor: 440, ball: "basket", board: true },
  netball: { kind: "hoop", floor: 440, ball: "netball", board: false },
  swimming: { kind: "swim" },
  other: { kind: "mixed" }
};
const ALIASES = { "ping pong": "table tennis", pingpong: "table tennis", "table-tennis": "table tennis", soccer: "football", takraw: "sepak takraw", swim: "swimming" };

export function sceneKeyForSport(sport) {
  const key = String(sport || "").trim().toLowerCase().replace(/\s+/g, " ");
  const resolved = ALIASES[key] || key;
  return SCENES[resolved] ? resolved : "other";
}

const C = { line: "#b9c8de", net: "#9fb0c9", soft: "#dfe9f6", red: "#c81e45", navy: "#162a4a" };
const BALL_RADIUS = { tt: 7, tennis: 9, pickle: 9, volley: 15, takraw: 13, squash: 6, football: 14, futsal: 13, hockey: 6, basket: 15, netball: 14 };
const BALL_FILL = { tt: "#f59e3b", tennis: "#d7e84a", pickle: "#ffd43b", volley: "#ffffff", takraw: "#f0a35a", squash: "#1f2937", football: "#ffffff", futsal: "#ffffff", hockey: "#ffffff", basket: "#ef8a3a", netball: "#f3f3f3" };

function ballSvg(kind, x, y, rot) {
  if (kind === "shuttle") {
    return `<g transform="translate(${x},${y}) rotate(${rot})" opacity=".85"><path d="M0,0 L-22,-9 L-22,9 Z" fill="#fff" stroke="${C.net}"/><line x1="-6" y1="0" x2="-22" y2="-9" stroke="#c7d2e3"/><line x1="-6" y1="0" x2="-22" y2="9" stroke="#c7d2e3"/><circle cx="2" cy="0" r="5" fill="${C.red}"/></g>`;
  }
  const r = BALL_RADIUS[kind] || 9;
  let deco = "";
  if (kind === "tennis") deco = `<path d="M${-r} 0 Q 0 ${-r * 0.6} ${r} 0" stroke="#fff" fill="none" stroke-width="1.5"/>`;
  if (kind === "volley") deco = `<path d="M${-r} 0 Q0 -8 ${r} 0 M0 ${-r} Q8 0 0 ${r}" stroke="#4a7bd0" fill="none" stroke-width="2"/>`;
  if (kind === "takraw") deco = `<path d="M-9 -9 L9 9 M9 -9 L-9 9 M0 -13 V13 M-13 0 H13" stroke="#b86a2b" stroke-width="1.5"/>`;
  if (kind === "football" || kind === "futsal") deco = `<polygon points="0,-5 5,-1 3,5 -3,5 -5,-1" fill="${C.navy}"/>`;
  if (kind === "basket") deco = `<path d="M${-r} 0 H${r} M0 ${-r} V${r} M-10 -11 Q-3 0 -10 11 M10 -11 Q3 0 10 11" stroke="#7a3b12" fill="none" stroke-width="1.4"/>`;
  if (kind === "pickle") deco = `<circle cx="-3" cy="-3" r="1.6" fill="#c9a400"/><circle cx="3" cy="2" r="1.6" fill="#c9a400"/><circle cx="-2" cy="4" r="1.6" fill="#c9a400"/>`;
  return `<g transform="translate(${x},${y}) rotate(${rot})" opacity=".9"><circle r="${r}" fill="${BALL_FILL[kind] || "#fff"}" stroke="#c7d2e3"/>${deco}</g>`;
}

function handSvg(type, x, y, angle, color) {
  if (type === "none") return "";
  const head = type === "racket"
    ? `<ellipse cx="0" cy="-30" rx="15" ry="20" fill="none" stroke="${color}" stroke-width="4"/><line x1="-12" y1="-30" x2="12" y2="-30" stroke="${color}" stroke-width="1" opacity=".5"/><line x1="0" y1="-48" x2="0" y2="-12" stroke="${color}" stroke-width="1" opacity=".5"/>`
    : `<ellipse cx="0" cy="-26" rx="17" ry="20" fill="${color}"/>`;
  return `<g transform="translate(${x},${y}) rotate(${angle})" opacity=".35">${head}<rect x="-4" y="-8" width="8" height="30" rx="3" fill="#b98a5e"/></g>`;
}

function sceneSvg(cfg) {
  const F = cfg.floor || 440;
  let s = `<defs><pattern id="sportMesh" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 0 L6 6 M6 0 L0 6" stroke="${C.net}" stroke-width=".8" opacity=".7"/></pattern></defs>`;
  if (cfg.kind !== "swim" && cfg.kind !== "mixed") {
    s += `<line x1="0" y1="${F}" x2="800" y2="${F}" stroke="${C.line}" stroke-width="2" opacity=".7"/><rect x="0" y="${F}" width="800" height="${500 - F}" fill="${C.soft}" opacity=".5"/>`;
  }
  if (cfg.kind === "net") {
    if (cfg.surface) {
      const [a, b, y] = cfg.surface;
      s += `<rect x="${a}" y="${y}" width="${b - a}" height="10" rx="2" fill="#cfdcef" stroke="${C.line}"/><line x1="${a + 30}" y1="${y + 10}" x2="${a + 30}" y2="${F}" stroke="${C.line}" stroke-width="4"/><line x1="${b - 30}" y1="${y + 10}" x2="${b - 30}" y2="${F}" stroke="${C.line}" stroke-width="4"/><rect x="398" y="${y - cfg.netH}" width="4" height="${cfg.netH}" fill="${C.net}"/><rect x="392" y="${y - cfg.netH}" width="16" height="${cfg.netH}" fill="url(#sportMesh)" opacity=".7"/>`;
    } else {
      const high = ["shuttle", "volley", "takraw"].includes(cfg.ball);
      const top = F - cfg.netH - (high ? 60 : 0);
      s += `<line x1="400" y1="${F}" x2="400" y2="${top}" stroke="${C.net}" stroke-width="4"/><rect x="394" y="${top}" width="12" height="${Math.min(cfg.netH, 90)}" fill="url(#sportMesh)"/><line x1="388" y1="${top}" x2="412" y2="${top}" stroke="${C.net}" stroke-width="3"/>`;
    }
  }
  if (cfg.kind === "wall") s += `<rect x="690" y="120" width="18" height="${F - 120}" fill="#dfe6f1" stroke="${C.line}"/><line x1="690" y1="${F - 150}" x2="708" y2="${F - 150}" stroke="${C.red}" stroke-width="3" opacity=".6"/><line x1="690" y1="${F - 25}" x2="708" y2="${F - 25}" stroke="${C.red}" stroke-width="3" opacity=".6"/>`;
  if (cfg.kind === "goal") {
    const top = F - cfg.goalH;
    s += `<path d="M640 ${F} V${top} H740 L760 ${F}" fill="none" stroke="${C.net}" stroke-width="5"/><path data-goal-net d="M645 ${top + 4} H738 L755 ${F - 2} H645 Z" fill="url(#sportMesh)"/>`;
  }
  if (cfg.kind === "hoop") s += `<line x1="720" y1="${F}" x2="720" y2="170" stroke="${C.net}" stroke-width="6"/>${cfg.board ? `<rect x="705" y="120" width="10" height="80" fill="#eef2f8" stroke="${C.line}" stroke-width="2"/>` : ""}<line x1="${cfg.board ? 705 : 718}" y1="185" x2="650" y2="185" stroke="${C.red}" stroke-width="4" opacity=".7"/><path d="M652 187 L660 225 H695 L703 187" fill="url(#sportMesh)" stroke="${C.line}" stroke-width="1"/>`;
  if (cfg.kind === "swim") {
    for (let i = 0; i < 4; i += 1) {
      const y = 170 + i * 80;
      s += `<rect x="0" y="${y}" width="800" height="80" fill="${i % 2 ? "#dcecfb" : "#e6f2fd"}"/><line x1="0" y1="${y}" x2="800" y2="${y}" stroke="${C.red}" stroke-width="3" stroke-dasharray="10 8" opacity=".35"/>`;
    }
  }
  return s;
}

function arc(a, b, p, h) {
  return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p - h * Math.sin(Math.PI * p) };
}

// Works out one frame. Returns { pos, rot, extra } where extra is SVG.
function frameFor(cfg, state, dt, now) {
  const F = cfg.floor || 440;
  let pos = null, rot = 0, extra = "";
  if (cfg.kind === "net") {
    state.t += dt / (cfg.ball === "shuttle" ? 1900 : 1500);
    if (state.t >= 1) { state.t = 0; state.dir *= -1; }
    const t = state.t, dir = state.dir;
    const yHit = cfg.surface ? cfg.surface[2] - 70 : F - 150;
    const L = { x: 140, y: yHit }, R = { x: 660, y: yHit };
    const a = dir > 0 ? L : R, b = dir > 0 ? R : L;
    if (cfg.bounce) {
      const land = cfg.surface ? cfg.surface[2] - 8 : F - 9;
      const mid = { x: a.x + (b.x - a.x) * 0.68, y: land };
      pos = t < 0.68 ? arc(a, mid, t / 0.68, cfg.arc) : arc(mid, b, (t - 0.68) / 0.32, cfg.arc * 0.45);
    } else {
      pos = arc(a, b, t, cfg.arc);
    }
    rot = cfg.ball === "shuttle" ? (dir > 0 ? 0 : 180) + (t - 0.5) * 60 * dir : t * 360 * dir;
    const swing = side => Math.max(0, 1 - Math.abs(t - (dir === side ? 0.98 : 0.02)) * 7);
    extra = handSvg(cfg.hand, L.x - 30, (dir < 0 ? pos.y : yHit) + 40, -30 + swing(-1) * 50, C.red)
      + handSvg(cfg.hand, R.x + 30, (dir > 0 ? pos.y : yHit) + 40, 30 - swing(1) * 50, C.navy);
  } else if (cfg.kind === "wall") {
    state.t += dt / 1300;
    if (state.t >= 1) state.t = 0;
    const t = state.t;
    const A = { x: 120, y: F - 120 }, W = { x: 688, y: F - 90 }, B = { x: 420, y: F - 6 };
    pos = t < 0.45 ? arc(A, W, t / 0.45, 90) : t < 0.75 ? arc(W, B, (t - 0.45) / 0.3, 40) : arc(B, A, (t - 0.75) / 0.25, 110);
    rot = t * 720;
    extra = handSvg("racket", 90, F - 80, -30 + Math.max(0, 1 - Math.abs(t - 0.02) * 7) * 50, C.red);
  } else if (cfg.kind === "goal") {
    state.t += dt / 1700;
    if (state.t >= 1) state.t = 0;
    const t = state.t;
    const A = { x: 90, y: F - 14 }, G = { x: 715, y: F - cfg.goalH * 0.45 };
    if (t < 0.7) pos = cfg.roll ? { x: A.x + (G.x - A.x) * (t / 0.7), y: F - 7 } : arc(A, G, t / 0.7, cfg.goalH * 1.1);
    else {
      const k = (t - 0.7) / 0.3;
      pos = { x: G.x + 15 * Math.sin(k * 3), y: cfg.roll ? F - 7 : G.y + (F - 14 - G.y) * k };
    }
    rot = t * 900;
    state.netShake = t > 0.7 && t < 0.85 ? 6 * Math.sin((t - 0.7) * 60) : 0;
    if (cfg.roll) extra = `<g transform="translate(${70 + Math.min(t, 0.08) * 200},${F}) rotate(${t < 0.05 ? -30 : 10})" opacity=".35"><path d="M0 0 V-70" stroke="#7a5230" stroke-width="5"/><path d="M0 0 q12 4 18 -6" stroke="#7a5230" stroke-width="6" fill="none"/></g>`;
  } else if (cfg.kind === "hoop") {
    state.t += dt / 1600;
    if (state.t >= 1) state.t = 0;
    const t = state.t;
    const A = { x: 130, y: F - 130 }, H = { x: 677, y: 188 };
    pos = t < 0.62 ? arc(A, H, t / 0.62, 220) : { x: H.x, y: H.y + (F - 15 - H.y) * Math.min(1, ((t - 0.62) / 0.38) * 1.3) };
    rot = t * 600;
  } else if (cfg.kind === "swim") {
    state.t += dt / 4000;
    if (state.t >= 1) state.t = 0;
    const x = -80 + state.t * 960, y = 370;
    let waves = "";
    for (let i = 0; i < 4; i += 1) {
      const yy = 210 + i * 80;
      waves += `<path d="M0 ${yy} ${Array.from({ length: 17 }, (_, j) => `Q ${j * 50 + 25} ${(yy + 6 * Math.sin(now / 400 + j + i)).toFixed(1)} ${j * 50 + 50} ${yy}`).join(" ")}" stroke="#fff" stroke-width="3" fill="none" opacity=".8"/>`;
    }
    extra = waves + `<g transform="translate(${x},${y})" opacity=".55"><ellipse cx="0" cy="0" rx="34" ry="9" fill="${C.navy}"/><circle cx="36" cy="-2" r="9" fill="${C.red}"/><path d="M10 -6 q${(16 * Math.sin(now / 180)).toFixed(1)} -26 34 -4" stroke="${C.navy}" stroke-width="6" fill="none" stroke-linecap="round"/></g>`
      + Array.from({ length: 6 }, (_, i) => `<circle cx="${x - 50 - i * 16}" cy="${(y + 3 * Math.sin(now / 200 + i)).toFixed(1)}" r="${4 - i * 0.5}" fill="#fff" opacity="${0.8 - i * 0.12}"/>`).join("");
  } else {
    // Mixed: a few different balls drifting gently, for "Other" and the main login.
    const balls = ["tt", "football", "basket", "tennis", "volley", "shuttle", "takraw"];
    extra = balls.map((kind, i) => {
      const x = (100 + i * 105 + 30 * Math.sin(now / 2600 + i)) % 800;
      const y = 120 + ((i * 53) % 260) + 22 * Math.sin(now / 1700 + i * 1.7);
      return ballSvg(kind, x.toFixed(1), y.toFixed(1), ((now / 40 + i * 50) % 360).toFixed(0)).replace('opacity=".9"', 'opacity=".45"').replace('opacity=".85"', 'opacity=".45"');
    }).join("");
  }
  return { pos, rot, extra };
}

// Mounts a scene into `host`. Returns a stop() function.
export function mountSportScene(host, sport) {
  if (!host) return () => {};
  const cfg = SCENES[sceneKeyForSport(sport)];
  host.innerHTML = `<svg viewBox="0 0 800 500" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">${sceneSvg(cfg)}<g data-trail></g><g data-actor></g></svg>`;
  const trailEl = host.querySelector("[data-trail]");
  const actorEl = host.querySelector("[data-actor]");
  const netEl = host.querySelector("[data-goal-net]");
  const state = { t: 0, dir: 1, netShake: 0 };
  const trail = [];
  const F = cfg.floor || 440;
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  function paint(dt, now) {
    const { pos, rot, extra } = frameFor(cfg, state, dt, now);
    let html = extra;
    if (pos) {
      trail.push(pos);
      if (trail.length > 12) trail.shift();
      trailEl.innerHTML = trail.map((q, i) => `<circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${(1.5 + i * 0.4).toFixed(1)}" fill="${C.red}" opacity="${((i / trail.length) * 0.1).toFixed(3)}"/>`).join("");
      html += `<ellipse cx="${pos.x.toFixed(1)}" cy="${F + 3}" rx="${Math.max(4, 12 - (F - pos.y) / 25).toFixed(1)}" ry="3" fill="${C.navy}" opacity=".12"/>` + ballSvg(cfg.ball, pos.x.toFixed(1), pos.y.toFixed(1), rot.toFixed(0));
    }
    actorEl.innerHTML = html;
    if (netEl) netEl.setAttribute("transform", state.netShake ? `translate(${state.netShake.toFixed(1)},0)` : "");
  }

  if (reduce) {
    state.t = 0.35;
    paint(0, 0);
    return () => {};
  }
  let raf = 0, last = performance.now(), stopped = false;
  const loop = now => {
    if (stopped) return;
    if (!host.isConnected) { stopped = true; return; }
    if (!document.hidden) paint(Math.min(50, now - last), now);
    last = now;
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => { stopped = true; cancelAnimationFrame(raf); };
}
