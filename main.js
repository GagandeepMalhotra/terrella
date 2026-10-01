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
  // A refresh part-way down restores the scroll after the first frame; take the right size
  // without animating to it, then let scrolling animate as normal.
  nav.classList.add("no-anim");
  update();
  addEventListener("load", () => { update(); requestAnimationFrame(() => nav.classList.remove("no-anim")); });
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
// Minecraft's clouds are simple: flat slabs whose outlines are a few rectangles run together -
// a long bar, an L, a T, a block with a notch. Each is built here from two to four overlapping
// rectangles of 12-block cells, spaced so they never touch, with a white top and a thin grey
// south face. Generated (no game files); one seamless tile, drawn once, slid by the compositor.
const clouds = document.querySelector(".stage-clouds");
if (clouds) {
  const CW = 72, CH = 28;                         // cells in one tile
  const PX = 4;                                   // canvas pixels per cell
  let seed = 912;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const ri = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const on = new Uint8Array(CW * CH);
  const idx = (x, y) => (((y % CH) + CH) % CH) * CW + (((x % CW) + CW) % CW);
  const free = (x0, y0, w, h) => {                // one clear cell all round
    for (let y = y0 - 1; y <= y0 + h; y++)
      for (let x = x0 - 1; x <= x0 + w; x++) if (on[idx(x, y)]) return false;
    return true;
  };
  for (let n = 0, tries = 0; n < 9 && tries < 400; tries++) {
    const w = ri(6, 14), h = ri(3, 6);
    const x0 = ri(0, CW - 1), y0 = ri(0, CH - 1);
    const rects = [[0, 0, w, h]];
    for (let k = ri(1, 3); k > 0; k--) {          // add a lobe: an L, a T, a step
      const lw = ri(2, Math.max(2, w - 2)), lh = ri(2, 4);
      const side = ri(0, 3);
      const lx = side === 0 ? ri(0, w - lw) : side === 1 ? ri(0, w - lw) : side === 2 ? -ri(1, 3) : w - ri(0, 1);
      const ly = side === 0 ? -lh + 1 : side === 1 ? h - 1 : ri(0, Math.max(0, h - lh));
      rects.push([lx, ly, side >= 2 ? ri(2, 4) : lw, lh]);
    }
    let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
    for (const [rx, ry, rw, rh] of rects) {
      bx0 = Math.min(bx0, rx); by0 = Math.min(by0, ry); bx1 = Math.max(bx1, rx + rw); by1 = Math.max(by1, ry + rh);
    }
    if (!free(x0 + bx0, y0 + by0, bx1 - bx0, by1 - by0)) continue;
    for (const [rx, ry, rw, rh] of rects)
      for (let y = ry; y < ry + rh; y++)
        for (let x = rx; x < rx + rw; x++) on[idx(x0 + x, y0 + y)] = 1;
    n++;
  }
  const canvas = document.createElement("canvas");
  canvas.width = CW * PX; canvas.height = CH * PX;
  const ctx = canvas.getContext("2d");
  for (let y = 0; y < CH; y++)
    for (let x = 0; x < CW; x++) {
      if (!on[idx(x, y)]) continue;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x * PX, y * PX, PX, PX);
      if (!on[idx(x, y + 1)]) {                   // the south face, seen past the top
        ctx.fillStyle = "#d6dde6";
        ctx.fillRect(x * PX, ((y + 1) % CH) * PX, PX, 1);
      }
    }
  const tile = CW * 32;                           // on screen, ~32 px a cell: 12 blocks at this height
  clouds.style.setProperty("--cloud-tile", `${tile}px`);
  clouds.style.backgroundImage = `url(${canvas.toDataURL()})`;
  clouds.classList.add("is-ready");
}

// ── Demo film ─────────────────────────────────────────────────────────────────
// Set to true once assets/demo.mp4 (and optionally assets/demo-poster.jpg) are in place; until
// then the section stays hidden and nothing is fetched for it.
const HAS_DEMO = false;
const demo = document.getElementById("demo");
if (demo && HAS_DEMO) {
  const v = demo.querySelector("video");
  v.poster = v.dataset.poster;
  v.src = v.dataset.src;
  demo.hidden = false;
}

// ── Hero logo ─────────────────────────────────────────────────────────────────
// The logo stands as tall as the words beside it, whatever they wrap to.
const head = document.querySelector(".stage-head");
const text = head && head.querySelector(".stage-text");
if (head && text && "ResizeObserver" in window) {
  const wide = matchMedia("(min-width: 601px)");
  const title = text.querySelector(".stage-title");
  // Wide: as tall as the name, line and button together. Phones: as tall as the name alone.
  const fit = () => {
    const box = wide.matches ? text : title;
    head.style.setProperty("--head-h", `${Math.round(box.getBoundingClientRect().height)}px`);
  };
  new ResizeObserver(fit).observe(text);
  new ResizeObserver(fit).observe(title);
  wide.addEventListener("change", fit);
  if (document.fonts) document.fonts.ready.then(fit);
  fit();
}

// ── One brand on screen ───────────────────────────────────────────────────────
// The bar's name and logo appear only once the hero's have scrolled up under it.
const heroBrand = document.querySelector(".stage-head");
if (nav && heroBrand && "IntersectionObserver" in window) {
  const barH = () => (nav.querySelector(".nav-bar")?.getBoundingClientRect().bottom || 64);
  const links = nav.querySelector(".nav-links");
  // The links move between the left and the centre as the logo leaves or arrives; measured
  // before and after, and played as one transform so the change glides instead of jumping.
  const setBrand = (inHero) => {
    if (nav.classList.contains("brand-in-hero") === inHero) return;
    const before = links ? links.getBoundingClientRect().left : 0;
    nav.classList.toggle("brand-in-hero", inHero);
    if (!links || nav.classList.contains("no-anim") || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const dx = before - links.getBoundingClientRect().left;
    if (!dx) return;
    links.style.transition = "none";
    links.style.transform = `translateX(${dx}px)`;
    links.getBoundingClientRect();
    links.style.transition = "transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)";
    links.style.transform = "";
  };
  let io;
  const watch = () => {
    if (io) io.disconnect();
    io = new IntersectionObserver(([e]) => setBrand(e.isIntersecting),
                                  { rootMargin: `-${Math.round(barH())}px 0px 0px 0px` });
    io.observe(heroBrand);
  };
  watch();
  addEventListener("resize", watch);
} else if (nav) {
  nav.classList.remove("brand-in-hero");
}

// ── Phone menu ────────────────────────────────────────────────────────────────
const menuButton = document.querySelector(".nav-menu");
const sheet = document.getElementById("nav-sheet");
if (nav && menuButton && sheet) {
  const setMenu = (open) => {
    nav.classList.toggle("menu-open", open);
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "Close menu" : "Menu");
  };
  menuButton.addEventListener("click", (e) => { e.stopPropagation(); setMenu(!nav.classList.contains("menu-open")); });
  sheet.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("click", (e) => { if (!nav.contains(e.target)) setMenu(false); });
  addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });
  addEventListener("scroll", () => setMenu(false), { passive: true });
}
