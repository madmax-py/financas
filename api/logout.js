// POST → apaga o cookie de sessão
import { clearedCookie, send } from "./_lib.js";

export default function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { erro: "Método não permitido." });
  send(res, 200, { ok: true }, { "Set-Cookie": clearedCookie() });
}
