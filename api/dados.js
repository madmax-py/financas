// GET: devolve os dados salvos · PUT/POST: salva (POST é usado pelo sendBeacon ao fechar a aba)
import { DATA_KEY, isAuthed, readJson, redis, route, send } from "./_lib.js";

const MAX_BYTES = 900_000; // o plano grátis do Upstash aceita ~1 MB por requisição
const BACKUP_DAYS = 30;

export default route(async (req, res) => {
  if (!isAuthed(req)) return send(res, 401, { erro: "Faça login." });

  if (req.method === "GET") {
    const saved = await redis("GET", DATA_KEY);
    return saved ? send(res, 200, saved) : send(res, 404, "null");
  }

  if (req.method === "PUT" || req.method === "POST") {
    const data = await readJson(req);
    if (!data || typeof data !== "object" || !Array.isArray(data.tx)) return send(res, 400, { erro: "JSON inválido." });
    const body = JSON.stringify(data);
    if (Buffer.byteLength(body) > MAX_BYTES) {
      return send(res, 413, { erro: "Os dados passaram de ~1 MB (limite do Upstash grátis). Tente uma foto de perfil menor." });
    }
    // Antes do primeiro salvamento do dia, guarda como os dados estavam (fica 30 dias)
    const backupKey = `financas:backup:${new Date().toISOString().slice(0, 10)}`;
    if (!(await redis("EXISTS", backupKey))) {
      const current = await redis("GET", DATA_KEY);
      if (current) await redis("SET", backupKey, current, "EX", BACKUP_DAYS * 24 * 60 * 60);
    }
    await redis("SET", DATA_KEY, body);
    return send(res, 200, { ok: true });
  }

  send(res, 405, { erro: "Método não permitido." });
});
