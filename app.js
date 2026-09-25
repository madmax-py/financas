// ===== Configuração =====
const LS_KEY = "financas.v1";

const DEFAULT_CATS = {
  saida: [["Alimentação", "ti-tools-kitchen-2"], ["Moradia", "ti-home"], ["Transporte", "ti-car"],
    ["Lazer", "ti-device-gamepad-2"], ["Saúde", "ti-heartbeat"], ["Educação", "ti-book"],
    ["Compras", "ti-shopping-bag"], ["Assinaturas", "ti-device-tv"], ["Outros", "ti-package"]],
  entrada: [["Salário", "ti-briefcase"], ["Freelance", "ti-device-laptop"], ["Investimentos", "ti-chart-line"],
    ["Presente", "ti-gift"], ["Outros", "ti-plus"]],
};
const METHODS = { pix: "Pix", debito: "Débito", dinheiro: "Dinheiro", credito: "Crédito", boleto: "Boleto" };
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// Ícones: "ti-xxx" vira um ícone do Tabler; qualquer outra coisa (emoji) é mostrada como texto
const ico = (v, extra = "") => (String(v || "").startsWith("ti-")
  ? `<i class="ti ${esc(v)}${extra ? " " + extra : ""}"></i>`
  : `<span class="emo${extra ? " " + extra : ""}">${esc(v || "")}</span>`);
// emojis usados até a versão anterior → ícone equivalente
const ICONES_ANTIGOS = {
  "🍜": "ti-tools-kitchen-2", "🏠": "ti-home", "🚗": "ti-car", "🎮": "ti-device-gamepad-2", "💊": "ti-heartbeat",
  "📚": "ti-book", "🛍️": "ti-shopping-bag", "📺": "ti-device-tv", "📦": "ti-package", "⚖️": "ti-scale",
  "💼": "ti-briefcase", "💻": "ti-device-laptop", "📈": "ti-chart-line", "🎁": "ti-gift", "➕": "ti-plus", "•": "ti-point",
};

// ===== Helpers =====
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mk = (dateStr) => dateStr.slice(0, 7);
const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + f(x), 0);
const uid = () => Math.random().toString(36).slice(2, 10);
const round2 = (v) => Math.round(v * 100) / 100;
const clamp01 = (x) => Math.max(0, Math.min(1, x || 0));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function addM(key, n) {
  const [y, m] = key.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}
const monthsBetween = (a, b) => { const [ya, ma] = a.split("-").map(Number), [yb, mb] = b.split("-").map(Number); return (yb - ya) * 12 + (mb - ma); };
const validM = (k) => /^\d{4}-(0[1-9]|1[0-2])$/.test(k || "");
const mLabel = (k) => { if (!validM(k)) return "—"; const [y, m] = k.split("-"); return `${MONTHS[m - 1]} ${y}`; };
const mShort = (k) => { if (!validM(k)) return "—"; const [y, m] = k.split("-"); return `${MONTHS[m - 1].slice(0, 3)}/${y.slice(2)}`; };
const mName = (k) => (validM(k) ? MONTHS[Number(k.slice(5)) - 1] : "—");
// Lê um mês digitado de vários jeitos, porque alguns navegadores (ex.: Firefox) não têm
// seletor de mês e mostram uma caixa de texto: "2030-12", "12/2030", "dez/2030", "dezembro 2030"
// e "2030" (vira dezembro). Retorna null se vazio e undefined se não entendeu.
function parseMonth(raw) {
  const s = String(raw ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!s) return null;
  const ok = (y, m) => (Number(m) >= 1 && Number(m) <= 12 ? `${y}-${pad(Number(m))}` : undefined);
  let m = s.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (m) return ok(m[1], m[2]);
  m = s.match(/^(\d{1,2})[-/.\s](\d{4})$/);
  if (m) return ok(m[2], m[1]);
  m = s.match(/^([a-z]{3,})[\s/.-]*(?:de\s+)?(\d{4})$/);
  if (m) {
    const i = MONTHS.findIndex((x) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").startsWith(m[1].slice(0, 3)));
    return i >= 0 ? `${m[2]}-${pad(i + 1)}` : undefined;
  }
  m = s.match(/^(\d{4})$/);
  if (m) return `${m[1]}-12`;
  return undefined;
}
const fmtDate = (s) => s.split("-").reverse().join("/");
const daysIn = (k) => { const [y, m] = k.split("-").map(Number); return new Date(y, m, 0).getDate(); };
// variação percentual formatada: "+12%" / "−5%" / "novo"
function delta(cur, prev) {
  if (!prev) return cur ? "novo" : "—";
  const d = Math.round(((cur - prev) / prev) * 100);
  return d === 0 ? "=" : `${d > 0 ? "+" : "−"}${Math.abs(d)}%`;
}

const TODAY = iso(new Date());
const CUR = mk(TODAY);

// ===== Estado =====
let state;
const ui = {
  month: CUR, lineMode: "dia", yearMode: "ano", editing: null, editingRec: null,
  sort: { key: "date", dir: -1 }, dismissed: new Set(), recCreated: 0, goalEditing: null, depGoal: null,
  cloud: false, readOnly: false,
};

// Os dados ficam em dados.json (rodando local com o server.py) ou no Upstash Redis (na Vercel, com senha).
async function load() {
  let r;
  try {
    r = await fetch("api/dados", { cache: "no-store" });
  } catch {
    // sem servidor (ex.: abriu o index.html direto): só leitura, pra não perder nada
    ui.readOnly = true;
    return localFallback();
  }
  ui.cloud = r.headers.get("X-Financas-Auth") === "on";
  if (r.status === 401) { await showLogin(); return load(); }
  if (r.ok) {
    const s = await r.json().catch(() => null);
    if (s && Array.isArray(s.tx)) return s;
  }
  if (r.status === 404) return localFallback(); // primeira vez: ainda não há nada salvo
  // Erro no servidor: não arrisca sobrescrever dados bons com uma tela vazia
  ui.readOnly = true;
  const j = await r.json().catch(() => ({}));
  alert(`Não consegui carregar seus dados (${j.erro || `erro ${r.status}`}). Nada será salvo até você recarregar a página.`);
  return emptyState();
}
function localFallback() {
  // aproveita o que estava salvo no navegador pela primeira versão do app, se houver
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY));
    if (s && Array.isArray(s.tx)) return s;
  } catch {}
  return emptyState();
}

// ===== Login (só na versão hospedada) =====
let loginWaiters = null;
function showLogin(msg = "") {
  $("#login").classList.remove("hidden");
  $("#loginErr").textContent = msg;
  setTimeout(() => $("#loginPass").focus(), 0);
  loginWaiters ||= [];
  return new Promise((resolve) => loginWaiters.push(resolve));
}
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#loginBtn");
  btn.disabled = true;
  $("#loginErr").textContent = "";
  try {
    const r = await fetch("api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha: $("#loginPass").value }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { $("#loginErr").textContent = j.erro || "Não foi possível entrar."; return; }
    $("#login").classList.add("hidden");
    $("#loginPass").value = "";
    const waiting = loginWaiters || [];
    loginWaiters = null;
    waiting.forEach((resolve) => resolve());
  } catch {
    $("#loginErr").textContent = "Sem conexão com o servidor.";
  } finally {
    btn.disabled = false;
  }
});

let saveTimer = null, saveChain = Promise.resolve();
function save() {
  if (ui.readOnly) { setSaveStatus("error"); return; }
  clearTimeout(saveTimer);
  setSaveStatus("saving");
  saveTimer = setTimeout(flush, 300);
}
function flush() {
  saveTimer = null;
  const body = JSON.stringify(state);
  saveChain = saveChain.then(async () => {
    try {
      const r = await fetch("api/dados", { method: "PUT", headers: { "Content-Type": "application/json" }, body });
      if (r.status === 401) { setSaveStatus("error"); await showLogin("Sua sessão expirou. Entre de novo pra salvar."); return flush(); }
      setSaveStatus(r.ok ? "ok" : "error");
      if (r.status === 413) alert((await r.json().catch(() => ({}))).erro);
    } catch { setSaveStatus("error"); }
  });
}
function setSaveStatus(s) {
  const el = $("#saveStatus");
  el.className = `save-status ${s}`;
  el.textContent = { saving: "● salvando…", ok: "● salvo", error: "● erro ao salvar" }[s];
  el.title = s !== "error" ? (ui.cloud ? "Dados salvos na nuvem" : "Dados salvos em dados.json")
    : ui.readOnly ? "Os dados não carregaram direito, então nada está sendo salvo. Recarregue a página."
    : ui.cloud ? "Não consegui salvar na nuvem. Verifique a conexão." : "O server.py está rodando? Abra via http://localhost:5178";
}
// Se a aba fechar com um salvamento pendente, envia na hora
window.addEventListener("pagehide", () => {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  navigator.sendBeacon("api/dados", new Blob([JSON.stringify(state)], { type: "application/json" }));
});

function emptyState() {
  return migrate({ profile: { name: "", photo: "", meta: 0 }, tx: [], rec: [] }, true);
}

// Atualiza dados de versões antigas pro formato atual (categorias, contas, cartões, metas).
function migrate(s, fresh = false) {
  s.profile ||= { name: "", photo: "", meta: 0 };
  s.tx ||= [];
  s.rec ||= [];
  s.goals ||= [];
  for (const g of s.goals) { g.prazo = parseMonth(g.prazo) ?? null; g.aportes ||= []; }
  for (const r of s.rec) r.fim = parseMonth(r.fim) ?? null;
  if (!s.cats) {
    s.cats = {};
    for (const type of ["saida", "entrada"]) {
      s.cats[type] = DEFAULT_CATS[type].map(([name, emoji]) => ({ name, emoji, budget: 0 }));
      for (const x of [...s.tx, ...s.rec]) {
        if (x.type === type && x.cat && !s.cats[type].some((c) => c.name === x.cat)) s.cats[type].push({ name: x.cat, emoji: "•", budget: 0 });
      }
    }
  }
  if (!s.accounts?.length) s.accounts = [{ id: uid(), name: "Conta principal", inicial: 0, tipo: "corrente" }];
  for (const a of s.accounts) a.tipo ||= "corrente";
  s.check ||= { periodo: 7, ultimo: null, historico: [] };
  for (const type of ["saida", "entrada"]) {
    s.cats[type] ||= [];
    if (!s.cats[type].some((c) => c.name === "Ajuste")) s.cats[type].push({ name: "Ajuste", emoji: "ti-scale", budget: 0 });
    for (const c of s.cats[type]) if (ICONES_ANTIGOS[c.emoji]) c.emoji = ICONES_ANTIGOS[c.emoji];
  }
  if (!s.cards) {
    // versão antiga tinha um único "limite do cartão" e toda compra caía na fatura do mês seguinte:
    // fechamento dia 1 + vencimento dia 10 reproduz exatamente isso
    const usedCredit = [...s.tx, ...s.rec].some((t) => t.method === "credito");
    s.cards = !fresh && (usedCredit || s.profile.limite)
      ? [{ id: uid(), name: "Cartão de crédito", limite: s.profile.limite || 0, fecha: 1, vence: 10, conta: s.accounts[0].id }]
      : [];
  }
  delete s.profile.limite;
  s.v = 2;
  normalizeRefs(s);
  return s;
}

// Garante que todo lançamento aponta pra conta/cartão/categoria que existe.
function normalizeRefs(s = state) {
  const accIds = new Set(s.accounts.map((a) => a.id)), cardIds = new Set(s.cards.map((c) => c.id));
  for (const type of ["saida", "entrada"]) {
    if (!s.cats[type].some((c) => c.name === "Outros")) s.cats[type].push({ name: "Outros", emoji: type === "saida" ? "ti-package" : "ti-plus", budget: 0 });
  }
  for (const t of [...s.tx, ...s.rec]) {
    if (!s.cats[t.type].some((c) => c.name === t.cat)) t.cat = "Outros";
    if (t.method === "credito") {
      if (!cardIds.has(t.cartao)) t.cartao = s.cards[0]?.id || null;
      delete t.conta;
    } else {
      if (!accIds.has(t.conta)) t.conta = s.accounts[0].id;
      delete t.cartao;
    }
  }
  for (const c of s.cards) if (!accIds.has(c.conta)) c.conta = s.accounts[0].id;
}

const accById = (id) => state.accounts.find((a) => a.id === id) || state.accounts[0];
const cardById = (id) => state.cards.find((c) => c.id === id) || null;
const catEmoji = (type, name) => state.cats[type].find((c) => c.name === name)?.emoji || "ti-point";
const methodLabel = (t) => {
  if (t.method === "credito" && t.type === "entrada") return `${cardById(t.cartao)?.name || "Cartão"} · estorno`;
  if (t.type === "entrada") return state.accounts.length > 1 ? accById(t.conta).name : "—";
  if (t.method === "credito") return `${cardById(t.cartao)?.name || "Crédito"}${t.parcelas > 1 ? ` ${t.parcelas}x` : ""}`;
  const parcela = t.method === "boleto" && t.parcelas > 1 ? ` ${t.parcela}/${t.parcelas}` : "";
  return `${METHODS[t.method]}${parcela}${state.accounts.length > 1 ? ` · ${accById(t.conta).name}` : ""}`;
};

// ===== Cartões e parcelas =====
// Compra feita a partir do dia de fechamento cai na fatura seguinte. Se o vencimento é
// antes do fechamento no calendário, a fatura vence no mês seguinte ao fechamento.
function firstDueMonth(card, date) {
  if (!card) return addM(mk(date), 1);
  const close = Number(date.slice(8)) >= card.fecha ? addM(mk(date), 1) : mk(date);
  return card.vence > card.fecha ? close : addM(close, 1);
}
const dueDay = (card, k) => `${k}-${pad(Math.min(card?.vence || 10, daysIn(k)))}`;

function installments(t) {
  if (t.method !== "credito") return [];
  const card = cardById(t.cartao);
  // entrada no crédito = estorno/desconto: entra na fatura com sinal negativo
  const sinal = t.type === "entrada" ? -1 : 1;
  const n = sinal < 0 ? 1 : Math.max(1, t.parcelas | 0);
  const k0 = firstDueMonth(card, t.date);
  return Array.from({ length: n }, (_, i) => {
    const due = addM(k0, i);
    return { t, i, n, card, due, dueDate: dueDay(card, due), value: (sinal * t.value) / n };
  });
}

// ===== Recorrências =====
// Cada regra lembra o último mês em que gerou lançamento (r.ultimo). Ao abrir o app,
// cria os lançamentos de todos os meses vencidos desde então. Excluir um lançamento
// gerado não faz ele voltar.
const recDate = (r, k) => `${k}-${pad(Math.min(r.dia, daysIn(k)))}`;
function recNext(r) {
  const k = r.ultimo ? addM(r.ultimo, 1) : r.inicio;
  return !r.fim || k <= r.fim ? k : null;
}
const recToTx = (r, date, extra = {}) => ({ id: uid(), type: r.type, desc: r.desc, cat: r.cat, value: r.value,
  date, method: r.method, parcelas: 1, conta: r.conta, cartao: r.cartao, recId: r.id, ...extra });
function runRecurring() {
  let created = 0;
  for (const r of state.rec) {
    if (!r.ativo) continue;
    for (let k = recNext(r); k && recDate(r, k) <= TODAY; k = recNext(r)) {
      state.tx.push(recToTx(r, recDate(r, k)));
      r.ultimo = k;
      created++;
    }
  }
  normalizeRefs();
  return created;
}
// Ocorrências futuras (ainda não geradas) até o mês `horizon` — usadas na previsão
function virtualRec(horizon) {
  const out = [];
  for (const r of state.rec) {
    if (!r.ativo) continue;
    for (let k = recNext(r); k && k <= horizon && (!r.fim || k <= r.fim); k = addM(k, 1)) {
      const date = recDate(r, k);
      if (date > TODAY) out.push(recToTx(r, date, { id: `v-${r.id}-${k}`, virtual: true }));
    }
  }
  return out;
}

// ===== Cálculos =====
const futuro = (M) => M > CUR;
// Num mês que ainda não chegou, mostra também as recorrências que vão acontecer nele
const previstosDoMes = (M) => (futuro(M) ? virtualRec(M).filter((t) => mk(t.date) === M) : []);

function monthSums(M) {
  const tx = [...state.tx.filter((t) => mk(t.date) === M), ...previstosDoMes(M)];
  const outs = tx.filter((t) => t.type === "saida"), ins = tx.filter((t) => t.type === "entrada");
  const byCat = Object.fromEntries(state.cats.saida.map((c) => [c.name, 0]));
  outs.forEach((t) => { byCat[t.cat] = (byCat[t.cat] || 0) + t.value; });
  return { M, tx, outs, ins, entM: sum(ins, (t) => t.value), saiM: sum(outs, (t) => t.value), byCat };
}

function compute() {
  const virt = virtualRec(addM(CUR, 12));
  const instReal = state.tx.flatMap(installments);
  const instVirt = virt.flatMap(installments);
  const pending = instReal.filter((x) => x.dueDate >= TODAY);
  const debt = sum(pending, (x) => x.value);

  // saldo por conta: saldo inicial + entradas − gastos à vista − faturas já vencidas
  const bal = Object.fromEntries(state.accounts.map((a) => [a.id, a.inicial || 0]));
  const acc = (id) => (id in bal ? id : state.accounts[0].id);
  for (const t of state.tx) {
    if (t.date > TODAY) continue;
    if (t.method === "credito") continue; // crédito só mexe no saldo quando a fatura vence
    if (t.type === "entrada") bal[acc(t.conta)] += t.value;
    else bal[acc(t.conta)] -= t.value;
  }
  for (const x of instReal) if (x.dueDate < TODAY) bal[acc(x.card?.conta)] -= x.value;
  const balance = sum(Object.values(bal));

  const faturas = Array.from({ length: 12 }, (_, i) => {
    const k = addM(CUR, i);
    return { k, v: sum(pending.filter((x) => x.due === k), (x) => x.value), p: sum(instVirt.filter((x) => x.due === k), (x) => x.value) };
  });

  const cards = state.cards.map((c) => {
    const mine = pending.filter((x) => x.card?.id === c.id);
    const nextK = mine.map((x) => x.due).sort()[0];
    return { c, used: sum(mine, (x) => x.value), nextK, nextV: nextK ? sum(mine.filter((x) => x.due === nextK), (x) => x.value) : 0 };
  });
  const limitTotal = sum(state.cards, (c) => c.limite || 0);

  // previsão: saldo de hoje + entradas futuras − gastos à vista futuros − faturas a vencer
  const future = [...state.tx.filter((t) => t.date > TODAY), ...virt];
  const instAll = [...pending, ...instVirt];
  const proj = [];
  let saldo = balance;
  for (let i = 0; i < 6; i++) {
    const k = addM(CUR, i);
    const inM = future.filter((t) => mk(t.date) === k);
    const ent = sum(inM.filter((t) => t.type === "entrada"), (t) => t.value);
    const sai = sum(inM.filter((t) => t.type === "saida" && t.method !== "credito"), (t) => t.value);
    const fat = sum(instAll.filter((x) => x.due === k), (x) => x.value);
    saldo += ent - sai - fat;
    proj.push({ k, ent, sai, fat, saldo });
  }

  const boletosFuturos = state.tx.filter((t) => t.method === "boleto" && t.type === "saida" && t.date > TODAY);
  const boletos = sum(boletosFuturos, (t) => t.value);
  const guardado = sum(state.goals, (g) => goalSaved(g));
  return { virt, instReal, pending, debt, cardDebt: debt, boletos, boletosFuturos, devoTotal: debt + boletos,
    bal, balance, faturas, cards, limitTotal, proj, guardado };
}

const goalSaved = (g) => sum(g.aportes || [], (a) => a.value);

function rank(rate) {
  if (rate >= 0.4) return "S-Rank";
  if (rate >= 0.3) return "A-Rank";
  if (rate >= 0.2) return "B-Rank";
  if (rate >= 0.1) return "C-Rank";
  if (rate >= 0) return "D-Rank";
  return "E-Rank";
}

// ===== Gráficos =====
Chart.defaults.locale = "pt-BR";
Chart.defaults.color = "#8a8a8a";
Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
Chart.defaults.borderColor = "#2e2e2e";
const WHITE = "#f2f2f2", GRAY = "#6e6e6e";
const GAIN = "#3fb950", SPEND = "#e5484d";
const GAIN_FILL = "rgba(63, 185, 80, 0.55)", SPEND_FILL = "rgba(229, 72, 77, 0.55)";
const kfmt = (v) => (Math.abs(v) >= 1000 ? `${v / 1000}k` : v);
const tooltip = { callbacks: { label: (c) => ` ${c.dataset.label ? c.dataset.label + ": " : ""}${brl(c.parsed.r ?? c.parsed.y)}` } };
const legend = { position: "bottom", labels: { boxWidth: 10, boxHeight: 8 } };

const radar = new Chart($("#radarChart"), {
  type: "radar",
  data: { labels: [], datasets: [
    { label: "Gastos", data: [], backgroundColor: "rgba(229, 72, 77, 0.35)", borderColor: SPEND, borderWidth: 1.5, pointRadius: 2.5, pointBackgroundColor: SPEND },
    { label: "Orçamento", data: [], backgroundColor: "transparent", borderColor: GRAY, borderDash: [4, 4], borderWidth: 1.2, pointRadius: 0 },
  ] },
  options: {
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip },
    scales: { r: { beginAtZero: true, angleLines: { color: "#2e2e2e" }, grid: { color: "#2e2e2e" },
      ticks: { backdropColor: "transparent", font: { size: 9 }, callback: kfmt },
      pointLabels: { font: { size: 11 } } } },
  },
});

const line = new Chart($("#lineChart"), {
  type: "line",
  data: { labels: [], datasets: [
    { label: "Gastos", data: [], borderColor: SPEND, backgroundColor: "rgba(229,72,77,0.08)", fill: true, cubicInterpolationMode: "monotone", pointRadius: 0, borderWidth: 1.8 },
    { label: "Entradas", data: [], borderColor: GAIN, backgroundColor: "rgba(63,185,80,0.06)", fill: true, cubicInterpolationMode: "monotone", pointRadius: 0, borderWidth: 1.4 },
    { label: "Gastos mês anterior", data: [], borderColor: GRAY, borderDash: [4, 4], cubicInterpolationMode: "monotone", pointRadius: 0, borderWidth: 1.2 },
  ] },
  options: {
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { ...legend, labels: { boxWidth: 10, boxHeight: 2 } }, tooltip },
    scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: kfmt } } },
  },
});

const yearChart = new Chart($("#yearChart"), {
  type: "bar",
  data: { labels: [], datasets: [] },
  options: {
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend, tooltip },
    scales: { x: { grid: { display: false } }, y: { ticks: { callback: kfmt } } },
  },
});

// Criado só quando a tela de Parcelamentos aparece: um gráfico criado dentro de uma
// tela escondida nasce com largura zero e não se recupera sozinho.
let bar = null;
function criarGraficoFaturas() {
  if (bar) return bar;
  bar = new Chart($("#barChart"), {
    type: "bar",
    data: { labels: [], datasets: [
      { label: "Fatura", data: [], backgroundColor: SPEND_FILL, borderColor: SPEND, borderWidth: 1, borderRadius: 4, stack: "f" },
      { label: "Previsto (recorrentes)", data: [], backgroundColor: "rgba(229, 72, 77, 0.18)", borderColor: SPEND, borderWidth: 1, borderDash: [3, 3], borderRadius: 4, stack: "f" },
    ] },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend, tooltip },
      scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { callback: kfmt } } },
    },
  });
  return bar;
}

// ===== Render =====
function render() {
  const c = compute();
  const m = monthSums(ui.month);
  const prev = monthSums(addM(ui.month, -1));
  const parts = [
    () => renderAlerts(c), () => renderProfile(m), () => renderBars(c, m), () => renderCatStats(m, prev),
    () => renderRight(c, m, prev), () => renderCharts(c, m, prev), renderTable, () => renderParcelas(c),
    renderRec, renderBoletos, renderGoals, () => renderCatCards(m, prev),
  ];
  for (const part of parts) {
    try { part(); } catch (err) { console.error("Erro ao desenhar parte da tela:", err); }
  }
}
function refresh() { save(); renderMonthSelect(); renderFilterOptions(); render(); }

// ----- Alertas -----
function renderAlerts(c) {
  const list = [];
  const cur = monthSums(CUR);
  if (ui.recCreated) list.push(["info", "ti-repeat", `${ui.recCreated} lançamento(s) recorrente(s) criado(s) automaticamente.`]);
  for (const cat of state.cats.saida) {
    const v = cur.byCat[cat.name] || 0;
    if (!cat.budget) continue;
    if (v > cat.budget) list.push(["spend", "ti-alert-hexagon", `Você passou do orçamento de ${cat.name}: ${brl(v)} de ${brl(cat.budget)} (+${brl(v - cat.budget)}).`]);
    else if (v >= cat.budget * 0.9) list.push(["warn", "ti-alert-triangle", `${cat.name} já usou ${Math.round((v / cat.budget) * 100)}% do orçamento do mês.`]);
  }
  if (cur.saiM > cur.entM && cur.entM > 0) list.push(["spend", "ti-chart-bar", `Os gastos de ${mName(CUR).toLowerCase()} (${brl(cur.saiM)}) já passaram as entradas (${brl(cur.entM)}).`]);
  // fatura bem acima da média das últimas
  const next = c.faturas.find((f) => f.v + f.p > 0);
  const past = Array.from({ length: 6 }, (_, i) => addM(CUR, -1 - i)).map((k) => sum(c.instReal.filter((x) => x.due === k), (x) => x.value)).filter((v) => v > 0);
  if (next && past.length >= 2) {
    const avg = sum(past) / past.length, v = next.v + next.p;
    if (v > avg * 1.2) list.push(["spend", "ti-credit-card", `A fatura de ${mShort(next.k)} (${brl(v)}) está ${Math.round((v / avg - 1) * 100)}% acima da sua média (${brl(avg)}).`]);
  }
  for (const { c: card, used } of c.cards) {
    if (card.limite && used / card.limite >= 0.85) list.push(["spend", "ti-credit-card", `${card.name}: ${Math.round((used / card.limite) * 100)}% do limite comprometido.`]);
  }
  const neg = c.proj.find((p) => p.saldo < 0);
  if (neg) list.push(["spend", "ti-telescope", `Pela previsão, seu saldo fica negativo em ${mShort(neg.k)} (${brl(neg.saldo)}).`]);
  for (const g of state.goals) {
    const saved = goalSaved(g);
    if (!g.prazo || saved >= g.alvo) continue;
    const left = monthsBetween(CUR, g.prazo);
    if (left < 0) list.push(["warn", "ti-target-arrow", `O prazo da meta ${g.name} passou (${mShort(g.prazo)}) e faltam ${brl(g.alvo - saved)}.`]);
    else if (left <= 1) list.push(["warn", "ti-target-arrow", `Meta ${g.name}: faltam ${brl(g.alvo - saved)} e o prazo é ${mShort(g.prazo)}.`]);
  }
  for (const g of state.goals) if (goalSaved(g) >= g.alvo && g.alvo > 0) list.push(["gain", "ti-trophy", `Meta ${g.name} concluída!`]);

  if (checkAtrasada() && !ui.dismissed.has("check")) {
    const d = diasDesdeCheck();
    list.unshift(["warn", "ti-circle-check", d === null
      ? "Confira se os saldos do app batem com os do seu banco."
      : `Faz ${d} dia(s) desde a última conferência de saldos.`, "check"]);
  }
  const visible = list.filter(([, , text]) => !ui.dismissed.has(text));
  $("#alerts").innerHTML = visible.map(([level, icon, text, acao]) =>
    `<div class="alert ${level}"><span>${ico(icon)}</span><span class="alert-text">${esc(text)}</span>`
    + (acao === "check" ? `<button class="link-btn" data-open="check">conferir agora</button>` : "")
    + `<button class="alert-x" data-dismiss="${esc(acao || text)}" title="Dispensar"><i class="ti ti-x"></i></button></div>`).join("");
}

function renderProfile(m) {
  const p = state.profile;
  $(".photo").classList.toggle("has-img", !!p.photo);
  $("#photo").src = p.photo || "";
  const nameEl = $("#profileName");
  nameEl.innerHTML = p.name ? esc(p.name) : 'Clique em <i class="ti ti-settings"></i> pra colocar seu nome';
  nameEl.classList.toggle("empty", !p.name);
  const rate = m.entM ? (m.entM - m.saiM) / m.entM : 0;
  $("#rankLabel").textContent = `${m.entM || m.saiM ? rank(rate) : "Sem rank"} · ${mName(ui.month)}`;
}

function renderBars(c, m) {
  const p = state.profile;
  const items = [
    { icon: "ti-building-bank", name: "Reserva", val: p.meta ? c.balance / p.meta : 0, text: p.meta ? `${brl(Math.max(0, c.balance))} / ${brl(p.meta)}` : "defina a meta em ⚙", good: true },
    { icon: "ti-flame", name: "Renda comprometida", val: m.entM ? m.saiM / m.entM : (m.saiM ? 1 : 0), text: brl(m.saiM), good: false },
    { icon: "ti-credit-card", name: "Limite usado", val: c.limitTotal ? c.debt / c.limitTotal : 0, text: c.limitTotal ? `${brl(c.debt)} / ${brl(c.limitTotal)}` : "cadastre um cartão", good: false },
    { icon: "ti-plant-2", name: "Poupança do mês", val: m.entM ? (m.entM - m.saiM) / m.entM : 0, text: brl(m.entM - m.saiM), good: true },
  ];
  $("#bars").innerHTML = items.map((it) => {
    const v = clamp01(it.val);
    const bad = it.good ? v < 0.25 : v > 0.85;
    return `<div class="bar-card">
      <div class="bar-label"><b>${ico(it.icon)} ${it.name}</b><span>${it.text}</span></div>
      <div class="track"><div class="meter ${it.good ? "gain" : "spend"}${bad && v > 0 ? " bad" : ""}"><i style="width:${v * 100}%"></i></div><span class="pct">${Math.round(v * 100)}%</span></div>
    </div>`;
  }).join("");
}

function renderCatStats(m, prev) {
  const max = Math.max(...Object.values(m.byCat), 1);
  $("#catStats").innerHTML = state.cats.saida.map((cat) => {
    const v = m.byCat[cat.name] || 0, pv = prev.byCat[cat.name] || 0;
    const b = cat.budget || 0;
    const w = b ? clamp01(v / b) : v / max;
    const over = b && v > b;
    const d = delta(v, pv);
    return `<div class="stat2">
      <div class="stat-top"><span>${ico(cat.emoji)} ${esc(cat.name)}</span>
        <span class="v ${over ? "neg" : ""}">${v ? brl(v) : "—"}${b ? `<span class="muted"> / ${brl(b)}</span>` : ""}</span></div>
      <div class="stat-bot"><div class="mini spend${over ? " over" : ""}"><i style="width:${w * 100}%"></i></div>
        <span class="dlt ${d.startsWith("+") || d === "novo" ? "neg" : d.startsWith("−") ? "pos" : "muted"}" title="vs ${mName(prev.M)}">${d}</span></div>
    </div>`;
  }).join("");
  const totalBudget = sum(state.cats.saida, (c) => c.budget || 0);
  $("#catTotal").innerHTML = `Total no mês: ${brl(m.saiM)}${totalBudget ? ` de ${brl(totalBudget)} orçados` : ""}`;
}

function renderRight(c, m, prev) {
  $("#debtValue").textContent = brl(c.devoTotal);
  const next = c.faturas.find((f) => f.v > 0);
  const partes = [];
  if (c.cardDebt) partes.push(`cartões ${brl(c.cardDebt)}${next ? ` (próxima fatura ${mShort(next.k)}: ${brl(next.v)})` : ""}`);
  if (c.boletos) partes.push(`carnês ${brl(c.boletos)} em ${c.boletosFuturos.length} parcela(s)`);
  $("#debtSub").textContent = partes.join(" · ") || "Nada pendente no crédito ou em carnês";

  const bal = $("#balanceValue");
  bal.textContent = brl(c.balance);
  bal.classList.toggle("neg", c.balance < 0);
  const accRows = state.accounts.length > 1
    ? state.accounts.map((a) => `<li><span>${a.tipo === "investimento" ? ico("ti-chart-line") + " " : ""}${esc(a.name)}</span><span class="v ${c.bal[a.id] < 0 ? "neg" : ""}">${brl(c.bal[a.id])}</span></li>`)
    : [];
  if (c.guardado) {
    accRows.push(`<li class="muted"><span><i class="ti ti-target-arrow"></i> Guardado em metas</span><span class="v">− ${brl(c.guardado)}</span></li>`);
    accRows.push(`<li><span><b>Livre pra usar</b></span><span class="v ${c.balance - c.guardado < 0 ? "neg" : "pos"}"><b>${brl(c.balance - c.guardado)}</b></span></li>`);
  }
  const dCheck = diasDesdeCheck();
  $("#checkFoot").textContent = state.check.ultimo
    ? `Última conferência: ${fmtDate(state.check.ultimo)}${dCheck ? ` (${dCheck} dia(s) atrás)` : " (hoje)"}`
    : "Nunca conferido com o banco";
  $("#accList").innerHTML = accRows.join("") || `<li class="muted small-text">Entradas − gastos à vista − faturas já vencidas</li>`;

  $("#cardList").innerHTML = c.cards.length ? c.cards.map(({ c: card, used, nextK, nextV }) => {
    const u = card.limite ? used / card.limite : 0;
    return `<li class="card-row">
      <div class="card-line"><b>${esc(card.name)}</b><span class="v neg">${brl(used)}${card.limite ? `<span class="muted"> / ${brl(card.limite)}</span>` : ""}</span></div>
      <div class="mini spend${u > 0.85 ? " over" : ""}"><i style="width:${clamp01(u) * 100}%"></i></div>
      <div class="muted small-text">fecha dia ${card.fecha} · vence dia ${card.vence}${nextK ? ` · próxima: ${brl(nextV)} em ${fmtDate(dueDay(card, nextK))}` : ""}</div>
    </li>`;
  }).join("") : `<li class="muted small-text">Nenhum cartão cadastrado. Clique em "editar" pra adicionar.</li>`;

  const six = c.faturas.slice(0, 6);
  const max = Math.max(...six.map((f) => f.v + f.p), 1);
  $("#faturasList").innerHTML = six.map((f, i) => {
    const tot = f.v + f.p;
    return `<li class="fat-row ${i === 0 ? "now" : ""}"><span class="m">${mShort(f.k)}</span>
     <div class="mini spend"><i style="width:${(tot / max) * 100}%"></i></div>
     <span class="v ${tot ? "neg" : "muted"}" ${f.p ? `title="${brl(f.p)} previsto de recorrências"` : ""}>${f.p ? "~" : ""}${brl(tot)}</span></li>`;
  }).join("");
  $("#faturasFoot").textContent = six.some((f) => f.p) ? "~ inclui gastos recorrentes no crédito previstos" : "";

  $("#resumoTitle").innerHTML = `<i class="ti ti-clipboard-list"></i> Resumo de ${mLabel(ui.month)}${futuro(ui.month) ? " (previsto)" : ""}`;
  const res = m.entM - m.saiM, pres = prev.entM - prev.saiM;
  const elapsed = ui.month === CUR ? Number(TODAY.slice(8)) : daysIn(ui.month);
  const biggest = m.outs.reduce((a, t) => (!a || t.value > a.value ? t : a), null);
  const dl = (cur, pv, goodUp) => {
    const d = delta(cur, pv);
    const up = d.startsWith("+") || d === "novo";
    const cls = d === "—" || d === "=" ? "muted" : up === goodUp ? "pos" : "neg";
    return `<small class="dlt ${cls}" title="vs ${mName(prev.M)}">${d}</small>`;
  };
  $("#resumoList").innerHTML = [
    ["Entradas", `<span class="pos">${brl(m.entM)}</span>${dl(m.entM, prev.entM, true)}`],
    ["Gastos", `<span class="neg">${brl(m.saiM)}</span>${dl(m.saiM, prev.saiM, false)}`],
    ["Resultado", `<span class="${res >= 0 ? "pos" : "neg"}">${brl(res)}</span>${dl(res, pres, true)}`],
    ["Média diária de gasto", brl(m.saiM / Math.max(1, elapsed))],
    ["Maior gasto", biggest ? `${esc(biggest.desc)} · <span class="neg">${brl(biggest.value)}</span>` : "—"],
    ["Lançamentos", m.tx.length],
  ].map(([k, v]) => `<li>${k}<span class="v">${v}</span></li>`).join("");
}

function renderCharts(c, m, prev) {
  const prevs = previstosDoMes(ui.month);
  $("#radarFoot").innerHTML = prevs.length
    ? `<i class="ti ti-telescope"></i> Inclui ${prevs.length} recorrência(s) prevista(s) para ${mName(ui.month).toLowerCase()} · tracejado = orçamento`
    : '<i class="ti ti-sparkles"></i> Gastos por categoria · tracejado = orçamento';
  radar.data.labels = state.cats.saida.map((x) => x.name);
  radar.data.datasets[0].data = state.cats.saida.map((x) => m.byCat[x.name] || 0);
  const hasBudget = state.cats.saida.some((x) => x.budget);
  radar.data.datasets[1].data = hasBudget ? state.cats.saida.map((x) => x.budget || 0) : [];
  radar.update();

  const n = daysIn(ui.month);
  const byDay = (list) => { const a = Array(n).fill(0); list.forEach((t) => { const d = Number(t.date.slice(8)) - 1; if (d < n) a[d] += t.value; }); return a; };
  const acc = (a) => a.map(((s) => (v) => (s += v))(0));
  const f = ui.lineMode === "acum" ? acc : (a) => a;
  line.data.labels = Array.from({ length: n }, (_, i) => i + 1);
  line.data.datasets[0].data = f(byDay(m.outs));
  line.data.datasets[1].data = f(byDay(m.ins));
  line.data.datasets[2].label = `Gastos em ${mName(prev.M).toLowerCase()}`;
  line.data.datasets[2].data = f(byDay(prev.outs));
  line.update();
  renderCompare(m, prev);

  if (ui.yearMode === "ano") {
    const ks = Array.from({ length: 12 }, (_, i) => addM(CUR, i - 11));
    const ms = ks.map(monthSums);
    yearChart.data.labels = ks.map(mShort);
    yearChart.data.datasets = [
      { label: "Entradas", data: ms.map((x) => x.entM), backgroundColor: GAIN_FILL, borderColor: GAIN, borderWidth: 1, borderRadius: 3 },
      { label: "Gastos", data: ms.map((x) => x.saiM), backgroundColor: SPEND_FILL, borderColor: SPEND, borderWidth: 1, borderRadius: 3 },
      { type: "line", label: "Resultado", data: ms.map((x) => x.entM - x.saiM), borderColor: WHITE, backgroundColor: WHITE, pointRadius: 2, borderWidth: 1.5, tension: 0.3 },
    ];
    const active = ms.filter((x) => x.entM || x.saiM);
    $("#yearFoot").innerHTML = active.length
      ? `Média mensal: <span class="pos">${brl(sum(active, (x) => x.entM) / active.length)}</span> de entradas · <span class="neg">${brl(sum(active, (x) => x.saiM) / active.length)}</span> de gastos`
      : "Sem lançamentos nos últimos 12 meses";
  } else {
    yearChart.data.labels = c.proj.map((p) => mShort(p.k));
    yearChart.data.datasets = [
      { label: "Entradas previstas", data: c.proj.map((p) => p.ent), backgroundColor: GAIN_FILL, borderColor: GAIN, borderWidth: 1, borderRadius: 3 },
      { label: "Saídas previstas (à vista + faturas)", data: c.proj.map((p) => p.sai + p.fat), backgroundColor: SPEND_FILL, borderColor: SPEND, borderWidth: 1, borderRadius: 3 },
      { type: "line", label: "Saldo previsto", data: c.proj.map((p) => p.saldo), borderColor: WHITE, backgroundColor: WHITE, pointRadius: 2.5, borderWidth: 1.8, tension: 0.3,
        segment: { borderColor: (ctx) => (ctx.p1.parsed.y < 0 ? SPEND : WHITE) } },
    ];
    const last = c.proj[c.proj.length - 1];
    $("#yearFoot").innerHTML = `Saldo previsto no fim de ${mShort(last.k)}: <span class="${last.saldo < 0 ? "neg" : "pos"}">${brl(last.saldo)}</span> · considera recorrências, parcelas e lançamentos futuros`;
  }
  yearChart.update();

  if (bar) {
    bar.data.labels = c.faturas.map((x) => mShort(x.k));
    bar.data.datasets[0].data = c.faturas.map((x) => x.v);
    bar.data.datasets[1].data = c.faturas.map((x) => x.p);
    bar.update();
  }
}

function renderCompare(m, prev) {
  if (!prev.tx.length && !m.tx.length) { $("#compare").innerHTML = ""; return; }
  const diffs = state.cats.saida.map((c) => ({ c, d: (m.byCat[c.name] || 0) - (prev.byCat[c.name] || 0) })).sort((a, b) => b.d - a.d);
  const up = diffs[0], down = diffs[diffs.length - 1];
  const parts = [
    `<span>vs ${mName(prev.M).toLowerCase()}:</span>`,
    `<span>entradas <b class="${m.entM >= prev.entM ? "pos" : "neg"}">${delta(m.entM, prev.entM)}</b></span>`,
    `<span>gastos <b class="${m.saiM <= prev.saiM ? "pos" : "neg"}">${delta(m.saiM, prev.saiM)}</b></span>`,
  ];
  if (up && up.d > 0) parts.push(`<span>maior alta: ${up.c.emoji} ${esc(up.c.name)} <b class="neg">+${brl(up.d)}</b></span>`);
  if (down && down.d < 0) parts.push(`<span>maior queda: ${down.c.emoji} ${esc(down.c.name)} <b class="pos">−${brl(-down.d)}</b></span>`);
  $("#compare").innerHTML = parts.join("");
}

function renderMonthSelect() {
  const keys = new Set([CUR, ui.month, ...state.tx.map((t) => mk(t.date))]);
  const sorted = [...keys].sort().reverse();
  $("#monthSel").innerHTML = sorted.map((k) => `<option value="${k}" ${k === ui.month ? "selected" : ""}>${mLabel(k)}</option>`).join("");
}

// ----- Tabela de lançamentos (filtros + ordenação) -----
function renderFilterOptions() {
  const keep = (sel, html) => { const v = sel.value; sel.innerHTML = html; if ([...sel.options].some((o) => o.value === v)) sel.value = v; };
  keep($("#fCat"), `<option value="">Todas as categorias</option>`
    + `<optgroup label="Gastos">${state.cats.saida.map((c) => `<option value="saida|${esc(c.name)}">${esc(c.name)}</option>`).join("")}</optgroup>`
    + `<optgroup label="Entradas">${state.cats.entrada.map((c) => `<option value="entrada|${esc(c.name)}">${esc(c.name)}</option>`).join("")}</optgroup>`);
  keep($("#fMethod"), `<option value="">Todos os métodos</option>`
    + ["pix", "debito", "dinheiro", "boleto"].map((k) => `<option value="${k}">${METHODS[k]}</option>`).join("")
    + (state.cards.length ? state.cards.map((c) => `<option value="card:${c.id}">Cartão · ${esc(c.name)}</option>`).join("") : `<option value="credito">Crédito</option>`)
    + (state.accounts.length > 1 ? `<optgroup label="Conta">${state.accounts.map((a) => `<option value="acc:${a.id}">Conta · ${esc(a.name)}</option>`).join("")}</optgroup>` : ""));
}

function renderTable() {
  const q = $("#fSearch").value.trim().toLowerCase();
  const type = $("#fType").value, scope = $("#fScope").value;
  const cat = $("#fCat").value, meth = $("#fMethod").value;
  const min = Number($("#fMin").value) || 0, max = Number($("#fMax").value) || Infinity;
  const matchMethod = (t) => {
    if (!meth) return true;
    if (meth.startsWith("card:")) return t.method === "credito" && t.cartao === meth.slice(5);
    if (meth.startsWith("acc:")) return t.method !== "credito" && t.conta === meth.slice(4);
    return t.type === "saida" && t.method === meth;
  };
  const base = scope === "todos" ? state.tx : [...state.tx, ...previstosDoMes(ui.month)];
  const rows = base.filter((t) =>
    (scope === "todos" || mk(t.date) === ui.month) && (!type || t.type === type) && (!q || t.desc.toLowerCase().includes(q))
    && (!cat || `${t.type}|${t.cat}` === cat) && matchMethod(t) && t.value >= min && t.value <= max);

  const { key, dir } = ui.sort;
  const val = (t) => key === "value" ? (t.type === "entrada" ? t.value : -t.value) : key === "method" ? methodLabel(t) : String(t[key]).toLowerCase();
  rows.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : b.date.localeCompare(a.date)) * dir; });
  $$("th.sortable").forEach((th) => { th.dataset.dir = th.dataset.sort === key ? (dir > 0 ? "asc" : "desc") : ""; });

  const ins = sum(rows.filter((t) => t.type === "entrada"), (t) => t.value), outs = sum(rows.filter((t) => t.type === "saida"), (t) => t.value);
  $("#tableSum").innerHTML = `${rows.length} lançamento(s) · <span class="pos">+ ${brl(ins)}</span> · <span class="neg">− ${brl(outs)}</span>`;

  $("#txBody").innerHTML = rows.length ? rows.map((t) => {
    const isIn = t.type === "entrada";
    return `<tr>
      <td>${fmtDate(t.date)}</td>
      <td class="desc">${esc(t.desc)}${t.virtual ? `<span class="rec-icon" title="Ainda não aconteceu: previsão pela recorrência"><i class="ti ti-telescope"></i></span>` : t.recId ? `<span class="rec-icon" title="Gerado por recorrência"><i class="ti ti-repeat"></i></span>` : ""}${t.fitid || t.imported ? `<span class="rec-icon" title="Importado de extrato"><i class="ti ti-upload"></i></span>` : ""}</td>
      <td>${ico(catEmoji(t.type, t.cat))} ${esc(t.cat)}</td>
      <td>${isIn && state.accounts.length < 2 ? "—" : `<span class="tag ${t.method}">${esc(methodLabel(t))}</span>`}</td>
      <td class="r ${isIn ? "pos" : "neg"}">${isIn ? "+" : "−"} ${brl(t.value)}</td>
      <td><div class="row-actions">${t.virtual ? `<span class="muted small-text">previsto</span>`
        : `<button data-edit="${t.id}" title="Editar"><i class="ti ti-pencil"></i></button><button data-del="${t.id}" title="Excluir"><i class="ti ti-trash"></i></button>`}</div></td>
    </tr>`;
  }).join("") : `<tr><td colspan="6" class="empty">Nenhum lançamento encontrado.</td></tr>`;
}

function renderParcelas(c) {
  const byTx = new Map();
  c.instReal.forEach((x) => { if (!byTx.has(x.t.id)) byTx.set(x.t.id, []); byTx.get(x.t.id).push(x); });
  const rows = [...byTx.values()]
    .map((list) => { const pend = list.filter((x) => x.dueDate >= TODAY); return { t: list[0].t, card: list[0].card, n: list.length, pend, next: pend[0] }; })
    .filter((r) => r.pend.length)
    .sort((a, b) => sum(b.pend, (x) => x.value) - sum(a.pend, (x) => x.value));
  $("#parcBody").innerHTML = rows.length ? rows.map((r) =>
    `<tr><td class="desc">${ico(catEmoji("saida", r.t.cat))} ${esc(r.t.desc)}</td><td>${esc(r.card?.name || "—")}</td><td>${fmtDate(r.t.date)}</td>
     <td>${r.next.i + 1}/${r.n} <span class="muted">(vence ${fmtDate(r.next.dueDate)})</span></td>
     <td class="r">${brl(r.t.value / r.n)}</td><td class="r neg">${brl(sum(r.pend, (x) => x.value))}</td>
     <td><div class="row-actions"><button data-edit="${r.t.id}" title="Editar compra"><i class="ti ti-pencil"></i></button><button data-del="${r.t.id}" title="Excluir compra"><i class="ti ti-trash"></i></button></div></td></tr>`).join("")
    + `<tr><td colspan="5"><b>Total devido (bruto)</b></td><td class="r neg"><b>${brl(c.debt)}</b></td><td></td></tr>`
    : `<tr><td colspan="7" class="empty">Nenhuma compra no crédito pendente.</td></tr>`;
}

function renderBoletos() {
  const grupos = new Map();
  for (const t of state.tx) {
    if (t.method !== "boleto" || t.type !== "saida" || !t.grupo) continue;
    if (!grupos.has(t.grupo)) grupos.set(t.grupo, []);
    grupos.get(t.grupo).push(t);
  }
  const linhas = [...grupos.values()].map((list) => {
    list.sort((a, b) => a.date.localeCompare(b.date));
    const n = list[0].parcelas || list.length;
    const faltam = list.filter((t) => t.date > TODAY);
    const pagas = n - faltam.length;
    return { list, n, pagas, faltam, next: faltam[0], falta: sum(faltam, (t) => t.value) };
  }).filter((g) => g.faltam.length).sort((a, b) => b.falta - a.falta);

  $("#boletoCard").classList.toggle("hidden", !linhas.length);
  $("#boletoBody").innerHTML = linhas.map((g) => {
    const t = g.next;
    return `<tr>
      <td class="desc">${ico(catEmoji("saida", t.cat))} ${esc(t.desc)}</td>
      <td>${esc(accById(t.conta).name)}</td>
      <td>
        <div class="prog"><span>${g.pagas}/${g.n} pagas</span><div class="mini spend"><i style="width:${(g.pagas / g.n) * 100}%"></i></div></div>
      </td>
      <td>${fmtDate(t.date)} <span class="muted">(${t.parcela}ª)</span></td>
      <td class="r">${brl(t.value)}</td>
      <td class="r neg">${brl(g.falta)}</td>
      <td><div class="row-actions">
        <button data-edit="${t.id}" title="Editar a próxima parcela"><i class="ti ti-pencil"></i></button>
        <button data-boleto-reajuste="${t.grupo}" title="Mudar o valor das parcelas que faltam"><i class="ti ti-currency-dollar"></i></button>
        <button data-boleto-del="${t.grupo}" title="Excluir as parcelas que faltam"><i class="ti ti-trash"></i></button>
      </div></td>
    </tr>`;
  }).join("") || `<tr><td colspan="7" class="empty">Nenhum carnê em aberto.</td></tr>`;
}

function renderRec() {
  const active = state.rec.filter((r) => r.ativo && recNext(r));
  const ins = sum(active.filter((r) => r.type === "entrada"), (r) => r.value);
  const outs = sum(active.filter((r) => r.type === "saida"), (r) => r.value);
  $("#recSummary").innerHTML = `<span>Por mês: entradas <b class="pos">+ ${brl(ins)}</b></span><span>gastos <b class="neg">− ${brl(outs)}</b></span><span>sobra <b class="${ins - outs >= 0 ? "pos" : "neg"}">${brl(ins - outs)}</b></span>`;
  const rows = [...state.rec].sort((a, b) => b.ativo - a.ativo || a.dia - b.dia);
  $("#recBody").innerHTML = rows.length ? rows.map((r) => {
    const isIn = r.type === "entrada";
    const next = recNext(r);
    const nextTxt = !next ? "encerrada" : !r.ativo ? "pausada" : fmtDate(recDate(r, next));
    return `<tr class="${r.ativo && next ? "" : "paused"}">
      <td class="desc">${esc(r.desc)}</td>
      <td>${ico(catEmoji(r.type, r.cat))} ${esc(r.cat)}</td>
      <td>${isIn && state.accounts.length < 2 ? "—" : `<span class="tag ${r.method}">${esc(methodLabel(r))}</span>`}</td>
      <td>dia ${r.dia}</td>
      <td>${mShort(r.inicio)} → ${r.fim ? mShort(r.fim) : "sem fim"}</td>
      <td>${nextTxt}</td>
      <td class="r ${isIn ? "pos" : "neg"}">${isIn ? "+" : "−"} ${brl(r.value)}</td>
      <td><div class="row-actions">
        ${next ? `<button data-rec-toggle="${r.id}" title="${r.ativo ? "Pausar" : "Retomar"}">${r.ativo ? '<i class="ti ti-player-pause"></i>' : '<i class="ti ti-player-play"></i>'}</button>` : ""}
        <button data-rec-edit="${r.id}" title="Editar"><i class="ti ti-pencil"></i></button>
        <button data-rec-del="${r.id}" title="Excluir"><i class="ti ti-trash"></i></button>
      </div></td>
    </tr>`;
  }).join("") : `<tr><td colspan="8" class="empty">Nenhuma recorrência ainda. Ex.: salário, aluguel, academia, streaming…</td></tr>`;
}

function renderGoals() {
  const total = sum(state.goals, (g) => g.alvo), saved = sum(state.goals, goalSaved);
  $("#goalSummary").innerHTML = state.goals.length
    ? `<span>Guardado: <b class="pos">${brl(saved)}</b> de <b>${brl(total)}</b></span><span>${state.goals.filter((g) => goalSaved(g) >= g.alvo).length}/${state.goals.length} concluída(s)</span>`
    : "";
  $("#goalCards").innerHTML = state.goals.length ? state.goals.map((g) => {
    const s = goalSaved(g), p = clamp01(s / g.alvo), done = s >= g.alvo;
    const left = g.prazo ? monthsBetween(CUR, g.prazo) + 1 : null;
    const perMonth = left && left > 0 && !done ? (g.alvo - s) / left : null;
    const deadline = !g.prazo ? "sem prazo" : left <= 0 ? `prazo era ${mShort(g.prazo)}` : `até ${mShort(g.prazo)} · ${left} ${left === 1 ? "mês" : "meses"}`;
    return `<div class="goal-card${done ? " done" : ""}">
      <div class="goal-top"><span class="goal-emoji">${ico(g.emoji || "ti-target")}</span>
        <div><div class="goal-name">${esc(g.name)}</div><div class="muted small-text">${deadline}</div></div></div>
      <div class="goal-val"><b class="pos">${brl(s)}</b> <span class="muted">de ${brl(g.alvo)}</span></div>
      <div class="meter gain"><i style="width:${p * 100}%"></i></div>
      <div class="goal-foot"><span>${Math.round(p * 100)}%</span><span class="muted">${done ? '<i class="ti ti-trophy"></i> concluída' : perMonth ? `guarde ${brl(perMonth)}/mês` : `faltam ${brl(g.alvo - s)}`}</span></div>
      <div class="goal-actions">
        <button class="btn gain small" data-goal-dep="${g.id}"><i class="ti ti-plus"></i> Guardar / retirar</button>
        <div class="row-actions"><button data-goal-edit="${g.id}" title="Editar"><i class="ti ti-pencil"></i></button><button data-goal-del="${g.id}" title="Excluir"><i class="ti ti-trash"></i></button></div>
      </div>
    </div>`;
  }).join("") : `<div class="empty-card">Nenhuma meta ainda. Crie uma pra acompanhar quanto falta (viagem, reserva, notebook…).</div>`;
}

const BANNERS = [
  ["#161616", "#3a3a3a"], ["#1a1a1a", "#4a4a4a"], ["#141414", "#2f2f2f"], ["#1c1c1c", "#555"],
  ["#121212", "#404040"], ["#181818", "#383838"], ["#151515", "#4f4f4f"], ["#1b1b1b", "#333"], ["#131313", "#454545"],
];
function renderCatCards(m, prev) {
  const total = m.saiM || 1;
  const budget = sum(state.cats.saida, (c) => c.budget || 0);
  $("#catSummary").innerHTML = `<span>Gasto em ${mName(ui.month).toLowerCase()}: <b class="neg">${brl(m.saiM)}</b></span>`
    + (budget ? `<span>orçado: <b>${brl(budget)}</b></span><span>${m.saiM <= budget ? `sobra <b class="pos">${brl(budget - m.saiM)}</b>` : `estourou <b class="neg">${brl(m.saiM - budget)}</b>`}</span>` : "");
  $("#catCards").innerHTML = state.cats.saida.map((cat, i) => {
    const v = m.byCat[cat.name] || 0, pv = prev.byCat[cat.name] || 0;
    const [a, b] = BANNERS[i % BANNERS.length];
    const w = cat.budget ? clamp01(v / cat.budget) : v / total;
    const over = cat.budget && v > cat.budget;
    return `<div class="cat-card">
      <div class="cat-banner" style="background:radial-gradient(circle at 70% 30%, ${b}, ${a} 70%)">${ico(cat.emoji)}</div>
      <div class="cat-body"><div class="cat-name">${esc(cat.name)}<span class="muted">${cat.budget ? `${Math.round((v / cat.budget) * 100)}% do teto` : `${Math.round((v / total) * 100)}%`}</span></div>
      <div class="cat-val"><span class="${v ? "neg" : ""}">${brl(v)}</span>${cat.budget ? ` de ${brl(cat.budget)}` : ""} · ${delta(v, pv)} vs ${mName(prev.M).slice(0, 3).toLowerCase()}</div>
      <div class="mini spend${over ? " over" : ""}"><i style="width:${w * 100}%"></i></div></div>
    </div>`;
  }).join("");
}

// ===== CRUD de lançamentos =====
const txDialog = $("#txDialog"), txForm = $("#txForm"), txF = txForm.elements;

function fillCats(type, selected) {
  txF.cat.innerHTML = state.cats[type].map((c) =>
    `<option value="${esc(c.name)}" ${c.name === selected ? "selected" : ""}>${esc(c.name)}</option>`).join("");
}
function fillAccCardSelects(conta, cartao) {
  txF.conta.innerHTML = state.accounts.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join("");
  txF.cartao.innerHTML = state.cards.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  txF.conta.value = conta && state.accounts.some((a) => a.id === conta) ? conta : state.accounts[0].id;
  if (state.cards.length) txF.cartao.value = cartao && cardById(cartao) ? cartao : state.cards[0].id;
}
function syncFormVisibility() {
  const isIn = txF.type.value === "entrada", rec = txF.recorrente.checked;
  const creditOpt = txF.method.querySelector("[value=credito]");
  creditOpt.hidden = creditOpt.disabled = !state.cards.length;
  if (!state.cards.length && txF.method.value === "credito") txF.method.value = "pix";
  const credit = !isIn && txF.method.value === "credito";
  const boleto = !isIn && txF.method.value === "boleto";
  const parcelado = (credit || boleto) && !rec;
  $("#methodLabel").classList.toggle("hidden", isIn);
  $("#contaLabel").classList.toggle("hidden", credit || (state.accounts.length < 2 && !boleto));
  $("#cartaoLabel").classList.toggle("hidden", !credit || state.cards.length < 2);
  const noCarne = !!ui.editingGrupo;
  $("#parcLabel").classList.toggle("hidden", !parcelado || noCarne);
  const nParc = Number(txF.parcelas.value) || 1;
  $("#modoLabel").classList.toggle("hidden", !boleto || !parcelado || noCarne || nParc < 2);
  $("#pagasLabel").classList.toggle("hidden", !boleto || !parcelado || noCarne || nParc < 2);

  const v = Number(txF.value.value) || 0, n = Math.max(1, Number(txF.parcelas.value) || 1);
  const card = credit ? cardById(txF.cartao.value) : null;
  const k0 = credit && txF.date.value ? firstDueMonth(card, txF.date.value) : null;
  if (noCarne) {
    const g = ui.editingGrupo;
    $("#parcHint").textContent = `Parcela ${g.parcela} de ${g.parcelas} do carnê "${g.desc}". Mudar aqui altera só esta parcela — pra mudar as que faltam, use o 💲 na aba Parcelamentos.`;
    return;
  }
  if (boleto && parcelado) {
    const n2 = Math.max(1, nParc);
    const pagas = Math.max(0, Math.min(n2 - 1, Number(txF.pagas.value) || 0));
    const total = txF.modo.value === "total" ? v : v * n2;
    const k0b = txF.date.value ? mk(txF.date.value) : null;
    $("#parcHint").textContent = n2 > 1 && k0b
      ? `${n2}x de ${brl(total / n2)}`
        + (pagas ? ` · registrando da ${pagas + 1}ª à ${n2}ª (${n2 - pagas} parcelas, ${brl((total / n2) * (n2 - pagas))})` : ` · total ${brl(total)}`)
        + ` · de ${mShort(k0b)} a ${mShort(addM(k0b, n2 - pagas - 1))}`
        + " — cada parcela vira um gasto no mês dela, saindo da conta escolhida."
      : "";
    return;
  }
  const paid = credit && !rec && k0 ? installments({ type: "saida", method: "credito", cartao: txF.cartao.value, date: txF.date.value, parcelas: n, value: v }).filter((x) => x.dueDate < TODAY).length : 0;
  $("#parcHint").textContent = credit && !rec && k0
    ? `${n > 1 ? `${n}x de ${brl(v / n)} — 1ª parcela` : "Entra"} na fatura de ${mShort(k0)} (vence ${fmtDate(dueDay(card, k0))})`
      + (paid ? ` · hoje: ${paid} de ${n} já paga(s), faltam ${n - paid}` : "")
    : "";
  $("#recOpts").classList.toggle("hidden", !rec);
  const day = txF.date.value ? Number(txF.date.value.slice(8)) : null;
  $("#recHint").textContent = rec && day
    ? `Vai lançar ${brl(v)} todo dia ${day}${day > 28 ? " (ou no último dia, em meses mais curtos)" : ""}, a partir de ${mLabel(mk(txF.date.value))}${parseMonth(txF.fim.value) ? ` até ${mLabel(parseMonth(txF.fim.value))}` : ""}.`
      + (mk(txF.date.value) < CUR ? " Os meses que já passaram também serão lançados." : "")
    : "";
}

// mode: "tx" (lançamento) ou "rec" (regra recorrente)
function openTx(type = "saida", item = null, mode = "tx") {
  const isRec = mode === "rec";
  ui.editingGrupo = item && !isRec && item.grupo ? item : null;
  ui.editing = item && !isRec ? item.id : null;
  ui.editingRec = item && isRec ? item.id : null;
  $("#txDialogTitle").textContent = isRec ? (item ? "Editar recorrência" : "Nova recorrência") : (item ? "Editar lançamento" : "Novo lançamento");
  txForm.reset();
  const t = item
    ? { ...item, date: isRec ? recDate(item, item.inicio) : item.date }
    : { type, desc: "", value: "", date: ui.month === CUR ? TODAY : `${ui.month}-01`, method: "pix", parcelas: 1 };
  txForm.querySelector(`input[name=type][value=${t.type}]`).checked = true;
  txF.desc.value = t.desc;
  txF.value.value = t.value;
  txF.date.value = t.date;
  txF.method.value = t.method || "pix";
  txF.parcelas.value = t.parcelas || 1;
  txF.recorrente.checked = isRec;
  txF.fim.value = monthInputValue(txF.fim, isRec ? item?.fim : null);
  fillAccCardSelects(t.conta, t.cartao);
  // editar um lançamento existente não mexe em recorrência; editar uma regra sempre é recorrente
  $("#recRow").classList.toggle("hidden", !!ui.editing);
  txF.recorrente.closest("label").classList.toggle("hidden", isRec);
  fillCats(t.type, t.cat);
  syncFormVisibility();
  txDialog.showModal();
  txF.desc.focus();
}

txForm.addEventListener("change", (e) => {
  if (e.target.name === "type") fillCats(txF.type.value);
  syncFormVisibility();
});
txForm.addEventListener("input", syncFormVisibility);

txForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const type = txF.type.value;
  const method = type === "entrada" ? "pix" : txF.method.value;
  const credit = type === "saida" && method === "credito";
  const boleto = type === "saida" && method === "boleto";
  const rec = txF.recorrente.checked;
  const data = {
    type,
    desc: txF.desc.value.trim(),
    value: round2(Number(txF.value.value)),
    date: txF.date.value,
    cat: txF.cat.value,
    method,
    parcelas: credit && !rec ? Math.max(1, Math.min(48, Number(txF.parcelas.value) || 1)) : 1,
    ...(credit ? { cartao: txF.cartao.value } : { conta: txF.conta.value }),
  };
  if (!data.desc || !(data.value > 0) || !data.date) return;

  // Carnê/boleto parcelado: cria um lançamento por mês, com a parcela caindo no mês dela
  if (boleto && !rec && !ui.editing) {
    const n = Math.max(1, Math.min(240, Number(txF.parcelas.value) || 1));
    if (n > 1) {
      const pagas = Math.max(0, Math.min(n - 1, Number(txF.pagas.value) || 0));
      const total = round2(txF.modo.value === "total" ? data.value : data.value * n);
      const base = round2(total / n);
      const grupo = uid();
      // a data informada é a da PRÓXIMA parcela a registrar; as já pagas não viram lançamento
      const k0 = mk(data.date), dia = Number(data.date.slice(8));
      for (let i = pagas; i < n; i++) {
        const k = addM(k0, i - pagas);
        state.tx.push({ ...data, id: uid(), grupo, parcela: i + 1, parcelas: n,
          value: i === n - 1 ? round2(total - base * (n - 1)) : base,
          date: `${k}-${pad(Math.min(dia, daysIn(k)))}` });
      }
      ui.month = k0 <= CUR ? k0 : ui.month;
      normalizeRefs();
      txDialog.close();
      refresh();
      return;
    }
  }

  if (rec) {
    const fim = parseMonth(txF.fim.value);
    if (fim === undefined) { alert('Não entendi o mês final. Escreva mês/ano, ex.: "12/2027".'); return; }
    if (fim && fim < mk(data.date)) { alert("O mês final precisa ser depois do início."); return; }
    const { date, parcelas, ...rest } = data;
    const fields = { ...rest, dia: Number(date.slice(8)), inicio: mk(date), fim };
    if (ui.editingRec) {
      const r = state.rec.find((x) => x.id === ui.editingRec);
      delete r.conta; delete r.cartao;
      Object.assign(r, fields);
      // se o início foi movido pra depois do que já foi gerado, recomeça dali
      if (r.ultimo && r.ultimo < addM(r.inicio, -1)) r.ultimo = addM(r.inicio, -1);
    } else {
      state.rec.push({ id: uid(), ...fields, ultimo: null, ativo: true });
    }
    runRecurring();
  } else if (ui.editing) {
    const t = state.tx.find((x) => x.id === ui.editing);
    const doCarne = t.grupo ? { grupo: t.grupo, parcela: t.parcela, parcelas: t.parcelas } : {};
    delete t.conta; delete t.cartao;
    Object.assign(t, data, doCarne);
  } else {
    state.tx.push({ id: uid(), ...data });
  }
  if (!ui.editingRec && mk(data.date) <= CUR) ui.month = mk(data.date);
  normalizeRefs();
  txDialog.close();
  refresh();
});

function onTxAction(e) {
  const edit = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]");
  if (edit) openTx(null, state.tx.find((t) => t.id === edit.dataset.edit));
  if (del) {
    const t = state.tx.find((x) => x.id === del.dataset.del);
    if (t && confirm(`Excluir "${t.desc}" (${brl(t.value)})?`)) {
      state.tx = state.tx.filter((x) => x.id !== t.id);
      refresh();
    }
  }
}
$("#txBody").addEventListener("click", onTxAction);
$("#boletoBody").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-boleto-del], [data-boleto-reajuste]");
  if (!btn) return onTxAction(e);
  const grupo = btn.dataset.boletoDel || btn.dataset.boletoReajuste;
  const futuras = state.tx.filter((t) => t.grupo === grupo && t.date > TODAY).sort((a, b) => a.date.localeCompare(b.date));
  if (!futuras.length) return;
  if (btn.dataset.boletoDel) {
    if (!confirm(`Excluir as ${futuras.length} parcelas que ainda não venceram de "${futuras[0].desc}"? As já pagas continuam.`)) return;
    const ids = new Set(futuras.map((t) => t.id));
    state.tx = state.tx.filter((t) => !ids.has(t.id));
  } else {
    const atual = futuras[0].value;
    const resposta = prompt(`Novo valor para as ${futuras.length} parcelas que faltam de "${futuras[0].desc}" (a atual é ${brl(atual)}):`, String(atual).replace(".", ","));
    if (resposta === null) return;
    const novo = round2(Number(String(resposta).replace(/\./g, "").replace(",", ".")));
    if (!(novo > 0)) { alert("Valor inválido."); return; }
    futuras.forEach((t) => { t.value = novo; });
  }
  refresh();
});
$("#parcBody").addEventListener("click", onTxAction);

$("#btnNewRec").addEventListener("click", () => openTx("saida", null, "rec"));
$("#recBody").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const id = btn.dataset.recEdit || btn.dataset.recDel || btn.dataset.recToggle;
  const r = state.rec.find((x) => x.id === id);
  if (!r) return;
  if (btn.dataset.recEdit) return openTx(r.type, r, "rec");
  if (btn.dataset.recDel) {
    if (!confirm(`Excluir a recorrência "${r.desc}"? Os lançamentos já criados continuam.`)) return;
    state.rec = state.rec.filter((x) => x !== r);
  } else {
    r.ativo = !r.ativo;
    // ao retomar, não lança os meses em que ficou pausada
    if (r.ativo) {
      const prev = addM(CUR, -1);
      if (!r.ultimo || r.ultimo < prev) r.ultimo = r.inicio > prev ? r.ultimo : prev;
      runRecurring();
    }
  }
  refresh();
});

// Campo de mês: com seletor nativo usa "AAAA-MM"; sem seletor (caixa de texto) mostra "MM/AAAA"
const monthInputValue = (input, k) => (!k ? "" : input.type === "month" ? k : `${k.slice(5)}/${k.slice(0, 4)}`);

// ===== Metas =====
const goalDialog = $("#goalDialog"), goalForm = $("#goalForm"), gF = goalForm.elements;
function openGoal(g = null) {
  ui.goalEditing = g?.id || null;
  goalForm.reset();
  $("#goalDialogTitle").textContent = g ? "Editar meta" : "Nova meta";
  gF.emoji.value = g?.emoji || "ti-target";
  atualizaPreviewIcone();
  gF.name.value = g?.name || "";
  gF.alvo.value = g?.alvo || "";
  gF.prazo.value = monthInputValue(gF.prazo, g?.prazo);
  $("#goalInitLabel").classList.toggle("hidden", !!g);
  goalDialog.showModal();
  gF.name.focus();
}
goalForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const prazo = parseMonth(gF.prazo.value);
  if (prazo === undefined) { alert('Não entendi o prazo. Escreva mês/ano, ex.: "12/2030" ou "dez/2030" (só "2030" vira dezembro).'); return; }
  const data = { emoji: gF.emoji.value.trim() || "ti-target", name: gF.name.value.trim(), alvo: round2(Number(gF.alvo.value)), prazo };
  if (!data.name || !(data.alvo > 0)) return;
  if (ui.goalEditing) Object.assign(state.goals.find((g) => g.id === ui.goalEditing), data);
  else {
    const ini = round2(Number(gF.inicial.value) || 0);
    state.goals.push({ id: uid(), ...data, aportes: ini > 0 ? [{ date: TODAY, value: ini }] : [] });
  }
  goalDialog.close();
  refresh();
});
$("#btnNewGoal").addEventListener("click", () => openGoal());
function atualizaPreviewIcone() { $("#goalIcoPrev").innerHTML = ico(gF.emoji.value.trim()); }
gF.emoji.addEventListener("input", atualizaPreviewIcone);

const depDialog = $("#depDialog"), depForm = $("#depForm"), dF = depForm.elements;
$("#goalCards").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const g = state.goals.find((x) => x.id === (btn.dataset.goalDep || btn.dataset.goalEdit || btn.dataset.goalDel));
  if (!g) return;
  if (btn.dataset.goalEdit) return openGoal(g);
  if (btn.dataset.goalDel) {
    if (!confirm(`Excluir a meta "${g.name}"?`)) return;
    state.goals = state.goals.filter((x) => x !== g);
    return refresh();
  }
  ui.depGoal = g.id;
  depForm.reset();
  $("#depTitle").innerHTML = `${ico(g.emoji)} ${esc(g.name)} · ${brl(goalSaved(g))} guardado`;
  dF.date.value = TODAY;
  depDialog.showModal();
  dF.value.focus();
});
depForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const g = state.goals.find((x) => x.id === ui.depGoal);
  const v = round2(Number(dF.value.value)), dir = Number(dF.dir.value);
  if (!g || !(v > 0)) return;
  if (dir < 0 && v > goalSaved(g)) { alert(`Só tem ${brl(goalSaved(g))} guardado nessa meta.`); return; }
  g.aportes.push({ date: dF.date.value || TODAY, value: v * dir });
  depDialog.close();
  refresh();
});

// ===== Categorias (gerenciar + orçamentos) =====
const catsDialog = $("#catsDialog"), catsForm = $("#catsForm");
const catRow = (type, c = { name: "", emoji: type === "saida" ? "ti-package" : "ti-plus", budget: 0 }) => `
  <div class="mgr-row" data-orig="${esc(c.name)}">
    <span class="ico-prev">${ico(c.emoji)}</span>
    <input class="input emoji" value="${esc(c.emoji)}" maxlength="40" title="Nome do ícone (ex.: ti-car) ou um emoji" data-f="emoji">
    <input class="input" value="${esc(c.name)}" maxlength="30" placeholder="Nome" data-f="name" required>
    ${type === "saida" ? `<input class="input num" type="number" step="0.01" min="0" value="${c.budget || ""}" placeholder="sem teto" data-f="budget">` : ""}
    <button type="button" class="icon-btn" data-remove title="Remover"><i class="ti ti-trash"></i></button>
  </div>`;
function openCats() {
  $("#catsSaida").innerHTML = state.cats.saida.map((c) => catRow("saida", c)).join("");
  $("#catsEntrada").innerHTML = state.cats.entrada.map((c) => catRow("entrada", c)).join("");
  catsDialog.showModal();
}
catsForm.addEventListener("input", (e) => {
  if (e.target.dataset.f !== "emoji") return;
  e.target.closest(".mgr-row").querySelector(".ico-prev").innerHTML = ico(e.target.value.trim());
});
catsForm.addEventListener("click", (e) => {
  const add = e.target.closest("[data-add-cat]");
  if (add) {
    const box = add.dataset.addCat === "saida" ? $("#catsSaida") : $("#catsEntrada");
    box.insertAdjacentHTML("beforeend", catRow(add.dataset.addCat));
    box.lastElementChild.querySelector("[data-f=name]").focus();
  }
  const rm = e.target.closest("[data-remove]");
  if (rm) rm.closest(".mgr-row").remove();
});
catsForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const next = {};
  const renames = { saida: {}, entrada: {} };
  for (const [type, box] of [["saida", "#catsSaida"], ["entrada", "#catsEntrada"]]) {
    next[type] = [];
    for (const row of $(box).querySelectorAll(".mgr-row")) {
      const name = row.querySelector("[data-f=name]").value.trim();
      if (!name) continue;
      if (next[type].some((c) => c.name.toLowerCase() === name.toLowerCase())) { alert(`A categoria "${name}" aparece duas vezes.`); return; }
      next[type].push({ name, emoji: row.querySelector("[data-f=emoji]").value.trim() || "•", budget: round2(Number(row.querySelector("[data-f=budget]")?.value) || 0) });
      if (row.dataset.orig && row.dataset.orig !== name) renames[type][row.dataset.orig] = name;
    }
  }
  for (const x of [...state.tx, ...state.rec]) if (renames[x.type][x.cat]) x.cat = renames[x.type][x.cat];
  state.cats = next;
  normalizeRefs(); // categorias removidas → "Outros"
  catsDialog.close();
  refresh();
});

// ===== Contas e cartões =====
const accDialog = $("#accDialog"), accForm = $("#accForm");
const accRow = (a = { id: uid(), name: "", inicial: 0, tipo: "corrente" }) => `
  <div class="mgr-row" data-id="${a.id}">
    <input class="input" value="${esc(a.name)}" maxlength="30" placeholder="Nome da conta" data-f="name" required>
    <select class="select" data-f="tipo" title="Tipo">
      <option value="corrente" ${a.tipo !== "investimento" ? "selected" : ""}>Conta</option>
      <option value="investimento" ${a.tipo === "investimento" ? "selected" : ""}>Investimento</option>
    </select>
    <input class="input num" type="number" step="0.01" value="${a.inicial || 0}" data-f="inicial" title="Saldo inicial">
    <button type="button" class="icon-btn" data-remove title="Remover"><i class="ti ti-trash"></i></button>
  </div>`;
const cardRow = (c = { id: uid(), name: "", limite: 0, fecha: 1, vence: 10, conta: "" }) => `
  <div class="mgr-row" data-id="${c.id}">
    <input class="input" value="${esc(c.name)}" maxlength="30" placeholder="Nome do cartão" data-f="name" required>
    <input class="input num" type="number" step="0.01" min="0" value="${c.limite || ""}" placeholder="Limite" data-f="limite" title="Limite">
    <input class="input day" type="number" min="1" max="31" value="${c.fecha}" data-f="fecha" title="Dia que fecha">
    <input class="input day" type="number" min="1" max="31" value="${c.vence}" data-f="vence" title="Dia que vence">
    <select class="select" data-f="conta" data-val="${c.conta}"></select>
    <button type="button" class="icon-btn" data-remove title="Remover"><i class="ti ti-trash"></i></button>
  </div>`;
function refreshCardAccOptions() {
  const accs = [...$("#accRows").querySelectorAll(".mgr-row")].map((r) => ({ id: r.dataset.id, name: r.querySelector("[data-f=name]").value.trim() || "(sem nome)" }));
  for (const sel of $("#cardRows").querySelectorAll("[data-f=conta]")) {
    const v = sel.value || sel.dataset.val;
    sel.innerHTML = accs.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join("");
    if (accs.some((a) => a.id === v)) sel.value = v;
  }
}
function openAccounts() {
  $("#accRows").innerHTML = state.accounts.map(accRow).join("");
  $("#cardRows").innerHTML = state.cards.map(cardRow).join("");
  refreshCardAccOptions();
  accDialog.showModal();
}
$("#btnAddAcc").addEventListener("click", () => { $("#accRows").insertAdjacentHTML("beforeend", accRow()); refreshCardAccOptions(); $("#accRows").lastElementChild.querySelector("input").focus(); });
$("#btnAddCard").addEventListener("click", () => { $("#cardRows").insertAdjacentHTML("beforeend", cardRow()); refreshCardAccOptions(); $("#cardRows").lastElementChild.querySelector("input").focus(); });
$("#accRows").addEventListener("input", refreshCardAccOptions);
accForm.addEventListener("click", (e) => {
  const rm = e.target.closest("[data-remove]");
  if (!rm) return;
  if (rm.closest("#accRows") && $("#accRows").children.length === 1) { alert("Precisa ter pelo menos uma conta."); return; }
  rm.closest(".mgr-row").remove();
  refreshCardAccOptions();
});
accForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const get = (row, f) => row.querySelector(`[data-f=${f}]`).value;
  const accounts = [...$("#accRows").querySelectorAll(".mgr-row")].map((r) => ({ id: r.dataset.id, name: get(r, "name").trim(), inicial: round2(Number(get(r, "inicial")) || 0), tipo: get(r, "tipo") }));
  const day = (v) => Math.max(1, Math.min(31, Number(v) || 1));
  const cards = [...$("#cardRows").querySelectorAll(".mgr-row")].map((r) => ({ id: r.dataset.id, name: get(r, "name").trim(), limite: round2(Number(get(r, "limite")) || 0), fecha: day(get(r, "fecha")), vence: day(get(r, "vence")), conta: get(r, "conta") }));
  if (!accounts.length || [...accounts, ...cards].some((x) => !x.name)) { alert("Dê um nome pra cada conta e cartão."); return; }
  const hadCredit = state.tx.some((t) => t.method === "credito");
  if (!cards.length && hadCredit && !confirm("Você tem compras no crédito. Sem nenhum cartão, elas vão cair sempre na fatura do mês seguinte. Continuar?")) return;
  state.accounts = accounts;
  state.cards = cards;
  normalizeRefs();
  accDialog.close();
  refresh();
});


// ===== Conferência (bate os saldos do app com os do banco) =====
const checkDialog = $("#checkDialog"), checkForm = $("#checkForm");
const diasDesdeCheck = () => (state.check.ultimo ? Math.floor((Date.parse(TODAY) - Date.parse(state.check.ultimo)) / 86400000) : null);
const checkAtrasada = () => {
  if (!state.check.periodo) return false;
  const d = diasDesdeCheck();
  return d === null ? state.tx.length > 0 : d >= state.check.periodo;
};

function openCheck() {
  const c = compute();
  const linhas = [
    ...state.accounts.map((a) => ({
      kind: "acc", id: a.id, modo: "saldo",
      titulo: `${ico(a.tipo === "investimento" ? "ti-chart-line" : "ti-building-bank")} ${esc(a.name)}`,
      pergunta: a.tipo === "investimento" ? "quanto a carteira vale hoje" : "quanto tem no extrato",
      esperado: round2(c.bal[a.id] ?? 0),
    })),
    ...state.cards.map((card) => {
      const info = c.cards.find((x) => x.c.id === card.id);
      const temLimite = !!card.limite;
      return {
        kind: "card", id: card.id, modo: temLimite ? "disponivel" : "usado",
        titulo: `${ico("ti-credit-card")} ${esc(card.name)}`,
        pergunta: temLimite ? "limite disponível no app do banco" : "total comprometido (sem limite cadastrado)",
        esperado: round2(temLimite ? card.limite - info.used : info.used),
      };
    }),
  ];
  $("#checkRows").innerHTML = linhas.map((l) => `
    <div class="check-row" data-kind="${l.kind}" data-id="${l.id}" data-modo="${l.modo}">
      <div class="check-label"><b>${l.titulo}</b><span class="muted">${esc(l.pergunta)} · o app diz ${brl(l.esperado)}</span></div>
      <input class="input num" type="number" step="0.01" placeholder="R$ de verdade">
    </div>`).join("");
  $("#checkResult").classList.add("hidden");
  $("#checkResult").innerHTML = "";
  $("#checkSubmit").textContent = "Conferir";
  checkForm.dataset.fase = "perguntar";
  checkDialog.showModal();
  $("#checkRows input")?.focus();
}

function checkDiffs() {
  const c = compute();
  const out = [];
  for (const row of $$("#checkRows .check-row")) {
    const bruto = row.querySelector("input").value.trim();
    if (bruto === "") continue;
    const informado = round2(Number(bruto));
    if (!Number.isFinite(informado)) continue;
    const { kind, id, modo } = row.dataset;
    if (kind === "acc") {
      const a = accById(id);
      const esperado = round2(c.bal[id] ?? 0);
      const dif = round2(informado - esperado);
      if (Math.abs(dif) >= 0.01) out.push({ kind, id, nome: a.name, investimento: a.tipo === "investimento", esperado, informado, dif });
    } else {
      const card = cardById(id);
      const info = c.cards.find((x) => x.c.id === id);
      const usadoReal = round2(modo === "usado" ? informado : (card.limite || 0) - informado);
      const dif = round2(usadoReal - round2(info.used));
      if (Math.abs(dif) >= 0.01) out.push({ kind, id, nome: card.name, esperado: round2(info.used), informado: usadoReal, dif });
    }
  }
  return out;
}

function descreveDiff(d) {
  if (d.kind === "acc") {
    const falta = d.dif < 0;
    const oque = d.investimento ? (falta ? "Perda/retirada" : "Rendimento") : "Ajuste de conferência";
    return `<b>${esc(d.nome)}</b>: o app dizia ${brl(d.esperado)} e você tem ${brl(d.informado)}.<br>
      <span class="muted">Vou lançar </span><span class="${falta ? "neg" : "pos"}">${falta ? "−" : "+"} ${brl(Math.abs(d.dif))}</span>
      <span class="muted"> como "${oque}" em ${esc(d.nome)}.</span>`;
  }
  const maior = d.dif > 0;
  return `<b>${esc(d.nome)}</b>: o app dizia ${brl(d.esperado)} comprometidos e o banco diz ${brl(d.informado)}.<br>
    <span class="muted">Vou lançar </span><span class="${maior ? "neg" : "pos"}">${maior ? "uma compra de" : "um estorno de"} ${brl(Math.abs(d.dif))}</span>
    <span class="muted"> nesse cartão${maior ? "" : " (desconto na fatura)"}.</span>`;
}

checkForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (checkForm.dataset.fase === "perguntar") {
    const diffs = checkDiffs();
    ui.checkDiffs = diffs;
    const box = $("#checkResult");
    box.classList.remove("hidden");
    if (!diffs.length) {
      box.innerHTML = `<div class="check-ok"><i class="ti ti-circle-check"></i> Tudo bate. Nada pra ajustar.</div>`;
      $("#checkSubmit").textContent = "Marcar como conferido";
    } else {
      box.innerHTML = `<div class="mgr-head"><b>Diferenças encontradas</b><span class="muted">desmarque o que não quiser ajustar</span></div>`
        + diffs.map((d, i) => `<label class="check-diff"><input type="checkbox" data-diff="${i}" checked><span>${descreveDiff(d)}</span></label>`).join("");
      $("#checkSubmit").textContent = `Aplicar ${diffs.length} ajuste(s)`;
    }
    checkForm.dataset.fase = "aplicar";
    return;
  }
  // fase de aplicar
  const marcados = new Set($$("#checkResult [data-diff]").filter((i) => i.checked).map((i) => Number(i.dataset.diff)));
  const aplicados = [];
  (ui.checkDiffs || []).forEach((d, i) => {
    if (!marcados.has(i)) return;
    const valor = round2(Math.abs(d.dif));
    if (d.kind === "acc") {
      const sobrou = d.dif > 0;
      state.tx.push({
        id: uid(), type: sobrou ? "entrada" : "saida",
        desc: d.investimento ? (sobrou ? "Rendimento (conferência)" : "Perda/retirada (conferência)") : "Ajuste de conferência",
        cat: d.investimento && sobrou ? "Investimentos" : "Ajuste",
        value: valor, date: TODAY, method: sobrou ? "pix" : "debito", parcelas: 1, conta: d.id, ajuste: true,
      });
    } else {
      state.tx.push({
        id: uid(), type: d.dif > 0 ? "saida" : "entrada",
        desc: d.dif > 0 ? "Ajuste de conferência" : "Estorno (conferência)",
        cat: "Ajuste", value: valor, date: TODAY, method: "credito", parcelas: 1, cartao: d.id, ajuste: true,
      });
    }
    aplicados.push({ nome: d.nome, dif: d.dif });
  });
  state.check.ultimo = TODAY;
  state.check.historico = [...(state.check.historico || []), { date: TODAY, itens: aplicados }].slice(-24);
  ui.dismissed.add("check");
  normalizeRefs();
  checkDialog.close();
  refresh();
});

// ===== Importar extrato (CSV / OFX) =====
const impDialog = $("#impDialog"), impForm = $("#impForm");
let imp = null; // { kind, table, header, items }

const KEYWORDS = [
  [/uber|99 ?(pop|app|taxi)|cabify|posto|combust|shell|ipiranga|petrobras|estaciona|metr[oô]|[oô]nibus|bilhete|sem parar|pedagio|ped[aá]gio/i, "Transporte"],
  [/ifood|rappi|mercado(?! ?livre|pago)|supermerc|padaria|restaurante|lanchonete|a[cç]ougue|hortifruti|burger|pizza|carrefour|assa[ií]|atacad|p[aã]o de a[cç]|zaffari|extra |dia |bistr|cafe|caf[eé]/i, "Alimentação"],
  [/netflix|spotify|disney|hbo|\bmax\b|prime video|amazon prime|youtube|deezer|apple\.com|google one|icloud|globoplay|crunchyroll|assinatura|chatgpt|openai/i, "Assinaturas"],
  [/farm[aá]cia|drogaria|droga|raia|pague menos|panvel|hospital|cl[ií]nica|m[eé]dic|odonto|laborat|academia|smart ?fit/i, "Saúde"],
  [/aluguel|condom[ií]nio|energia|enel|light|cemig|copel|sabesp|[aá]gua|comgas|internet|vivo|claro|\btim\b|\boi\b|net virtua/i, "Moradia"],
  [/curso|escola|faculdade|udemy|alura|livraria|livro|coursera/i, "Educação"],
  [/cinema|ingresso|sympla|steam|playstation|xbox|nintendo|\bbar\b|show|teatro|boteco/i, "Lazer"],
  [/amazon|mercado ?livre|shopee|magalu|magazine|americanas|shein|aliexpress|renner|c&a|riachuelo|kabum|centauro/i, "Compras"],
];
const KEYWORDS_IN = [[/sal[aá]rio|folha|pagto sal|provent/i, "Salário"], [/rendimento|dividendo|juros|resgate|cdb|tesouro/i, "Investimentos"]];
const normDesc = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

function guessCat(type, desc) {
  const n = normDesc(desc);
  // 1) aprende com lançamentos que você já categorizou
  const same = [...state.tx].reverse().find((t) => t.type === type && normDesc(t.desc) === n);
  if (same) return same.cat;
  // 2) palavras-chave
  for (const [re, cat] of type === "saida" ? KEYWORDS : KEYWORDS_IN) {
    if (re.test(desc) && state.cats[type].some((c) => c.name === cat)) return cat;
  }
  return "Outros";
}

function parseDate(raw) {
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${pad(m[2])}-${pad(m[1])}`; }
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
function parseAmount(raw) {
  let s = String(raw ?? "").trim().replace(/R\$|\s| /g, "");
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.endsWith("-")) { neg = true; s = s.slice(0, -1); }
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); } else if (s.startsWith("+")) s = s.slice(1);
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
  if (lc > ld) s = s.replace(/\./g, "").replace(",", ".");
  else if (lc !== -1) s = s.replace(/,/g, "");
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, "");
  const v = Number(s);
  return Number.isFinite(v) ? (neg ? -v : v) : null;
}
function parseCSV(text) {
  const first = text.split(/\r?\n/).find((l) => l.trim()) || "";
  const delim = [";", ",", "\t"].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}
function parseOFX(text) {
  return text.split(/<STMTTRN>/i).slice(1).map((b) => {
    const body = b.split(/<\/STMTTRN>/i)[0];
    const get = (tag) => (body.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i")) || [])[1]?.trim() || "";
    return { date: parseDate(get("DTPOSTED").slice(0, 8)), desc: get("MEMO") || get("NAME") || "Sem descrição", amount: parseAmount(get("TRNAMT")), fitid: get("FITID") || null };
  }).filter((r) => r.date && r.amount !== null && r.amount !== 0);
}

function autoMapCSV(table) {
  const cols = Math.max(...table.map((r) => r.length));
  const hasHeader = !table[0].some((c) => parseDate(c)) && table.length > 1;
  const header = hasHeader ? table[0].map((h) => h.trim().toLowerCase()) : null;
  const data = hasHeader ? table.slice(1) : table;
  const byName = (re) => header ? header.findIndex((h) => re.test(h)) : -1;
  let dc = byName(/^data|date|dt\b/), vc = byName(/valor|amount|value|quantia|montante/), sc = byName(/descri|hist[oó]rico|title|t[ií]tulo|memo|estabelec|lan[cç]amento|detalhe/);
  const dataRatio = (i, fn) => { const s = data.slice(0, 30); return s.filter((r) => fn(r[i] ?? "")).length / Math.max(1, s.length); };
  if (dc < 0) dc = [...Array(cols).keys()].find((i) => dataRatio(i, parseDate) > 0.8) ?? 0;
  if (vc < 0) vc = [...Array(cols).keys()].reverse().find((i) => i !== dc && dataRatio(i, (v) => parseAmount(v) !== null) > 0.8) ?? cols - 1;
  if (sc < 0) {
    const avgLen = (i) => sum(data.slice(0, 30), (r) => (r[i] || "").length);
    sc = [...Array(cols).keys()].filter((i) => i !== dc && i !== vc).sort((a, b) => avgLen(b) - avgLen(a))[0] ?? 0;
  }
  return { header, data, cols, dc, vc, sc };
}

function openImport() {
  imp = null;
  impForm.reset();
  $("#impDest").innerHTML = state.accounts.map((a) => `<option value="acc:${a.id}">Conta · ${esc(a.name)}</option>`).join("")
    + state.cards.map((c) => `<option value="card:${c.id}">Cartão · ${esc(c.name)}</option>`).join("");
  ["#impMap", "#impSignRow", "#impPreviewWrap"].forEach((s) => $(s).classList.add("hidden"));
  $("#impSubmit").disabled = true;
  impDialog.showModal();
}

async function readFileText(file) {
  const buf = await file.arrayBuffer();
  const utf = new TextDecoder("utf-8").decode(buf);
  // extratos antigos costumam vir em Latin-1: se o UTF-8 gerou caracteres inválidos, relê
  return utf.includes("�") ? new TextDecoder("iso-8859-1").decode(buf) : utf;
}

const slug = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const BANCOS = ["nubank", "picpay", "inter", "itau", "bradesco", "santander", "caixa", "c6", "mercado pago", "neon", "next", "original", "will", "banco do brasil", "sicredi", "sicoob", "banrisul", "pagbank", "paypal"];

// Descobre pelo arquivo se é fatura de cartão ou extrato de conta, e pra onde mandar
function detectSource(file, text, table) {
  const nome = slug(file.name), head = slug((text.split(/\r?\n/)[0] || "").slice(0, 200));
  const banco = BANCOS.find((b) => nome.includes(b) || head.includes(b) || slug(text.slice(0, 4000)).includes(b)) || null;

  let cartao = null; // true = fatura de cartão, false = extrato de conta, null = não sei
  if (/<OFX>|<STMTTRN>/i.test(text)) {
    if (/<CREDITCARDMSGSRSV1>|<CCSTMTRS>/i.test(text)) cartao = true;
    else if (/<BANKMSGSRSV1>|<STMTRS>/i.test(text)) cartao = false;
  } else if (/\bdate\b/.test(head) && /\btitle\b/.test(head) && /\bamount\b/.test(head)) {
    cartao = true; // layout da fatura do Nubank
  } else if (/fatura|invoice|cartao|credito/.test(nome)) cartao = true;
  else if (/extrato|conta|statement|account/.test(nome)) cartao = false;

  // Na dúvida num CSV, olha o sinal dos valores: fatura tem quase tudo positivo
  if (cartao === null && table) {
    const vals = table.data.slice(0, 40).map((r) => parseAmount(r[table.vc])).filter((v) => v !== null && v !== 0);
    if (vals.length >= 3) cartao = vals.filter((v) => v > 0).length / vals.length > 0.8;
  }

  // Destino: tenta casar o nome do banco com o nome dos seus cartões/contas
  const destinos = [
    ...state.cards.map((c) => ({ v: `card:${c.id}`, nome: slug(c.name), cartao: true, label: c.name })),
    ...state.accounts.map((a) => ({ v: `acc:${a.id}`, nome: slug(a.name), cartao: false, label: a.name })),
  ];
  const combina = (d) => (banco && (d.nome.includes(banco) || banco.includes(d.nome))) || (nome && d.nome.split(" ").some((w) => w.length >= 4 && nome.includes(w)));
  const achado = destinos.find((d) => d.cartao === cartao && combina(d)) || destinos.find((d) => combina(d));
  const dest = achado
    || (cartao === true ? destinos.find((d) => d.cartao) : null)
    || (cartao === false ? destinos.find((d) => !d.cartao) : null);
  return { banco, cartao, dest, certo: !!achado };
}

async function handleImportFile(file) {
  if (!file) return;
  const text = await readFileText(file);
  const ofx = /<OFX>|<STMTTRN>/i.test(text);
  let table = null;
  if (ofx) {
    imp = { kind: "ofx", raw: parseOFX(text) };
    $("#impMap").classList.add("hidden");
    $("#impSignRow").classList.add("hidden");
  } else {
    const rows = parseCSV(text);
    if (!rows.length) { alert("Não achei linhas nesse arquivo."); return; }
    table = autoMapCSV(rows);
    imp = { kind: "csv", ...table };
    const opts = [...Array(table.cols).keys()].map((i) => `<option value="${i}">${esc(table.header?.[i] || `Coluna ${i + 1}`)}</option>`).join("");
    for (const [sel, v] of [["#impColDate", table.dc], ["#impColDesc", table.sc], ["#impColVal", table.vc]]) { $(sel).innerHTML = opts; $(sel).value = v; }
    $("#impMap").classList.remove("hidden");
    $("#impSignRow").classList.remove("hidden");
  }

  const { banco, cartao, dest, certo } = detectSource(file, text, table);
  if (dest) $("#impDest").value = dest.v;
  if (!ofx) $("#impPositiveSpend").checked = $("#impDest").value.startsWith("card:");
  const tipo = cartao === true ? "fatura de cartão" : cartao === false ? "extrato de conta" : null;
  const nomeBanco = banco ? `<b>${esc(banco.replace(/(^|\s)\w/g, (c) => c.toUpperCase()))}</b>` : null;
  $("#impDetected").innerHTML = banco || tipo
    ? `<i class="ti ti-search"></i> Detectei ${[nomeBanco, tipo].filter(Boolean).join(" · ")}`
      + (certo ? ` → vai pra <b>${esc(dest.label)}</b>. Se não for isso, troque acima.`
        : dest ? `. Não achei ${cartao ? "cartão" : "conta"} com esse nome, então escolhi <b>${esc(dest.label)}</b> — confira o destino acima.`
        : ". Escolha o destino acima.")
    : "";
  buildImportItems();
}

$("#impFile").addEventListener("change", (e) => { handleImportFile(e.target.files[0]); });
["#impColDate", "#impColDesc", "#impColVal", "#impPositiveSpend"].forEach((s) => $(s).addEventListener("change", buildImportItems));
$("#impDest").addEventListener("change", () => {
  if (imp?.kind === "csv") $("#impPositiveSpend").checked = $("#impDest").value.startsWith("card:");
  buildImportItems();
});

// ----- Arrastar e soltar o extrato em qualquer lugar da página -----
let dragDepth = 0;
const isFileDrag = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
window.addEventListener("dragenter", (e) => {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  if (++dragDepth === 1) $("#dropzone").classList.remove("hidden");
});
window.addEventListener("dragover", (e) => { if (isFileDrag(e)) e.preventDefault(); });
window.addEventListener("dragleave", (e) => { if (isFileDrag(e) && --dragDepth <= 0) { dragDepth = 0; $("#dropzone").classList.add("hidden"); } });
window.addEventListener("drop", async (e) => {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  dragDepth = 0;
  $("#dropzone").classList.add("hidden");
  const file = e.dataTransfer.files[0];
  if (!file) return;
  if (/\.json$/i.test(file.name)) {
    if (!confirm(`Restaurar o backup "${file.name}"? Isso substitui TODOS os dados atuais.`)) return;
    return restoreBackup(file);
  }
  if (!/\.(csv|ofx|txt)$/i.test(file.name)) { alert("Solte um extrato em CSV ou OFX (ou um backup .json)."); return; }
  $$("dialog[open]").forEach((d) => d.close());
  openImport();
  $("#impFile").value = "";
  await handleImportFile(file);
});

function buildImportItems() {
  if (!imp) return;
  let raw;
  if (imp.kind === "ofx") raw = imp.raw;
  else {
    const dc = Number($("#impColDate").value), sc = Number($("#impColDesc").value), vc = Number($("#impColVal").value);
    raw = imp.data.map((r) => ({ date: parseDate(r[dc] || ""), desc: (r[sc] || "").trim() || "Sem descrição", amount: parseAmount(r[vc]), fitid: null }))
      .filter((r) => r.date && r.amount !== null && r.amount !== 0);
  }
  const positiveSpend = imp.kind === "csv" && $("#impPositiveSpend").checked;
  const toCard = $("#impDest").value.startsWith("card:");
  const existing = new Set(state.tx.map((t) => `${t.date}|${round2(t.value)}|${normDesc(t.desc)}`));
  const fitids = new Set(state.tx.map((t) => t.fitid).filter(Boolean));
  imp.items = raw.map((r) => {
    const type = (positiveSpend ? r.amount > 0 : r.amount < 0) ? "saida" : "entrada";
    const value = round2(Math.abs(r.amount));
    const dup = (r.fitid && fitids.has(r.fitid)) || existing.has(`${r.date}|${value}|${normDesc(r.desc)}`);
    // numa fatura de cartão, "entradas" são pagamentos da fatura ou estornos: desmarcadas por padrão
    const skip = dup || (toCard && type === "entrada");
    return { ...r, type, value, cat: guessCat(type, r.desc), dup, checked: !skip, note: dup ? "já existe" : toCard && type === "entrada" ? "pagamento/estorno?" : "" };
  }).sort((a, b) => b.date.localeCompare(a.date));
  renderImportPreview();
}
function renderImportPreview() {
  const items = imp.items;
  $("#impPreviewWrap").classList.remove("hidden");
  $("#impBody").innerHTML = items.length ? items.map((it, i) => `
    <tr class="${it.checked ? "" : "paused"}">
      <td><input type="checkbox" data-imp-check="${i}" ${it.checked ? "checked" : ""}></td>
      <td>${fmtDate(it.date)}</td>
      <td class="desc">${esc(it.desc)}${it.note ? ` <span class="tag">${it.note}</span>` : ""}</td>
      <td><select class="select sm" data-imp-cat="${i}">${state.cats[it.type].map((c) => `<option value="${esc(c.name)}" ${c.name === it.cat ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></td>
      <td class="r ${it.type === "entrada" ? "pos" : "neg"}">${it.type === "entrada" ? "+" : "−"} ${brl(it.value)}</td>
    </tr>`).join("") : `<tr><td colspan="5" class="empty">Nenhuma transação reconhecida. Confira as colunas escolhidas acima.</td></tr>`;
  updateImportCount();
}
function updateImportCount() {
  const n = imp.items.filter((x) => x.checked).length;
  $("#impCount").textContent = `${imp.items.length} transação(ões) no arquivo · ${n} marcada(s)${imp.items.some((x) => x.dup) ? ` · ${imp.items.filter((x) => x.dup).length} já existiam` : ""}`;
  $("#impSubmit").disabled = !n;
  $("#impSubmit").textContent = n ? `Importar ${n}` : "Importar";
}
$("#impBody").addEventListener("change", (e) => {
  const c = e.target.dataset.impCheck, s = e.target.dataset.impCat;
  if (c !== undefined) { imp.items[c].checked = e.target.checked; e.target.closest("tr").classList.toggle("paused", !e.target.checked); updateImportCount(); }
  if (s !== undefined) imp.items[s].cat = e.target.value;
});
$("#impToggleAll").addEventListener("click", () => {
  const all = imp?.items.every((x) => x.checked);
  imp?.items.forEach((x) => { x.checked = !all; });
  if (imp) renderImportPreview();
});
impForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!imp) return;
  const [kind, id] = $("#impDest").value.split(":");
  const chosen = imp.items.filter((x) => x.checked);
  for (const it of chosen) {
    const base = { id: uid(), type: it.type, desc: it.desc, cat: it.cat, value: it.value, date: it.date, parcelas: 1, imported: true, ...(it.fitid ? { fitid: it.fitid } : {}) };
    if (kind === "card" && it.type === "saida") state.tx.push({ ...base, method: "credito", cartao: id });
    else state.tx.push({ ...base, method: it.type === "entrada" ? "pix" : "debito", conta: kind === "acc" ? id : cardById(id)?.conta || state.accounts[0].id });
  }
  normalizeRefs();
  impDialog.close();
  if (chosen.length) {
    const last = chosen.map((x) => mk(x.date)).sort().pop();
    ui.month = last <= CUR ? last : CUR;
  }
  refresh();
  alert(`${chosen.length} lançamento(s) importado(s).`);
});

// ===== Foto de perfil =====
$("#photoInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    const size = 480, scale = Math.min(1, size / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    state.profile.photo = c.toDataURL("image/jpeg", 0.85);
    URL.revokeObjectURL(img.src);
    save();
    render();
  };
  img.src = URL.createObjectURL(file);
  e.target.value = "";
});

// ===== Configurações =====
const setDialog = $("#setDialog"), setForm = $("#setForm"), setF = setForm.elements;
$("#btnSettings").addEventListener("click", () => {
  setF.name.value = state.profile.name;
  setF.meta.value = state.profile.meta || "";
  setF.check.value = String(state.check.periodo ?? 7);
  $("#btnLogout").classList.toggle("hidden", !ui.cloud);
  $("#backupNote").innerHTML = ui.cloud
    ? '<i class="ti ti-device-floppy"></i> A nuvem guarda uma cópia dos seus dados por dia (últimos 30 dias). Use também o Exportar JSON de vez em quando.'
    : '<i class="ti ti-device-floppy"></i> O servidor guarda uma cópia do <code>dados.json</code> por dia na pasta <code>backups/</code> (últimos 30 dias).';
  setDialog.showModal();
});
setForm.addEventListener("submit", (e) => {
  e.preventDefault();
  state.profile.name = setF.name.value.trim();
  state.profile.meta = Number(setF.meta.value) || 0;
  state.check.periodo = Number(setF.check.value) || 0;
  save();
  setDialog.close();
  render();
});
$("#profileName").addEventListener("click", () => { if (!state.profile.name) $("#btnSettings").click(); });
$("#btnLogout").addEventListener("click", async () => {
  if (saveTimer) { clearTimeout(saveTimer); flush(); }
  await saveChain;
  await fetch("api/logout", { method: "POST" }).catch(() => {});
  location.reload();
});
$("#btnRemovePhoto").addEventListener("click", () => { state.profile.photo = ""; save(); render(); });
$("#btnExport").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
  a.download = `financas-${TODAY}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});
async function restoreBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.tx) || !data.profile) throw new Error();
    state = migrate(data);
    ui.recCreated = runRecurring();
    setDialog.close();
    refresh();
  } catch { alert("Arquivo inválido: esperava um JSON exportado por este app."); }
}
$("#importInput").addEventListener("change", async (e) => {
  if (e.target.files[0]) await restoreBackup(e.target.files[0]);
  e.target.value = "";
});
$("#btnReset").addEventListener("click", () => {
  if (!confirm("Apagar TODOS os lançamentos, metas e configurações? (o backup do dia continua guardado)")) return;
  state = emptyState();
  ui.month = CUR;
  setDialog.close();
  refresh();
});

// ===== Navegação =====
const openers = { cats: openCats, accounts: openAccounts, import: openImport, check: openCheck };
document.addEventListener("click", (e) => {
  const op = e.target.closest("[data-open]");
  if (op) {
    op.closest("dialog")?.close();
    openers[op.dataset.open]();
  }
  const dis = e.target.closest("[data-dismiss]");
  if (dis) {
    ui.dismissed.add(dis.dataset.dismiss);
    if (/recorrente\(s\) criado/.test(dis.dataset.dismiss)) ui.recCreated = 0;
    dis.closest(".alert").remove();
  }
});
$$("[data-new]").forEach((b) => b.addEventListener("click", () => openTx(b.dataset.new)));
$$("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));

$("#monthSel").addEventListener("change", (e) => { ui.month = e.target.value; render(); });
const tabGroup = (sel, key) => $(sel).addEventListener("click", (e) => {
  const b = e.target.closest(".tab");
  if (!b) return;
  $$(`${sel} .tab`).forEach((t) => t.classList.toggle("active", t === b));
  ui[key] = b.dataset.mode;
  render();
});
tabGroup("#lineTabs", "lineMode");
tabGroup("#yearTabs", "yearMode");
const TELA_KEY = "financas.tela";
const chartsDaTela = { geral: () => [radar, line, yearChart], parc: () => [bar].filter(Boolean) };
function mostrarTela(tab) {
  const primeiraVezNoParc = tab === "parc" && !bar;
  $$("#mainTabs .tab, .drawer-item").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
  $$(".panel").forEach((p) => p.classList.toggle("hidden", p.id !== `tab-${tab}`));
  $("#telas").classList.toggle("hidden", tab === "geral");
  window.scrollTo({ top: 0 });
  requestAnimationFrame(() => {
    if (primeiraVezNoParc) { criarGraficoFaturas(); render(); return; }
    // gráficos que estavam escondidos precisam se redimensionar ao aparecer
    (chartsDaTela[tab]?.() || []).forEach((ch) => { ch.resize(); ch.update(); });
  });
  try { localStorage.setItem(TELA_KEY, tab); } catch {}
}
$("#mainTabs").addEventListener("click", (e) => {
  const b = e.target.closest(".tab");
  if (b) mostrarTela(b.dataset.tab);
});

// No celular as abas viram um menu lateral, montado a partir das mesmas abas
const drawer = $("#drawer"), drawerBg = $("#drawerBg");
$("#drawerNav").innerHTML = $$("#mainTabs .tab")
  .map((b) => `<button class="drawer-item" data-tab="${b.dataset.tab}">${esc(b.textContent.trim())}</button>`).join("");
const abrirMenu = (abrir) => { drawer.classList.toggle("open", abrir); drawerBg.classList.toggle("open", abrir); };
$("#btnMenu").addEventListener("click", () => abrirMenu(!drawer.classList.contains("open")));
drawerBg.addEventListener("click", () => abrirMenu(false));
$("#drawerNav").addEventListener("click", (e) => {
  const b = e.target.closest(".drawer-item");
  if (!b) return;
  mostrarTela(b.dataset.tab);
  abrirMenu(false);
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") abrirMenu(false); });

["#fSearch", "#fType", "#fScope", "#fCat", "#fMethod", "#fMin", "#fMax"].forEach((s) => $(s).addEventListener("input", renderTable));
$("#fClear").addEventListener("click", () => {
  ["#fSearch", "#fType", "#fCat", "#fMethod", "#fMin", "#fMax"].forEach((s) => { $(s).value = ""; });
  renderTable();
});
$$("th.sortable").forEach((th) => th.addEventListener("click", () => {
  const key = th.dataset.sort;
  ui.sort = { key, dir: ui.sort.key === key ? -ui.sort.dir : key === "date" || key === "value" ? -1 : 1 };
  renderTable();
}));

// ===== Início =====
(async () => {
  state = migrate(await load());
  ui.recCreated = runRecurring();
  save();
  renderMonthSelect();
  renderFilterOptions();
  render();
  let telaInicial = "geral";
  try { telaInicial = localStorage.getItem(TELA_KEY) || "geral"; } catch {}
  if ($(`#tab-${telaInicial}`)) mostrarTela(telaInicial);
})();
