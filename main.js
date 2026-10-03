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

// Diálogo compartido (descarga y planes). Todo el contenido se escribe con textContent.
const dlg = $("#fxDialog");
const installerUrl = () => ($("[data-download]") || {}).href || "https://github.com/cristiancordova1207/flux-releases/releases/latest/download/FLUX-Setup.exe";
function el(tag, attrs = {}, text = "") {
  const n = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
  if (text) n.textContent = text;
  return n;
}
function openDialog({ title, text, steps = [], note = "", actions = [] }) {
  $("#fxTitle").textContent = title;
  $("#fxText").textContent = text;
  const extra = $("#fxExtra"), acts = $("#fxActions");
  extra.replaceChildren();
  if (steps.length) { const ol = el("ol", { class: "fx-steps" }); steps.forEach(s => ol.append(el("li", {}, s))); extra.append(ol); }
  if (note) extra.append(el("p", { class: "fx-note" }, note));
  acts.replaceChildren(...actions.map(a => {
    const b = a.href ? el("a", { class: `btn ${a.primary ? "btn-primary" : "btn-light"}`, href: a.href, rel: "noopener" }, a.label) : el("button", { class: `btn ${a.primary ? "btn-primary" : "btn-light"}`, type: "button" }, a.label);
    if (a.onClick) b.addEventListener("click", a.onClick);
    return b;
  }));
  if (!dlg.open) dlg.showModal();
}
dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); }); // clic fuera = cerrar
const downloadAction = () => ({ label: "Descargar FLUX", primary: true, href: installerUrl() });

function showDownloadWithFlux(videoUrl) {
  openDialog({
    title: "Descarga con FLUX",
    text: "La descarga del video se hace en la aplicación de escritorio FLUX para Windows. Esta web no descarga videos.",
    actions: [downloadAction(), { label: "Ya tengo FLUX", onClick: () => showAlreadyHaveFlux(videoUrl) }],
  });
}
function showAlreadyHaveFlux(videoUrl) {
  openDialog({
    title: "Continúa en FLUX",
    text: "Sigue estos pasos en la aplicación:",
    steps: ["Abre FLUX en tu computadora.", "Ve a la sección Descargas.", "Pega el enlace y pulsa Analizar.", "Elige el formato y la calidad, y descarga."],
    note: "Descarga solo contenido propio o que tengas permiso de usar, respetando las condiciones de cada plataforma.",
    actions: videoUrl ? [{ label: "Copiar enlace", primary: true, onClick: async () => {
      try { await navigator.clipboard.writeText(videoUrl); toast("Enlace copiado. Pégalo en FLUX → Descargas."); } catch { toast("No se pudo copiar. Selecciona el enlace y cópialo."); }
    } }] : [],
  });
}

// Smart Downloader: vista previa pública real vía /api/detect. La animación de etapas es solo de la interfaz.
const result = $("#result");
const STAGES = ["Analizando enlace…", "Detectando video…", "Obteniendo información…", "Preparando FLUX…"];
const MIN_MS = reduced ? 0 : 6000;
const urlIn = $("#url"), dBtn = $("#dDownload");
let current = null, busy = false;
const DEF_THUMB = $("#dThumb").innerHTML;
function setCard({ platform, state, title, meta, thumb }) {
  $("#dPlatform").textContent = platform;
  $("#dState").textContent = state;
  $("#dTitle").textContent = title;
  $("#dMeta").textContent = meta;
  const box = $("#dThumb");
  if (thumb) { const img = el("img", { src: thumb, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }); img.addEventListener("error", () => img.remove()); box.replaceChildren(img); }
  else box.innerHTML = DEF_THUMB; // ilustración estática del propio HTML
}


$("#urlForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (busy) return;
  const raw = urlIn.value.trim();
  let parsed;
  try { parsed = new URL(raw); } catch {}
  if (!parsed || !/^https?:$/.test(parsed.protocol)) { toast("Pega un enlace válido que empiece por https://"); urlIn.focus(); return; }
  busy = true; current = null; dBtn.disabled = true;
  result.classList.add("loading"); result.setAttribute("aria-busy", "true");
  let i = 0; $("#dStage").textContent = STAGES[0];
  const tick = setInterval(() => { i = Math.min(i + 1, STAGES.length - 1); $("#dStage").textContent = STAGES[i]; }, MIN_MS / STAGES.length || 1);
  const started = Date.now();
  let data, status = 0;
  try {
    const r = await fetch(`/api/detect?url=${encodeURIComponent(raw)}`, { headers: { Accept: "application/json" } });
    status = r.status; data = await r.json();
  } catch { data = { error: "No se pudo conectar. Revisa tu conexión e inténtalo de nuevo." }; }
  await new Promise(r => setTimeout(r, Math.max(0, MIN_MS - (Date.now() - started))));
  clearInterval(tick);
  result.classList.remove("loading"); result.removeAttribute("aria-busy");
  busy = false;
  const pname = data?.platform?.name || "Enlace";
  if (status === 200 && data.preview) {
    current = data.url;
    setCard({ platform: pname, state: "Video detectado", title: data.title || "Video sin título público", meta: data.author ? `${data.author} · ${data.provider}` : data.provider, thumb: data.thumbnail });
  } else if (status === 200) {
    current = data.url;
    setCard({ platform: pname, state: "Sin vista previa", title: `Enlace de ${pname}`, meta: data.message || "Esta plataforma no ofrece vista previa pública.", thumb: null });
  } else if (status === 422) {
    current = raw; // plataforma sin vista previa en la web: la app puede intentarlo
    setCard({ platform: "Enlace", state: "Sin vista previa", title: "Vista previa no disponible", meta: data.error, thumb: null });
  } else {
    setCard({ platform: pname, state: "No disponible", title: "No se pudo analizar el enlace", meta: data?.error || "Inténtalo de nuevo más tarde.", thumb: null });
  }
  dBtn.disabled = !current;
  result.classList.add("pop"); setTimeout(() => result.classList.remove("pop"), 320);
});
dBtn.addEventListener("click", () => showDownloadWithFlux(current));

// Planes: el pago se hace dentro de la app, con la cuenta de FLUX (la web no crea pagos ni conoce al usuario).
const PLAN_NAMES = { PLUS: "PLUS", PREMIUM: "PREMIUM", FLUX_PLUS: "FLUX+" };
$$("[data-buy]").forEach(b => b.addEventListener("click", () => {
  const plan = PLAN_NAMES[b.dataset.buy], trial = b.hasAttribute("data-trial");
  openDialog({
    title: "Antes de continuar",
    text: "Necesitas la aplicación de escritorio FLUX para utilizar tu plan y procesar tus archivos.",
    actions: [downloadAction(), { label: "Continuar al pago", onClick: () => openDialog({
      title: trial ? "Prueba PLUS 3 días gratis" : `Contratar ${plan}`,
      text: "El pago se hace de forma segura con Stripe desde la aplicación, para asociarlo a tu cuenta de FLUX:",
      steps: ["Abre FLUX e inicia sesión con tu cuenta.", "Ve a la sección Planes.", `Elige ${plan}${trial ? " y pulsa Probar 3 días gratis" : ""}.`, "Completa el pago en la página de Stripe que se abre en tu navegador."],
      note: "La sección Planes llega con la próxima versión de FLUX (1.0.1); la versión 1.0.0 todavía no la incluye.",
      actions: [downloadAction()],
    }) }],
  });
}));

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
