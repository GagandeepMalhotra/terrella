// Everything the page needs to know that might change lives here.
const APP_URL = "";   // the Quest app's store page; until it is set, step 2 says "Coming soon."

// Minecraft version -> the jar that runs on it (each jar declares the versions it loads on).
const MOD_FOR = {
  "26.2":    "voxelmr-mod-mc26.2.jar",
  "26.1.2":  "voxelmr-mod-mc26.1.2.jar",
  "1.21.11": "voxelmr-mod-mc1.21.11.jar",
  "1.21.10": "voxelmr-mod-mc1.21.10.jar",
  "1.21.9":  "voxelmr-mod-mc1.21.9.jar",
  "1.21.8":  "voxelmr-mod-mc1.21.8.jar",
  "1.21.7":  "voxelmr-mod-mc1.21.7.jar",
  "1.21.6":  "voxelmr-mod-mc1.21.6.jar",
  "1.21.5":  "voxelmr-mod-mc1.21.5.jar",
  "1.21.4":  "voxelmr-mod-mc1.21.4.jar",
  "1.21.3":  "voxelmr-mod-mc1.21.3.jar",
  "1.21.1":  "voxelmr-mod-mc1.21.1.jar",
  "1.20.6":  "voxelmr-mod-mc1.20.6.jar",
  "1.20.4":  "voxelmr-mod-mc1.20.4.jar",
  "1.20.2":  "voxelmr-mod-mc1.20.2.jar",
  "1.20.1":  "voxelmr-mod-mc1.20.1.jar",
  "1.19.4":  "voxelmr-mod-mc1.19.4.jar",
};

// ── Version picker ────────────────────────────────────────────────────────────
const select = document.getElementById("mc-version");
const download = document.getElementById("mod-download");
for (const v of Object.keys(MOD_FOR)) select.add(new Option(`Minecraft ${v}`, v));

const remembered = (() => { try { return localStorage.getItem("mc-version"); } catch { return null; } })();
if (remembered && MOD_FOR[remembered]) select.value = remembered;

function pick() {
  download.href = `downloads/${MOD_FOR[select.value]}`;
  download.textContent = `Download for ${select.value}`;
  try { localStorage.setItem("mc-version", select.value); } catch {}
}
select.addEventListener("change", pick);
pick();

// ── App link ──────────────────────────────────────────────────────────────────
if (APP_URL) {
  const link = document.getElementById("app-link");
  link.href = APP_URL;
  link.hidden = false;
  document.getElementById("app-note").textContent = "Get it on your Quest.";
}

// ── The hero pauses when it is off screen ────────────────────────────────────
// Its drift is compositor-only already; this stops even that while nobody can see it.
const stage = document.querySelector(".stage");
if (stage && "IntersectionObserver" in window) {
  new IntersectionObserver(([e]) => stage.classList.toggle("is-away", !e.isIntersecting))
    .observe(stage);
}

// ── The glass bar ─────────────────────────────────────────────────────────────
// Over the world it takes white words; once the page moves it condenses a little, as iOS
// tab bars do. One passive scroll listener, work done at most once a frame.
const nav = document.getElementById("nav");
const bar = nav && nav.querySelector(".nav-bar");
if (nav && stage) {
  let queued = false;
  const update = () => {
    queued = false;
    const barBottom = bar.getBoundingClientRect().bottom;
    // The hero fades out over its last quarter; once that is under the bar, it is page.
    const heroSolid = stage.getBoundingClientRect().bottom - stage.offsetHeight * 0.28;
    nav.classList.toggle("over-hero", heroSolid > barBottom);
    nav.classList.toggle("is-compact", window.scrollY > 24);
  };
  addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(update); } },
                   { passive: true });
  addEventListener("resize", update);
  update();
}

// ── Liquid Glass refraction (Chromium only) ─────────────────────────────────
// Each glass element gets its own filter, built to its own size and corner radius:
//  - a squircle bezel (Apple's softer flat-to-curve edge, y = (1 - (1 - x)^4)^(1/4)), so the
//    picture is flat through the middle and bends hardest at the rim;
//  - three slightly different bends for red, green and blue - the faint colour fringe real
//    glass shows at its edge;
//  - a whisper of blur, and saturation to keep what is behind it vivid.
// Only Chromium accepts an SVG filter as a backdrop-filter; elsewhere the same glass simply
// does not refract. Refraction switches on per element only once its map exists.
const chromium = !!(navigator.userAgentData && navigator.userAgentData.brands &&
                    navigator.userAgentData.brands.some((b) => /Chromium/.test(b.brand)));
const glassy = [...document.querySelectorAll(".glass[data-lg]")];
if (chromium && glassy.length && !matchMedia("(prefers-reduced-transparency: reduce)").matches) {
  const NS = "http://www.w3.org/2000/svg";
  const defs = document.createElementNS(NS, "svg");
  defs.setAttribute("aria-hidden", "true");
  defs.setAttribute("width", "0"); defs.setAttribute("height", "0");
  defs.style.position = "absolute";
  document.body.appendChild(defs);

  const channel = (c) => ({ r: "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0",
                            g: "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0",
                            b: "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" })[c];

  const mapFor = (w, h, radius, bezel) => {
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(w, h);
    const r = Math.min(radius, w / 2, h / 2);
    const hx = w / 2 - r, hy = h / 2 - r;
    // Slope of the squircle surface, sampled once across the bezel and normalised.
    const N = 64, slope = new Float32Array(N + 1);
    let peak = 0;
    for (let k = 0; k <= N; k++) {
      const x = Math.max(k / N, 0.02);                      // 0 at the rim, 1 where it flattens
      const s = Math.pow(1 - x, 3) / Math.pow(1 - Math.pow(1 - x, 4), 0.75);
      slope[k] = s; peak = Math.max(peak, s);
    }
    for (let k = 0; k <= N; k++) slope[k] /= peak;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const px = x + 0.5 - w / 2, py = y + 0.5 - h / 2;
        const qx = Math.abs(px) - hx, qy = Math.abs(py) - hy;
        const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
        const inward = -(Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r);
        let dx = 0, dy = 0;
        if (inward > 0 && inward < bezel) {
          const m = slope[Math.round((inward / bezel) * N)];
          let nx, ny;
          if (qx > 0 && qy > 0) { const l = Math.hypot(ox, oy) || 1; nx = ox / l; ny = oy / l; }
          else if (qx > qy) { nx = 1; ny = 0; } else { nx = 0; ny = 1; }
          nx *= Math.sign(px) || 1; ny *= Math.sign(py) || 1;
          dx = -nx * m; dy = -ny * m;                          // look further in: the rim magnifies
        }
        const i = (y * w + x) * 4;
        img.data[i] = 128 + dx * 127; img.data[i + 1] = 128 + dy * 127;
        img.data[i + 2] = 128; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL();
  };

  glassy.forEach((el, n) => {
    const id = `lg-${n}`;
    const f = document.createElementNS(NS, "filter");
    f.id = id;
    ["x", "y"].forEach((a) => f.setAttribute(a, "0"));
    ["width", "height"].forEach((a) => f.setAttribute(a, "100%"));
    f.setAttribute("color-interpolation-filters", "sRGB");
    defs.appendChild(f);
    let last = "";
    const build = () => {
      const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
      if (!w || !h || `${w}x${h}` === last) return;
      last = `${w}x${h}`;
      const radius = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || h / 2, h / 2);
      const bezel = Math.min(h * 0.5, 26);
      const scale = Math.round(h * 1.15);                     // the bend grows with the glass
      f.innerHTML =
        `<feImage href="${mapFor(w, h, radius, bezel)}" x="0" y="0" width="${w}" height="${h}" result="map" preserveAspectRatio="none"/>` +
        ["r", "g", "b"].map((c, i) =>
          `<feDisplacementMap in="SourceGraphic" in2="map" scale="${scale * (1 - i * 0.05)}" xChannelSelector="R" yChannelSelector="G" result="d${c}"/>` +
          `<feColorMatrix in="d${c}" type="matrix" values="${channel(c)}" result="${c}"/>`).join("") +
        `<feBlend in="r" in2="g" mode="screen" result="rg"/><feBlend in="rg" in2="b" mode="screen" result="rgb"/>` +
        "";
      el.style.setProperty("--lg-filter", `url(#${id})`);
      document.documentElement.classList.add("lg-refract");
    };
    build();
    new ResizeObserver(build).observe(el);
  });
}


// ── Clouds ────────────────────────────────────────────────────────────────────
// Minecraft's fancy clouds seen from above: flat slabs built from 12-block cells, a bright
// top face and the grey of a side face showing just below it where the view is tilted. The
// shapes come from wrap-around value noise generated here (no game files), cut so the sky stays
// mostly clear. One seamless tile, drawn once; the stylesheet slides it.
const clouds = document.querySelector(".stage-clouds");
if (clouds) {
  const CW = 72, CH = 30;                       // cloud cells in one tile (a cell is 12 blocks)
  const PX = 8;                                 // canvas pixels per cell
  let seed = 20260930;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const grid = (gw, gh) => Array.from({ length: gh }, () => Array.from({ length: gw }, rand));
  const coarse = grid(9, 4), fine = grid(18, 8);
  const sample = (g, x, y) => {                 // smooth, wrapping interpolation
    const gh = g.length, gw = g[0].length;
    const fx = (x / CW) * gw, fy = (y / CH) * gh;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const at = (i, k) => g[(k + gh) % gh][(i + gw) % gw];
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const bot = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return top + (bot - top) * sy;
  };
  const cells = [];
  for (let y = 0; y < CH; y++)
    for (let x = 0; x < CW; x++)
      if (sample(coarse, x, y) * 0.75 + sample(fine, x, y) * 0.25 > 0.66) cells.push([x, y]);
  const canvas = document.createElement("canvas");
  canvas.width = CW * PX; canvas.height = CH * PX;
  const ctx = canvas.getContext("2d");
  const wrap = (fn) => { for (const [x, y] of cells) for (const dx of [0, -CW]) for (const dy of [0, -CH]) fn(x + dx, y + dy); };
  const side = Math.round(PX * 0.28);           // the side face below each slab
  ctx.fillStyle = "rgb(205, 212, 224)";
  wrap((x, y) => ctx.fillRect((x < 0 ? x + CW : x) * PX, ((y < 0 ? y + CH : y) * PX + side) % (CH * PX), PX, PX));
  ctx.fillStyle = "rgb(255, 255, 255)";
  for (const [x, y] of cells) ctx.fillRect(x * PX, y * PX, PX, PX);
  const tile = CW * 30;                         // on screen, ~30 px a cell
  clouds.style.setProperty("--cloud-tile", `${tile}px`);
  clouds.style.backgroundImage = `url(${canvas.toDataURL()})`;
  clouds.classList.add("is-ready");
}

// ── Demo film ─────────────────────────────────────────────────────────────────
// The section stays hidden until assets/demo.mp4 exists, so adding the film is just adding
// the file.
const demo = document.getElementById("demo");
if (demo) {
  fetch("assets/demo.mp4", { method: "HEAD" })
    .then((r) => { if (r.ok) demo.hidden = false; })
    .catch(() => {});
}
