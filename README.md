# 💰 Minhas Finanças

Dashboard de finanças pessoais: lançamentos, parcelas no cartão, recorrências, orçamento por categoria, metas, previsão de saldo, importação de extrato (CSV/OFX) e gráficos.

HTML, CSS e JavaScript puros, com [Chart.js](https://www.chartjs.org/). Não precisa de build.

## Rodar no seu computador

Precisa só de Python 3:

```bash
python3 server.py
```

Abra http://localhost:5178. Os dados ficam em `dados.json` e o servidor guarda uma cópia por dia em `backups/` (últimos 30 dias). Os dois estão no `.gitignore` e **nunca vão pro GitHub**.

## Publicar na Vercel (com senha e dados na nuvem)

Na Vercel os dados ficam num banco **Upstash Redis** (tem plano grátis) e o site pede uma senha.

1. Em [vercel.com/new](https://vercel.com/new), importe este repositório. Em *Framework Preset*, deixe **Other** e não mude mais nada.
2. No projeto, vá em **Storage → Create Database → Upstash (Redis)**, crie o banco (plano Free) e conecte ao projeto. Isso já cria as variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN`.
3. Em **Settings → Environment Variables**, crie `APP_PASSWORD` com a senha que você vai usar pra entrar. Use uma senha forte, porque o site fica num endereço público.
4. Vá em **Deployments** e faça **Redeploy** pra valer as variáveis novas.
5. Abra o site e entre com a senha. Pra levar os dados do computador: no app local, **⚙ → Exportar JSON**. Na Vercel, **⚙ → Importar JSON**.

Detalhes:

- A sessão dura 30 dias. Trocar a `APP_PASSWORD` desconecta todo mundo.
- Depois de 10 senhas erradas seguidas, o login fica bloqueado por 15 minutos.
- A nuvem guarda um backup diário por 30 dias (chaves `financas:backup:AAAA-MM-DD` no Upstash).
- O plano grátis do Upstash aceita cerca de 1 MB por gravação. A foto de perfil já é reduzida automaticamente, então sobra bastante espaço.

## Estrutura

| Arquivo | O que faz |
| --- | --- |
| `index.html`, `style.css`, `app.js` | O app (roda no navegador) |
| `server.py` | Servidor local: serve o app e grava `dados.json` |
| `api/` | Funções serverless da Vercel: `dados` (ler/salvar), `login`, `logout` |
