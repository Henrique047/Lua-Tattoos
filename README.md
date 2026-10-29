# Lua tattoos – sistema administrativo

## 1. Supabase (gratuito)
1. Crie um projeto em supabase.com e abra **SQL Editor**; cole e execute `supabase/schema.sql`.
2. Em **Authentication → Users**, crie os 2 usuários (tatuadora e piercer) e desative o cadastro público (Providers → Email → *Allow new users to sign up* desligado).
3. Em **Project Settings → API**, copie a URL e a chave `anon`.

## 2. Rodar local
```
cp .env.example .env   # preencha as duas variáveis
npm install
npm run dev
```

## 3. Publicar (Vercel ou Netlify, gratuito)
Suba a pasta para um repositório no GitHub, importe no Vercel, adicione as duas variáveis `VITE_...` e publique.

## 4. Lembretes por e-mail
1. Crie conta no Resend e gere uma API key.
2. `supabase functions deploy lembretes` e defina os segredos:
   `supabase secrets set RESEND_API_KEY=... EMAIL_FROM=... EMAIL_TATUADORA=... EMAIL_PIERCER=...`
3. Agende (SQL Editor, com as extensões pg_cron e pg_net ativas), todo dia às 18h (21:00 UTC):
```
select cron.schedule('lembretes','0 21 * * *',$$select net.http_post('https://SEU-PROJETO.supabase.co/functions/v1/lembretes', headers:='{"Authorization":"Bearer SUA-CHAVE-ANON"}'::jsonb)$$);
```
Obs.: sem domínio próprio, o Resend só entrega no e-mail da própria conta; para enviar a duas pessoas, verifique um domínio ou use um remetente SMTP (Brevo).
