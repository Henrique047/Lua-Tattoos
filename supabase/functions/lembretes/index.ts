// Envia, às profissionais, a lista dos atendimentos de amanhã. Agende com pg_cron (ver README).
Deno.serve(async () => {
  const E = Deno.env.toObject(), h = { apikey: E.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${E.SUPABASE_SERVICE_ROLE_KEY}` }
  const dia = new Date(Date.now() - 3 * 3600e3 + 864e5).toISOString().slice(0, 10)
  const r = await fetch(`${E.SUPABASE_URL}/rest/v1/agendamentos?select=*&status=eq.agendado&inicio=gte.${dia}T00:00:00-03:00&inicio=lte.${dia}T23:59:59-03:00&order=inicio`, { headers: h })
  const lista: any[] = await r.json()
  const dest: Record<string, string> = { tatuagem: E.EMAIL_TATUADORA, piercing: E.EMAIL_PIERCER }
  for (const s of ['tatuagem', 'piercing']) {
    const itens = lista.filter(a => a.servico === s); if (!itens.length) continue
    const html = itens.map(a => `<p><b>${new Date(a.inicio).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}</b> – ${a.cliente_nome} ${a.telefone || ''}<br>Restante: R$ ${(a.valor_total - a.desconto - a.sinal).toFixed(2)}</p>`).join('')
    await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${E.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: E.EMAIL_FROM, to: dest[s], subject: `Lua tattoos – atendimentos de ${dia.split('-').reverse().join('/')}`, html }) })
  }
  return new Response('ok')
})
