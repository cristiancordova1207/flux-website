// Instalador: versión, enlace, tamaño y SHA-256 viven SOLO en release.json (una nueva versión = cambiar ese archivo).
// Sin JavaScript, los botones ya apuntan en el HTML a la última Release pública (…/releases/latest/download/…).
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

const fmtSize = b => `${(b / 1024 ** 2).toFixed(1).replace(".", ",")} MB`;
fetch("release.json", { cache: "no-cache" })
  .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
  .then(rel => {
    if (!/^https:\/\/github\.com\/cristiancordova1207\/flux-releases\/releases\/download\//.test(rel.url)) return;
    $$("[data-download]").forEach(a => { a.href = rel.url; a.setAttribute("download", rel.file); });
    const fill = { version: `FLUX ${rel.version}`, size: fmtSize(rel.size), sha256: rel.sha256, requirements: rel.requirements };
    $$("[data-release]").forEach(el => { if (fill[el.dataset.release]) el.textContent = fill[el.dataset.release]; });
    $$("[data-copy-sha]").forEach(b => (b.hidden = false));
  })
  .catch(() => {}); // the static links keep working

$$("[data-copy-sha]").forEach(b => b.addEventListener("click", async () => {
  const sha = $("[data-release='sha256']").textContent.trim();
  try { await navigator.clipboard.writeText(sha); toast("SHA-256 copiado."); } catch { toast("No se pudo copiar. Selecciona el texto y cópialo."); }
}));

// Formas de onda decorativas (deterministas por semilla)
$$(".wave").forEach(w => {
  let seed = +w.dataset.seed || 7;
  const n = +w.dataset.n || 60;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let html = "";
  for (let i = 0; i < n; i++) {
    const env = Math.sin((Math.PI * i) / n) * 0.5 + 0.5;
    html += `<i style="height:${Math.round(Math.max(0.12, env * (0.3 + rnd() * 0.7)) * 100)}%"></i>`;
  }
  w.innerHTML = html;
  w.setAttribute("aria-hidden", "true");
});

// Toast
const toastEl = $("#toast");
let toastTimer;
function toast(msg) {
  $("span", toastEl).textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3600);
}
$$("[data-toast]").forEach(b => b.addEventListener("click", () => toast(b.dataset.toast)));

// Header: sombra al hacer scroll + menú móvil
const header = $(".site-header");
const menuBtn = $(".menu-btn");
addEventListener("scroll", () => header.classList.toggle("scrolled", scrollY > 8), { passive: true });
function setMenu(open) {
  header.classList.toggle("open", open);
  menuBtn.setAttribute("aria-expanded", open);
  menuBtn.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
}
menuBtn.addEventListener("click", () => setMenu(!header.classList.contains("open")));
$$("#menu a, #menu button").forEach(a => a.addEventListener("click", () => setMenu(false)));
addEventListener("keydown", e => e.key === "Escape" && setMenu(false));

// "Contacto" abre su pregunta
function openHashDetails() {
  const el = location.hash && document.getElementById(location.hash.slice(1));
  if (el && el.tagName === "DETAILS") el.open = true;
}
addEventListener("hashchange", openHashDetails);
openHashDetails();

// Scroll reveal
const io = new IntersectionObserver(entries => entries.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
}), { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
$$(".rv").forEach(el => io.observe(el));

// Diálogo compartido (descarga y planes). Todo el contenido externo se escribe con textContent / atributos.
const dlg = $("#fxDialog");
const installerUrl = () => ($("[data-download]") || {}).href || "https://github.com/cristiancordova1207/flux-releases/releases/latest/download/FLUX-Setup.exe";
function el(tag, attrs = {}, text = "") {
  const n = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
  if (text) n.textContent = text;
  return n;
}
function openDialog({ title, text, media = null, link = "", steps = [], notes = [], actions = [] }) {
  $("#fxTitle").textContent = title;
  $("#fxText").textContent = text;
  const extra = $("#fxExtra");
  extra.replaceChildren();
  if (media) extra.append(media);
  if (link) extra.append(el("p", { class: "fx-link" }, link));
  if (steps.length) { const ol = el("ol", { class: "fx-steps" }); steps.forEach(s => ol.append(el("li", {}, s))); extra.append(ol); }
  notes.forEach(n => extra.append(el("p", { class: "fx-note" }, n)));
  $("#fxActions").replaceChildren(...actions.map(a => {
    const cls = `btn ${a.primary ? "btn-primary" : "btn-light"}`;
    const b = a.href ? el("a", { class: cls, href: a.href, rel: "noopener" }, a.label) : el("button", { class: cls, type: "button" }, a.label);
    if (a.onClick) b.addEventListener("click", a.onClick);
    return b;
  }));
  if (!dlg.open) dlg.showModal();
}
dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); }); // clic fuera = cerrar
const downloadAction = () => ({ label: "Descargar FLUX", primary: true, href: installerUrl() });
const cancelAction = { label: "Cancelar", onClick: () => dlg.close() };

/** Miniatura real (https, de la plataforma) con estado de carga; si no hay o falla: "Miniatura no disponible". */
function fillThumb(box, src) {
  box.classList.remove("wait");
  if (!src) return box.replaceChildren(el("span", { class: "thumb-na" }, "Miniatura no disponible"));
  const img = el("img", { src, alt: "", referrerpolicy: "no-referrer", decoding: "async" });
  box.classList.add("wait");
  img.addEventListener("load", () => box.classList.remove("wait"));
  img.addEventListener("error", () => fillThumb(box, null));
  box.replaceChildren(img);
}

// Smart Downloader: datos públicos reales vía /api/detect (oEmbed oficial). La web nunca descarga el vídeo.
const result = $("#result");
const STAGES = ["Analizando vídeo...", "Obteniendo información...", "Preparando descarga...", "Listo..."];
const ANIM_MS = reduced ? 0 : 6000, STEP_MS = ANIM_MS / STAGES.length;
const urlIn = $("#url"), dBtn = $("#dDownload"), urlErr = $("#urlErr"), stageEl = $("#dStage");
const DEF_THUMB = $("#dThumb").innerHTML; // ilustración estática del propio HTML (estado inicial)
let video = null, run = 0;

function setCard({ platform, state, title, meta, thumb }) {
  $("#dPlatform").textContent = platform;
  $("#dState").textContent = state;
  $("#dTitle").textContent = title;
  $("#dMeta").textContent = meta;
  if (thumb === undefined) $("#dThumb").innerHTML = DEF_THUMB;
  else fillThumb($("#dThumb"), thumb);
}
function fieldError(msg) {
  urlErr.textContent = msg; urlErr.hidden = !msg;
  urlIn.setAttribute("aria-invalid", msg ? "true" : "false");
  if (msg) urlIn.focus();
}
/** Same rules as the server: http(s) only, no credentials, no local/private hosts. */
function checkUrl(raw) {
  if (!raw) return "Introduce una URL de vídeo.";
  let u;
  try { u = new URL(raw); } catch { return "Introduce una URL válida."; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password || !u.hostname.includes(".") ||
      /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(u.hostname)) return "Introduce una URL válida.";
  return "";
}
const wait = ms => new Promise(r => setTimeout(r, ms));

$("#urlForm").addEventListener("submit", async e => {
  e.preventDefault();
  const raw = urlIn.value.trim();
  const bad = checkUrl(raw);
  fieldError(bad);
  if (bad) { // nada del vídeo anterior queda visible
    run++; video = null; dBtn.hidden = true; result.classList.remove("loading"); result.removeAttribute("aria-busy");
    return setCard({ platform: "Vista previa", state: "Esperando enlace", title: "Pega un enlace para ver su vista previa", meta: "", thumb: undefined });
  }
  const my = ++run; // a newer analysis always wins; old answers are dropped
  video = null; dBtn.hidden = true;
  setCard({ platform: "Vista previa", state: "Analizando", title: "Analizando el enlace", meta: "", thumb: undefined }); // nada del vídeo anterior
  result.style.setProperty("--scan-ms", `${ANIM_MS}ms`);
  result.classList.remove("loading"); void result.offsetWidth; // reinicia la barra
  result.classList.add("loading"); result.setAttribute("aria-busy", "true");
  stageEl.textContent = STAGES[0];
  const started = Date.now();
  let stage = 0, done = false;
  const tick = setInterval(() => { stage = Math.min(stage + 1, done ? 3 : 2); stageEl.textContent = STAGES[stage]; }, STEP_MS || 1);

  let data = {}, status = 0;
  try {
    const r = await fetch(`/api/detect?url=${encodeURIComponent(raw)}`, { headers: { Accept: "application/json" } });
    status = r.status; data = await r.json().catch(() => ({}));
  } catch { status = 0; }
  if (my !== run) return clearInterval(tick);
  done = true;
  const ok = status === 200;
  // Éxito: animación completa (~6 s). Error: se corta en cuanto hay respuesta (mín. 1,2 s), sin decir "Listo".
  await wait(Math.max(0, (ok ? ANIM_MS : Math.min(ANIM_MS, 1200)) - (Date.now() - started)));
  if (ok) { stageEl.textContent = STAGES[3]; await wait(reduced ? 0 : 350); }
  clearInterval(tick);
  if (my !== run) return;
  result.classList.remove("loading"); result.removeAttribute("aria-busy");

  const pname = data.platform?.name || "Enlace";
  if (ok && data.preview) {
    video = { url: data.url, title: data.title || null, platform: pname, thumbnail: data.thumbnail || null };
    setCard({ platform: pname, state: data.video ? "Vídeo detectado" : "Publicación detectada", title: data.title || "Título no disponible", meta: [data.author, pname].filter(Boolean).join(" · "), thumb: data.thumbnail || null });
  } else if (ok) {
    video = { url: data.url, title: null, platform: pname, thumbnail: null };
    setCard({ platform: pname, state: "Sin vista previa pública", title: "Título no disponible", meta: `${pname} no ofrece información pública de este vídeo. Puedes descargarlo con FLUX Desktop.`, thumb: null });
  } else if (status === 400 || status === 429) {
    setCard({ platform: "Vista previa", state: "Esperando enlace", title: "Pega un enlace para ver su vista previa", meta: "", thumb: undefined });
    fieldError(data.error || "Introduce una URL válida.");
  } else if (status === 422) {
    setCard({ platform: "Enlace", state: "No compatible", title: "Esta plataforma no es compatible.", meta: "Prueba con un enlace de YouTube, Vimeo, TikTok, SoundCloud, Dailymotion, X o Reddit.", thumb: null });
  } else if (status === 404) {
    setCard({ platform: pname, state: "No disponible", title: "No se encontró un vídeo público con este enlace.", meta: "Puede ser privado, haberse eliminado o no existir.", thumb: null });
  } else {
    setCard({ platform: pname, state: "No disponible", title: "No fue posible obtener información pública de este vídeo.", meta: "Inténtalo de nuevo más tarde.", thumb: null });
  }
  dBtn.hidden = !video;
  result.classList.add("pop"); setTimeout(() => result.classList.remove("pop"), 320);
});
urlIn.addEventListener("input", () => { if (!urlErr.hidden) fieldError(""); });

function videoMedia(v) {
  const box = el("div", { class: "fx-video" }), th = el("div", { class: "fx-thumb" }), info = el("div");
  fillThumb(th, v.thumbnail);
  info.append(el("b", {}, v.title || "Título no disponible"), el("small", {}, v.platform));
  box.append(th, info);
  return box;
}
function showDownloadWithFlux(v) {
  openDialog({
    title: "Descarga este vídeo con FLUX",
    text: "Para descargar este vídeo necesitas FLUX Desktop instalado. FLUX permite descargar y procesar vídeos directamente desde tu equipo.",
    media: videoMedia(v),
    actions: [downloadAction(), { label: "Ya tengo FLUX", onClick: () => showAlreadyHaveFlux(v) }, cancelAction],
  });
}
function showAlreadyHaveFlux(v) {
  openDialog({
    title: "Ya tengo FLUX",
    text: "Abre FLUX Desktop y pega este enlace en Descargas.",
    link: v.url,
    steps: ["Abre FLUX.", "Ve a Descargas.", "Pega el enlace.", "Pulsa Analizar.", "Selecciona la configuración.", "Descarga el vídeo."],
    notes: ["Descarga solo contenido propio o que tengas derecho a usar, respetando las condiciones de cada plataforma."],
    actions: [{ label: "Copiar enlace", primary: true, onClick: async () => {
      try { await navigator.clipboard.writeText(v.url); toast("Enlace copiado. Pégalo en FLUX → Descargas."); } catch { toast("No se pudo copiar. Selecciona el enlace y cópialo."); }
    } }, cancelAction],
  });
}
dBtn.addEventListener("click", () => video && showDownloadWithFlux(video));

// Planes: el pago se completa en FLUX Desktop con la cuenta del usuario (la web no crea pagos ni conoce al usuario).
// Los datos del plan se leen de su tarjeta: el modal no puede mostrar otro precio que el de la tarjeta.
function planFromCard(code) {
  const c = document.querySelector(`[data-plan="${code}"]`);
  if (!c) return null;
  const txt = sel => (c.querySelector(sel)?.textContent || "").replace(/\s+/g, " ").trim();
  return { code, name: txt(".pname"), price: txt(".price"), credits: txt(".cred"), trial: code === "PLUS" };
}
function planMedia(p) {
  const box = el("div", { class: "fx-plan" });
  const head = el("div", { class: "fx-plan-head" });
  head.append(el("small", {}, "Has seleccionado"), el("b", {}, `FLUX ${p.name}`.replace("FLUX FLUX+", "FLUX+")));
  box.append(head, el("p", { class: "fx-plan-price" }, p.price), el("p", { class: "fx-plan-cred" }, p.credits));
  box.append(el("span", { class: p.trial ? "fx-plan-trial" : "fx-plan-notrial" }, p.trial ? "Prueba gratis 3 días" : "Sin prueba gratuita"));
  return box;
}
function showGetFlux(p) {
  openDialog({
    title: "Descarga FLUX para continuar",
    text: "Para comprar un plan de FLUX necesitas utilizar la aplicación de escritorio. Descarga FLUX para acceder a tus créditos, herramientas y suscripción.",
    media: planMedia(p),
    actions: [downloadAction(), { label: "Ya tengo FLUX", onClick: () => showOpenFlux(p) }, cancelAction],
  });
}
function showOpenFlux(p) {
  openDialog({
    title: "Abre FLUX para continuar",
    text: "Puedes realizar tu compra desde la sección Planes de la aplicación.",
    media: planMedia(p),
    steps: ["Abre FLUX en tu computadora e inicia sesión.", "Ve a la sección Planes.", `Elige ${p.name}${p.trial ? " (puedes empezar con la prueba gratis de 3 días)" : ""}.`, "Completa el pago en la página segura de Stripe que se abre en tu navegador."],
    notes: [
      p.trial ? "Prueba de 3 días: si no cancelas antes de que termine, se cobra el precio mensual y la suscripción se renueva cada mes." : "La suscripción se renueva cada mes. Puedes cancelarla cuando quieras desde FLUX (Planes → Gestionar suscripción).",
      "La sección Planes llega con la próxima versión de FLUX (1.0.1); la versión 1.0.0 todavía no la incluye.",
    ],
    actions: [{ label: "Volver", onClick: () => showGetFlux(p) }, { label: "Cerrar", primary: true, onClick: () => dlg.close() }],
  });
}
$$("[data-buy]").forEach(b => b.addEventListener("click", () => { const p = planFromCard(b.dataset.buy); if (p) showGetFlux(p); }));

// Privacy Lab: limpiar metadatos (ejemplo)
const insp = $("#insp");
const cleanBtn = $("#cleanBtn");
function setCleaned(on) {
  insp.classList.toggle("cleaned", on);
  cleanBtn.setAttribute("aria-pressed", on);
  $("span", cleanBtn).textContent = on ? "Ver original" : "Limpiar metadatos";
}
cleanBtn.addEventListener("click", () => setCleaned(!insp.classList.contains("cleaned")));
const inspIO = new IntersectionObserver(([e]) => {
  if (e.isIntersecting) { setTimeout(() => setCleaned(true), reduced ? 0 : 900); inspIO.disconnect(); }
}, { threshold: 0.3 });
inspIO.observe(insp);

// Transcriptor: formatos de exportación
const FORMATS = {
  txt: "[00:04] Speaker 1: Hola, bienvenidos a FLUX.\n[00:08] Speaker 2: Hoy vamos a hablar de sus funciones.\n[00:14] Speaker 1: Primero vamos a descargar el video.",
  srt: "1\n00:00:04,000 --> 00:00:08,000\nHola, bienvenidos a FLUX.\n\n2\n00:00:08,000 --> 00:00:14,000\nHoy vamos a hablar de sus funciones.\n\n3\n00:00:14,000 --> 00:00:18,000\nPrimero vamos a descargar el video.",
  vtt: "WEBVTT\n\n00:04.000 --> 00:08.000\n<v Speaker 1>Hola, bienvenidos a FLUX.\n\n00:08.000 --> 00:14.000\n<v Speaker 2>Hoy vamos a hablar de sus funciones.\n\n00:14.000 --> 00:18.000\n<v Speaker 1>Primero vamos a descargar el video.",
};
const fmtOut = $("#fmtOut");
$$(".fmt button").forEach(b => b.addEventListener("click", () => {
  $$(".fmt button").forEach(x => x.setAttribute("aria-selected", x === b));
  fmtOut.textContent = FORMATS[b.dataset.fmt];
}));
fmtOut.textContent = FORMATS.txt;

// Transcriptor: cabezal que recorre la onda y resalta la línea activa
const lines = $$("#lines li");
const playhead = $("#playhead");
const LOOP = 18;
function setTime(t) {
  playhead.style.left = `calc(12px + (100% - 24px) * ${t / LOOP})`;
  let active = null;
  lines.forEach(li => { if (t >= +li.dataset.t) active = li; });
  lines.forEach(li => li.classList.toggle("on", li === active));
}
if (reduced) setTime(5);
else {
  let t = 0;
  setInterval(() => { t = (t + 0.25) % LOOP; setTime(t); }, 250);
}

// Separador: solo / silencio / volumen / reproducir
const daw = $("#daw");
const tracks = $$(".trk", daw);
tracks.forEach(trk => {
  const solo = $(".s", trk), mute = $(".m", trk), vol = $("input", trk);
  const setVol = () => trk.style.setProperty("--vol", Math.max(0.15, vol.value / 100));
  setVol();
  vol.addEventListener("input", setVol);
  mute.addEventListener("click", () => {
    const on = mute.getAttribute("aria-pressed") !== "true";
    mute.setAttribute("aria-pressed", on);
    trk.classList.toggle("muted", on);
  });
  solo.addEventListener("click", () => {
    const on = solo.getAttribute("aria-pressed") !== "true";
    tracks.forEach(t => {
      $(".s", t).setAttribute("aria-pressed", on && t === trk);
      t.classList.toggle("soloed", on && t === trk);
    });
    daw.classList.toggle("soloing", on);
  });
});
const dplay = $(".dplay", daw);
dplay.addEventListener("click", () => {
  const on = !daw.classList.contains("playing");
  daw.classList.toggle("playing", on);
  dplay.setAttribute("aria-pressed", on);
  dplay.setAttribute("aria-label", on ? "Pausar vista previa" : "Reproducir vista previa");
});
