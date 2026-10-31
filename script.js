(() => {
  "use strict";

  /* =========================================================
     Setup
     ========================================================= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const hasGSAP = !!(window.gsap && window.ScrollTrigger);
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  scrollTo(0, 0);

  /* ---------- Run a draw loop only while an element is on screen ---------- */
  function whileVisible(el, draw) {
    if (reduce) { draw(performance.now()); return; }
    let raf = 0, on = false;
    const loop = (t) => { draw(t); raf = requestAnimationFrame(loop); };
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !on) { on = true; raf = requestAnimationFrame(loop); }
      else if (!e.isIntersecting && on) { on = false; cancelAnimationFrame(raf); }
    }).observe(el);
  }

  /* ---------- Keep a canvas sized to its box at device pixel ratio ---------- */
  function autoSize(canvas, onResize, scale = DPR) {
    const state = { w: 0, h: 0, ctx: canvas.getContext("2d") };
    const fit = () => {
      state.w = canvas.clientWidth;
      state.h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(state.w * scale));
      canvas.height = Math.max(1, Math.round(state.h * scale));
      state.ctx.setTransform(scale, 0, 0, scale, 0, 0);
      onResize && onResize(state);
    };
    new ResizeObserver(fit).observe(canvas);
    fit();
    return state;
  }

  /* ---------- Split text into masked words / chars ---------- */
  function split(el, { chars = true, maskEach = false } = {}) {
    el.setAttribute("aria-label", el.textContent.replace(/\s+/g, " ").trim());
    const make = (cls, text) => {
      const s = document.createElement("span");
      s.className = cls;
      if (text != null) s.textContent = text;
      return s;
    };
    const walk = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((tok) => {
            if (!tok) return;
            if (/^\s+$/.test(tok)) { frag.append(" "); return; }
            if (maskEach) {
              [...tok].forEach((ch) => {
                const w = make("w"); w.setAttribute("aria-hidden", "true");
                w.append(make("c", ch)); frag.append(w);
              });
              return;
            }
            const w = make("w"); w.setAttribute("aria-hidden", "true");
            if (chars) [...tok].forEach((ch) => w.append(make("c", ch)));
            else w.append(make("c", tok));
            frag.append(w);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1 && child.tagName !== "BR") {
          walk(child);
        }
      });
    };
    walk(el);
    return $$(".c", el);
  }

  /* =========================================================
     Things that work with or without GSAP
     ========================================================= */
  // Clocks (Bangalore time)
  const fmt = (opts) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour12: false, ...opts });
  const fmtLong = fmt({ hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const fmtShort = fmt({ hour: "2-digit", minute: "2-digit" });
  const tick = () => {
    const now = new Date();
    $("#clock").textContent = fmtLong.format(now);
    $("#clock-2").textContent = fmtShort.format(now);
  };
  tick(); setInterval(tick, 1000);
  $("#year").textContent = new Date().getFullYear();

  // Copy email
  const copyBtn = $("#copy-email");
  copyBtn.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(copyBtn.dataset.email); copyBtn.textContent = "Copied ✓"; }
    catch { copyBtn.textContent = "Press Ctrl+C"; }
    setTimeout(() => { copyBtn.textContent = "Copy email"; }, 1800);
  });

  /* =========================================================
     Hero WebGL: a living field of contour lines
     ========================================================= */
  const heroGL = (() => {
    const canvas = $("#hero-gl");
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "high-performance" });
    const api = { reveal: reduce ? 1 : 0 };
    if (!gl) { canvas.remove(); return api; }

    const vert = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
    const frag = `
      #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif
      uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse;
      uniform float uReveal; uniform vec2 uClick; uniform float uClickT;

      float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float fbm(vec2 p){
        float v = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
        for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
        return v;
      }
      void main(){
        vec2 aspect = vec2(uRes.x / uRes.y, 1.0);
        vec2 p  = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
        vec2 m  = (uMouse - 0.5) * aspect;
        vec2 cp = (uClick - 0.5) * aspect;
        float t = uTime * 0.05;

        vec2 dm = p - m; float md = length(dm);
        float ct = uTime - uClickT; float cd = length(p - cp);
        float ring = exp(-pow((cd - ct * 0.8) * 7.0, 2.0)) * exp(-ct * 1.1);

        vec2 q = vec2(fbm(p * 1.2 + vec2(0.0, t)), fbm(p * 1.2 + vec2(5.2, -t)));
        vec2 w = p + 0.8 * q;
        w += dm * 0.5 * exp(-md * md * 6.0);                 // lens around the cursor
        w += (p - cp) / max(cd, 0.001) * ring * 0.14;         // click shockwave

        float f = fbm(w * 1.6 + vec2(t * 1.5, -t));
        float c = fract(f * 16.0);
        float line = 1.0 - smoothstep(0.0, 0.09, min(c, 1.0 - c));
        float hot = exp(-md * md * 5.0);

        vec3 bone = vec3(0.925, 0.914, 0.886);
        vec3 acid = vec3(0.784, 1.0, 0.239);
        vec3 col = vec3(0.022);
        col += line * mix(bone * 0.13, acid * 0.95, clamp(hot + ring * 1.6, 0.0, 1.0));
        col += acid * 0.07 * hot;

        float r = uReveal * 2.4;
        col *= 1.0 - smoothstep(r - 0.35, r, length(p + vec2(0.0, 0.25)));

        vec2 uv = gl_FragCoord.xy / uRes;
        col *= 0.35 + 0.65 * (1.0 - smoothstep(0.25, 1.15, length((uv - 0.5) * vec2(1.2, 1.0))));
        gl_FragColor = vec4(col, 1.0);
      }`;

    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    let prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, vert));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, frag));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (err) {
      console.warn("Hero shader disabled:", err);
      canvas.remove();
      return api;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const U = {};
    ["uRes", "uTime", "uMouse", "uReveal", "uClick", "uClickT"].forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });

    const scale = Math.min(window.devicePixelRatio || 1, 1.5) * 0.8;  // render a little under native for speed
    const fit = () => {
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * scale));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    new ResizeObserver(fit).observe(canvas);
    fit();

    const mouse = { x: 0.68, y: 0.58 }, target = { x: 0.68, y: 0.58 };
    const toLocal = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height };
    };
    addEventListener("pointermove", (e) => { Object.assign(target, toLocal(e)); }, { passive: true });
    let click = { x: 0.5, y: 0.5 }, clickT = -100, time = 0, last = performance.now();
    $(".hero").addEventListener("pointerdown", (e) => { click = toLocal(e); clickT = time; });

    whileVisible(canvas, (now) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now;
      time += dt;
      mouse.x += (target.x - mouse.x) * 0.06;
      mouse.y += (target.y - mouse.y) * 0.06;
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uTime, reduce ? 12 : time);
      gl.uniform2f(U.uMouse, mouse.x, mouse.y);
      gl.uniform1f(U.uReveal, api.reveal);
      gl.uniform2f(U.uClick, click.x, click.y);
      gl.uniform1f(U.uClickT, clickT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
    return api;
  })();

  /* =========================================================
     Project demos
     ========================================================= */
  const ACID = "#c8ff3d";

  // 01 · Neural network: pulses travel input → output
  (() => {
    const canvas = $("[data-viz='neural']");
    if (!canvas) return;
    const layers = [4, 7, 7, 5, 2];
    let nodes = [], edges = [];
    const pulses = [];
    const s = autoSize(canvas, ({ w, h }) => {
      nodes = layers.map((n, li) => {
        const x = w * 0.12 + (li / (layers.length - 1)) * w * 0.76;
        const gap = Math.min(46, (h * 0.7) / n);
        return Array.from({ length: n }, (_, i) => ({ x, y: h / 2 + (i - (n - 1) / 2) * gap, glow: 0 }));
      });
      edges = [];
      for (let l = 0; l < nodes.length - 1; l++) nodes[l].forEach((a) => nodes[l + 1].forEach((b) => edges.push({ a, b })));
      pulses.length = 0;
    });
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    let lastSpawn = 0;
    whileVisible(canvas, (t) => {
      const { ctx, w, h } = s;
      if (!reduce && t - lastSpawn > 180) {
        lastSpawn = t;
        const start = pick(nodes[0]);
        pulses.push({ e: pick(edges.filter((e) => e.a === start)), p: 0 });
      }
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(236,233,226,0.07)";
      edges.forEach(({ a, b }) => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); });

      for (let i = pulses.length - 1; i >= 0; i--) {
        const pu = pulses[i];
        pu.p += 0.028;
        if (pu.p >= 1) {
          pu.e.b.glow = 1;
          const next = edges.filter((e) => e.a === pu.e.b);
          if (next.length) { pu.e = pick(next); pu.p = 0; } else pulses.splice(i, 1);
          continue;
        }
        const { a, b } = pu.e;
        const x = a.x + (b.x - a.x) * pu.p, y = a.y + (b.y - a.y) * pu.p;
        const g = ctx.createLinearGradient(a.x, a.y, x, y);
        g.addColorStop(0, "rgba(200,255,61,0)"); g.addColorStop(1, "rgba(200,255,61,.8)");
        ctx.strokeStyle = g; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = ACID; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
      }
      nodes.flat().forEach((n) => {
        n.glow *= 0.93;
        ctx.beginPath(); ctx.arc(n.x, n.y, 5 + n.glow * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,255,61,${0.06 + n.glow * 0.9})`;
        ctx.strokeStyle = `rgba(236,233,226,${0.35 + n.glow * 0.5})`;
        ctx.shadowColor = ACID; ctx.shadowBlur = n.glow * 22;
        ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
      });
    });
  })();

  // 02 · ECG sweep
  (() => {
    const canvas = $("[data-viz='ecg']");
    if (!canvas) return;
    const bpmOut = $("#bpm");
    let trace = [], head = 0;
    const beat = (p) =>
      0.12 * Math.exp(-((p - 0.18) ** 2) / 0.0008) -
      0.15 * Math.exp(-((p - 0.36) ** 2) / 0.00008) +
      1.0 * Math.exp(-((p - 0.4) ** 2) / 0.00012) -
      0.25 * Math.exp(-((p - 0.44) ** 2) / 0.0001) +
      0.22 * Math.exp(-((p - 0.65) ** 2) / 0.0025);
    const s = autoSize(canvas, ({ w }) => {
      trace = new Array(Math.max(1, Math.ceil(w))).fill(0);
      head = 0;
      if (reduce) for (let x = 0; x < trace.length; x++) trace[x] = beat((x / 160) % 1);
    });
    let phase = 0, bpm = 72;
    whileVisible(canvas, () => {
      const { ctx, w, h } = s;
      if (!reduce) {
        for (let k = 0; k < 3; k++) {
          phase += bpm / 60 / 150;
          if (phase >= 1) { phase -= 1; bpm = Math.round(66 + Math.random() * 14); bpmOut.textContent = bpm; }
          trace[head] = beat(phase);
          head = (head + 1) % trace.length;
        }
      }
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(236,233,226,0.05)"; ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y < h; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

      const base = h * 0.62, amp = h * 0.42;
      ctx.lineWidth = 2; ctx.strokeStyle = ACID; ctx.shadowColor = ACID; ctx.shadowBlur = 12;
      ctx.beginPath();
      for (let x = 0; x < trace.length; x++) {
        if (!reduce && x >= head && x < head + 24) { ctx.stroke(); ctx.beginPath(); continue; }
        ctx.lineTo(x, base - trace[x] * amp);
      }
      ctx.stroke(); ctx.shadowBlur = 0;
      if (!reduce) {
        const px = (head - 1 + trace.length) % trace.length;
        ctx.fillStyle = "#f4ffd1"; ctx.beginPath(); ctx.arc(px, base - trace[px] * amp, 3.5, 0, Math.PI * 2); ctx.fill();
      }
    });
  })();

  // 03 · Solar tracker
  (() => {
    const box = $("#solar");
    if (!box) return;
    const svg = $("svg", box), sun = $("#sun", svg), panel = $("#panel", svg), beam = $("#beam", svg);
    const out = $("#solar-out"), fixedOut = $("#solar-fixed");
    const PIVOT = { x: 200, y: 182 };
    let target = { x: 300, y: 70 }, angle = 0, user = false, idle = 0;

    const toSvg = (e) => {
      const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const p = pt.matrixTransform(svg.getScreenCTM().inverse());
      return { x: Math.max(20, Math.min(380, p.x)), y: Math.max(20, Math.min(150, p.y)) };
    };
    box.addEventListener("pointermove", (e) => {
      user = true; target = toSvg(e);
      clearTimeout(idle); idle = setTimeout(() => { user = false; }, 2500);
      if (reduce) requestAnimationFrame(render);
    });
    const sunAngle = (p) => Math.atan2(p.x - PIVOT.x, PIVOT.y - p.y) * 180 / Math.PI;
    const pct = (deg) => Math.round(Math.max(0, Math.cos(deg * Math.PI / 180)) * 100);
    function render(t) {
      if (!user && !reduce) {
        const k = (t / 9000) % 1, th = Math.PI * (1 - k);
        target = { x: 200 + Math.cos(th) * 170, y: 160 - Math.sin(th) * 125 };
      }
      const sa = Math.max(-80, Math.min(80, sunAngle(target)));
      angle += (sa - angle) * (reduce ? 1 : 0.06);
      sun.setAttribute("transform", `translate(${target.x} ${target.y})`);
      panel.setAttribute("transform", `translate(${PIVOT.x} ${PIVOT.y}) rotate(${angle})`);
      beam.setAttribute("x1", target.x); beam.setAttribute("y1", target.y);
      out.textContent = pct(sunAngle(target) - angle);
      fixedOut.textContent = pct(sunAngle(target));
    }
    whileVisible(box, render);
  })();

  /* =========================================================
     No GSAP? Show everything statically and stop here.
     ========================================================= */
  const loader = $("#loader");
  const menuBtn = $("#menu-btn"), menu = $("#menu");
  if (!hasGSAP) {
    loader.remove();
    heroGL.reveal = 1;
    menuBtn.addEventListener("click", () => {
      const open = menu.classList.toggle("open");
      root.classList.toggle("menu-open", open);
      menuBtn.setAttribute("aria-expanded", String(open));
      menu.setAttribute("aria-hidden", String(!open));
      $(".menu-btn-text").textContent = open ? "Close" : "Menu";
    });
    $$("a", menu).forEach((a) => a.addEventListener("click", () => menuBtn.click()));
    return;
  }

  /* =========================================================
     GSAP + Lenis
     ========================================================= */
  gsap.registerPlugin(ScrollTrigger);
  let lenis = null;
  if (window.Lenis && !reduce) {
    lenis = new Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 1 });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
  }
  // Scroll velocity in px/frame, measured each tick so it always settles back to 0
  let vel = 0, lastY = scrollY;
  gsap.ticker.add(() => { const y = scrollY; vel += ((y - lastY) - vel) * 0.25; lastY = y; });
  const velocity = () => vel;

  // Anchor links glide instead of jump
  $$('a[href^="#"]').forEach((a) => a.addEventListener("click", (e) => {
    const target = $(a.getAttribute("href"));
    if (!target) return;
    e.preventDefault();
    if (menuOpen) toggleMenu(false);
    if (lenis) lenis.scrollTo(target, { duration: 1.8, easing: (x) => 1 - Math.pow(1 - x, 4) });
    else target.scrollIntoView();
  }));

  /* ---------- Mobile menu ---------- */
  let menuOpen = false;
  const menuTl = gsap.timeline({ paused: true })
    .set(menu, { visibility: "visible" })
    .to(menu, { clipPath: "inset(0 0 0% 0)", duration: 0.9, ease: "expo.inOut" })
    .from(".menu nav a span", { yPercent: 110, duration: 0.9, stagger: 0.06, ease: "expo.out" }, "-=0.45")
    .from(".menu-foot", { opacity: 0, duration: 0.4 }, "-=0.5");
  function toggleMenu(open) {
    menuOpen = open;
    root.classList.toggle("menu-open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    menu.setAttribute("aria-hidden", String(!open));
    $(".menu-btn-text").textContent = open ? "Close" : "Menu";
    open ? menuTl.timeScale(1).play() : menuTl.timeScale(1.6).reverse();
    if (lenis) open ? lenis.stop() : lenis.start();
  }
  menuBtn.addEventListener("click", () => toggleMenu(!menuOpen));
  addEventListener("keydown", (e) => { if (e.key === "Escape" && menuOpen) toggleMenu(false); });

  /* ---------- Custom cursor ---------- */
  if (finePointer) {
    const cursor = $(".cursor"), label = $(".cursor-label");
    root.classList.add("has-cursor");
    const xTo = gsap.quickTo(cursor, "x", { duration: 0.5, ease: "power3" });
    const yTo = gsap.quickTo(cursor, "y", { duration: 0.5, ease: "power3" });
    gsap.set(cursor, { x: innerWidth / 2, y: innerHeight / 2 });
    addEventListener("pointermove", (e) => { xTo(e.clientX); yTo(e.clientY); }, { passive: true });
    document.addEventListener("pointerover", (e) => {
      const lab = e.target.closest("[data-cursor]");
      const hov = e.target.closest("a, button, .cap");
      cursor.classList.toggle("is-label", !!lab);
      cursor.classList.toggle("is-hover", !lab && !!hov);
      cursor.classList.toggle("is-dark", !lab && !!e.target.closest(".cap"));
      if (lab) label.textContent = lab.dataset.cursor;
    });
    root.addEventListener("pointerleave", () => gsap.to(cursor, { opacity: 0, duration: 0.3 }));
    root.addEventListener("pointerenter", () => gsap.to(cursor, { opacity: 1, duration: 0.3 }));

    // Magnetic elements
    $$("[data-magnetic]").forEach((el) => {
      const mx = gsap.quickTo(el, "x", { duration: 0.9, ease: "elastic.out(1, 0.35)" });
      const my = gsap.quickTo(el, "y", { duration: 0.9, ease: "elastic.out(1, 0.35)" });
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        mx((e.clientX - (r.left + r.width / 2)) * 0.35);
        my((e.clientY - (r.top + r.height / 2)) * 0.35);
      });
      el.addEventListener("pointerleave", () => { mx(0); my(0); });
    });
  }

  /* ---------- Page progress ---------- */
  gsap.to(".progress span", { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: 0.3 } });

  /* ---------- Hero name: fit to width, split per character ---------- */
  const heroName = $("#hero-name");
  const heroChars = split(heroName, { maskEach: true });
  const heroMasks = $$(".w", heroName);
  const fitName = () => {
    const hero = $(".hero"), cs = getComputedStyle(hero);
    const avail = hero.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    heroName.style.fontSize = "100px";
    heroName.style.fontSize = `${(100 * avail) / heroName.getBoundingClientRect().width}px`;
  };
  fitName();
  document.fonts && document.fonts.ready.then(() => { fitName(); ScrollTrigger.refresh(); });
  let resizeT = 0;
  addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(fitName, 120); });

  /* ---------- Intro: preloader → hero ---------- */
  const heroFadeKids = $$("[data-hero-fade] > *");
  const intro = gsap.timeline({ defaults: { ease: "expo.out" } });
  if (reduce) {
    loader.remove();
  } else {
    const num = $("#loader-num"), counter = { v: 0 };
    gsap.set(heroChars, { yPercent: 115 });
    gsap.set(heroFadeKids, { opacity: 0, y: 24 });
    gsap.set("#loader-path", { strokeDasharray: 1, strokeDashoffset: 1 });
    intro
      .to(counter, {
        v: 100, duration: 2.2, ease: "power3.inOut",
        onUpdate: () => { num.textContent = String(Math.round(counter.v)).padStart(3, "0"); },
      }, 0)
      .to("#loader-path", { strokeDashoffset: 0, duration: 2.2, ease: "power3.inOut" }, 0)
      .to(".loader-row, .loader-wave", { opacity: 0, y: -20, duration: 0.5, ease: "power2.in", stagger: 0.05 }, "+=0.1")
      .to(loader, { clipPath: "inset(0% 0% 100% 0%)", duration: 1.2, ease: "expo.inOut" }, "-=0.1")
      .to(heroGL, { reveal: 1, duration: 2.4, ease: "power2.out" }, "-=0.7")
      .to(heroChars, { yPercent: 0, duration: 1.6, stagger: 0.055 }, "<0.1")
      .to(heroFadeKids, { opacity: 1, y: 0, duration: 1.2, stagger: 0.08 }, "<0.4")
      .add(() => { loader.remove(); lenis && lenis.start(); }, "<");
  }

  /* ---------- Hero scroll-out ---------- */
  const heroST = (end = "bottom top") => ({ trigger: ".hero", start: "top top", end, scrub: true });
  gsap.to(heroMasks, { yPercent: (i) => -35 - ((i * 53) % 7) * 16, ease: "none", scrollTrigger: heroST() });
  gsap.to("#hero-gl", { scale: 1.2, opacity: 0.25, ease: "none", scrollTrigger: heroST() });
  gsap.to("[data-hero-fade]", { y: -80, opacity: 0, ease: "none", scrollTrigger: heroST("40% top") });

  /* ---------- Marquee bands: speed + direction follow scroll ---------- */
  const bands = [
    { el: $(".band-a .band-inner"), x: 0, base: -0.035 },
    { el: $(".band-b .band-inner"), x: -25, base: 0.03 },
  ];
  let dir = 1;
  if (!reduce) {
    gsap.ticker.add((_, dt) => {
      const v = velocity();
      if (v > 0.3) dir = 1; else if (v < -0.3) dir = -1;
      const boost = 1 + Math.min(Math.abs(v), 60) * 0.12;
      bands.forEach((b) => {
        b.x += b.base * dir * boost * (dt / 16.67);
        if (b.x <= -50) b.x += 50;
        if (b.x > 0) b.x -= 50;
        gsap.set(b.el, { xPercent: b.x });
      });
    });
  }
  gsap.fromTo(".band-a", { rotate: -6 }, { rotate: -1, ease: "none", scrollTrigger: { trigger: ".bands", start: "top bottom", end: "bottom top", scrub: true } });
  gsap.fromTo(".band-b", { rotate: 5 }, { rotate: 1, ease: "none", scrollTrigger: { trigger: ".bands", start: "top bottom", end: "bottom top", scrub: true } });

  if (reduce) return; // everything below is decorative motion

  /* ---------- Work: horizontal scroll on desktop, reveals on mobile ---------- */
  const mm = gsap.matchMedia();
  mm.add("(min-width: 901px)", () => {
    root.classList.add("is-horizontal");
    const track = $("#work-track");
    const cards = $$(".card", track);
    const dist = () => track.scrollWidth - innerWidth;

    const scrollTween = gsap.to(track, {
      x: () => -dist(), ease: "none",
      scrollTrigger: {
        trigger: ".work-pin", start: "top top", end: () => `+=${dist()}`,
        pin: true, scrub: 1, invalidateOnRefresh: true, anticipatePin: 1,
        onUpdate: (self) => gsap.set(".work-progress span", { scaleX: self.progress }),
      },
    });

    cards.forEach((card) => {
      const st = { trigger: card, containerAnimation: scrollTween, start: "left right", end: "left 30%", scrub: true };
      gsap.fromTo(card.querySelector(".card-visual"),
        { clipPath: "inset(12% 0% 12% 30% round 14px)" },
        { clipPath: "inset(0% 0% 0% 0% round 14px)", ease: "none", scrollTrigger: st });
      gsap.from(card.querySelector(".card-num"), { xPercent: 80, ease: "none", scrollTrigger: st });
      gsap.from(card.querySelectorAll(".card-title, .card-desc, .tags"), { x: 120, opacity: 0, stagger: 0.06, ease: "none", scrollTrigger: st });
    });

    // Cards lean into the scroll and spring back when it stops
    let skew = 0;
    const lean = () => {
      skew += (Math.max(-5, Math.min(5, velocity() * -0.25)) - skew) * 0.12;
      gsap.set(cards, { skewX: skew });
    };
    gsap.ticker.add(lean);

    return () => { gsap.ticker.remove(lean); gsap.set(cards, { skewX: 0 }); root.classList.remove("is-horizontal"); };
  });
  mm.add("(max-width: 900px)", () => {
    $$(".card").forEach((card) => {
      gsap.from(card, { y: 80, opacity: 0, duration: 1.2, ease: "expo.out", scrollTrigger: { trigger: card, start: "top 88%" } });
    });
  });


  /* ---------- Manifesto: words light up as you read ---------- */
  const words = split($("#manifesto"), { chars: false });
  gsap.fromTo(words, { opacity: 0.1 }, {
    opacity: 1, ease: "none", stagger: 0.1,
    scrollTrigger: { trigger: "#manifesto", start: "top 80%", end: "bottom 50%", scrub: true },
  });

  /* ---------- Display headings: chars rise from a mask ---------- */
  $$("[data-split]").forEach((el) => {
    const chars = split(el);
    gsap.from(chars, {
      yPercent: 120, rotate: 10, transformOrigin: "0% 100%",
      duration: 1.4, ease: "expo.out", stagger: 0.035,
      scrollTrigger: { trigger: el, start: "top 85%" },
    });
  });

  /* ---------- Generic fade-ups, batched for natural staggering ---------- */
  gsap.set("[data-fade]", { opacity: 0, y: 50 });
  ScrollTrigger.batch("[data-fade]", {
    start: "top 90%",
    onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1.2, ease: "expo.out", stagger: 0.1, overwrite: true }),
  });

  /* ---------- Counting facts ---------- */
  $$("[data-count]").forEach((el) => {
    const end = +el.dataset.count, from = +(el.dataset.from || 0), o = { v: from };
    ScrollTrigger.create({
      trigger: el, start: "top 90%", once: true,
      onEnter: () => gsap.to(o, {
        v: end, duration: 2, ease: "expo.out",
        onUpdate: () => { el.textContent = String(Math.round(o.v)).padStart(2, "0"); },
      }),
    });
  });

  /* ---------- Experience lines draw in ---------- */
  $$(".xp-line").forEach((line) => {
    gsap.from(line, { scaleX: 0, duration: 1.6, ease: "expo.inOut", scrollTrigger: { trigger: line, start: "top 88%" } });
  });

  /* ---------- Footer curtain parallax ---------- */
  gsap.from(".footer-title", {
    yPercent: 45, ease: "none",
    scrollTrigger: { trigger: ".footer-wrap", start: "top bottom", end: "bottom bottom", scrub: true },
  });
  gsap.fromTo("main", { "--shade": 0 }, {
    "--shade": 1, ease: "none",
    scrollTrigger: { trigger: ".footer-wrap", start: "top bottom", end: "bottom bottom", scrub: true },
  });

  addEventListener("load", () => ScrollTrigger.refresh());
})();
