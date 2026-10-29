import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
export const brl = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const toLocalInput = iso => { const d = new Date(iso); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16) }
export const zap = t => 'https://wa.me/55' + String(t || '').replace(/\D/g, '').replace(/^55/, '')
