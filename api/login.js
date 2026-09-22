// POST { senha } → confere com APP_PASSWORD e cria o cookie de sessão (30 dias)
import { readJson, redis, route, safeEqual, send, sessionCookie } from "./_lib.js";

const MAX_FAILS = 10;
const LOCK_SECONDS = 15 * 60;

export default route(async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { erro: "Método não permitido." });

  // Bloqueia chute de senha: 10 erros seguidos do mesmo IP travam por 15 minutos
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "desconhecido";
  const failsKey = `financas:login-falhas:${ip}`;
  if ((Number(await redis("GET", failsKey)) || 0) >= MAX_FAILS) {
    return send(res, 429, { erro: "Muitas tentativas erradas. Espere 15 minutos." });
  }

  const { senha } = (await readJson(req)) || {};
  if (typeof senha !== "string" || !safeEqual(senha, process.env.APP_PASSWORD)) {
    await redis("INCR", failsKey);
    await redis("EXPIRE", failsKey, LOCK_SECONDS);
    return send(res, 401, { erro: "Senha incorreta." });
  }

  await redis("DEL", failsKey);
  send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie() });
});
