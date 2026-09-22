// Funções compartilhadas pelas rotas da API na Vercel (arquivos com "_" não viram rota).
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// A integração Upstash da Vercel cria KV_REST_API_*; quem conecta direto no Upstash tem UPSTASH_REDIS_REST_*
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const DATA_KEY = "financas:dados";
const COOKIE = "financas_sessao";
const SESSION_DAYS = 30;

export function configError() {
  if (!process.env.APP_PASSWORD) return "Falta a variável de ambiente APP_PASSWORD na Vercel.";
  if (!REDIS_URL || !REDIS_TOKEN) return "Falta conectar um banco Upstash Redis ao projeto na Vercel (Storage → Upstash).";
  return null;
}

// Um comando Redis pela API REST do Upstash, ex.: redis("SET", "chave", "valor")
export async function redis(...command) {
  const r = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command.map(String)),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok || json.error) throw new Error(json.error || `Upstash respondeu ${r.status}`);
  return json.result;
}

// Compara em tempo constante (não vaza pelo tempo de resposta quantos caracteres bateram)
const sha = (s) => createHash("sha256").update(String(s)).digest();
export const safeEqual = (a, b) => timingSafeEqual(sha(a), sha(b));

// Sessão = cookie "validade.assinatura". Trocar a APP_PASSWORD derruba todas as sessões.
const secret = () => process.env.SESSION_SECRET || `financas:${process.env.APP_PASSWORD}`;
const sign = (value) => createHmac("sha256", secret()).update(value).digest("base64url");
const cookieAttrs = (maxAge) => `Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;

export function sessionCookie() {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const exp = String(Date.now() + maxAge * 1000);
  return `${COOKIE}=${exp}.${sign(exp)}; ${cookieAttrs(maxAge)}`;
}
export const clearedCookie = () => `${COOKIE}=; ${cookieAttrs(0)}`;

export function isAuthed(req) {
  const raw = (req.headers.cookie || "").split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (!raw) return false;
  const [exp, sig] = raw.slice(COOKIE.length + 1).split(".");
  if (!exp || !sig || !(Number(exp) > Date.now())) return false;
  return safeEqual(sig, sign(exp));
}

export function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Financas-Auth", "on"); // avisa o front que esta versão usa login
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

// Lê o corpo JSON da requisição (a Vercel às vezes já entrega parseado, às vezes não)
export async function readJson(req) {
  let body;
  try { body = req.body; } catch { return null; } // JSON inválido
  if (body && typeof body === "object" && !Buffer.isBuffer(body)) return body;
  if (typeof body === "string" || Buffer.isBuffer(body)) {
    try { return JSON.parse(body.toString()); } catch { return null; }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { return null; }
}

// Envolve a rota: checa configuração e transforma exceções em erro 500 legível
export const route = (handler) => async (req, res) => {
  const problem = configError();
  if (problem) return send(res, 500, { erro: problem });
  try {
    await handler(req, res);
  } catch (err) {
    console.error(err);
    send(res, 500, { erro: `Erro no servidor: ${err.message}` });
  }
};
