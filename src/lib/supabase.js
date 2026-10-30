import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
export const brl = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const toLocalInput = iso => { const d = new Date(iso); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16) }

// Link do WhatsApp; com `msg` a conversa já abre com o texto pronto
export const zap = (t, msg) => 'https://wa.me/55' + String(t || '').replace(/\D/g, '').replace(/^55/, '') + (msg ? '?text=' + encodeURIComponent(msg) : '')

// Mensagem de confirmação enviada ao cliente (edite o texto aqui se quiser mudar)
export function mensagemWhats(a) {
  const d = new Date(a.inicio), zero = x => new Date(x.getFullYear(), x.getMonth(), x.getDate())
  const dif = Math.round((zero(d) - zero(new Date())) / 864e5)
  const quando = dif === 0 ? 'hoje' : dif === 1 ? 'amanhã' : 'dia ' + d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const nome = String(a.cliente_nome || '').trim().split(/\s+/)[0]
  return `✨✅Oi, ${nome}, tudo bem? \nPassando pra confirmar seu atendimento ${quando} às ${hora} ✅✨`
}