import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { supabase, brl } from './supabase'

export const TIPOS = ['dinheiro', 'pix', 'debito', 'credito']
export const NOME_FORMA = { dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Débito', credito: 'Crédito', nao_informado: 'Não informado' }
const r2 = n => Math.round(n * 100) / 100

// Texto da forma: "Crédito 3x", "PIX"...
export const rotulo = (tipo, parcelas) => tipo === 'credito' ? (Number(parcelas) > 1 ? `Crédito ${parcelas}x` : 'Crédito à vista') : (NOME_FORMA[tipo] || tipo)
// Categoria usada nos filtros e relatórios
export const categoria = (tipo, parcelas) => tipo === 'dinheiro' ? 'Dinheiro' : tipo === 'pix' ? 'PIX' : tipo === 'debito' ? 'Débito'
  : tipo === 'credito' ? (Number(parcelas) > 1 ? 'Crédito parcelado' : 'Crédito à vista') : 'Não informado'

// Formas ATIVAS cadastradas na tela de taxas
export function useFormas() {
  const [formas, setFormas] = useState([])
  useEffect(() => { supabase.from('formas_pagamento').select('*').eq('ativo', true).order('parcelas').then(({ data }) => setFormas(data || [])) }, [])
  return formas
}

// ---------- linhas de pagamento: { valor: '200', tipo: 'pix', parcelas: 1, auto?: true } ----------
export const novaLinha = (formas, valor = '') => {
  const t = ['pix', 'dinheiro', 'debito', 'credito'].find(x => formas.some(f => f.tipo === x)) || 'pix'
  return { valor: valor === '' || !(Number(valor) > 0) ? '' : String(valor), tipo: t, parcelas: formas.find(f => f.tipo === t)?.parcelas ?? 1, auto: true }
}
export const somaLinhas = ls => r2(ls.reduce((s, l) => s + Number(l.valor || 0), 0))
export const calcLinha = (l, formas) => {
  const f = formas.find(x => x.tipo === l.tipo && x.parcelas === Number(l.parcelas))
  const pct = l.tipo === 'nao_informado' ? 0 : Number(f?.taxa || 0), v = Number(l.valor || 0), taxa = r2(v * pct / 100)
  return { pct, taxa, liquido: r2(v - taxa), ok: l.tipo === 'nao_informado' || !!f }
}
export const linhasValidas = (ls, formas) => ls.every(l => !(Number(l.valor) > 0) || calcLinha(l, formas).ok)
export const paraRpc = ls => ls.filter(l => Number(l.valor) > 0).map(l => ({ valor: Number(l.valor), tipo: l.tipo, parcelas: Number(l.parcelas) || 1 }))

// Componente: várias formas de pagamento com botão "+"; `total` (opcional) é o valor que as linhas devem somar
export function PagamentoLinhas({ formas, linhas, onChange, total, inicial = true }) {
  const feito = useRef(false)
  const alvo = total != null && Number.isFinite(total) ? r2(total) : null

  useEffect(() => {   // cria a primeira linha assim que as formas carregam
    if (!inicial || feito.current || !formas.length || linhas.length) return
    feito.current = true; onChange([novaLinha(formas, alvo ?? '')])
  }, [formas.length, linhas.length])
  useEffect(() => {   // com uma única linha automática, ela acompanha o total
    if (alvo == null || linhas.length !== 1 || !linhas[0].auto) return
    const v = alvo > 0 ? String(alvo) : ''
    if (linhas[0].valor !== v) onChange([{ ...linhas[0], valor: v }])
  }, [alvo, linhas])

  const muda = (k, patch) => onChange(linhas.map((l, i) => i === k ? { ...l, ...patch } : l))
  const trocaTipo = (k, tipo) => muda(k, { tipo, parcelas: tipo === 'credito' ? (formas.find(f => f.tipo === 'credito')?.parcelas ?? 1) : 1 })
  const add = () => onChange([...linhas.map(l => ({ ...l, auto: false })), { ...novaLinha(formas, alvo != null ? Math.max(0, r2(alvo - somaLinhas(linhas))) : ''), auto: false }])
  const soma = somaLinhas(linhas), calc = linhas.map(l => calcLinha(l, formas))
  const taxas = r2(calc.reduce((s, c) => s + c.taxa, 0)), dif = alvo != null ? r2(alvo - soma) : 0

  return (
    <div className="pg">
      {linhas.map((l, k) => {
        const tipos = [...TIPOS.filter(t => formas.some(f => f.tipo === t)), ...(formas.some(f => f.tipo === l.tipo) ? [] : [l.tipo])]
        const parc = formas.filter(f => f.tipo === 'credito')
        return (
          <div className="pg-row" key={k}>
            <label>Valor (R$)<input type="number" inputMode="decimal" step="0.01" min="0" value={l.valor} onChange={e => muda(k, { valor: e.target.value, auto: false })} /></label>
            <label>Forma<select value={l.tipo} onChange={e => trocaTipo(k, e.target.value)}>{tipos.map(t => <option key={t} value={t}>{NOME_FORMA[t]}</option>)}</select></label>
            {l.tipo === 'credito' && <label>Parcelas<select value={l.parcelas} onChange={e => muda(k, { parcelas: Number(e.target.value) })}>
              {parc.map(f => <option key={f.parcelas} value={f.parcelas}>{f.parcelas === 1 ? 'À vista' : `${f.parcelas}x`}</option>)}</select></label>}
            <button type="button" className="icon-btn danger" aria-label="Remover forma de pagamento" onClick={() => onChange(linhas.filter((_, i) => i !== k))}><Trash2 size={17} /></button>
            <small className={'pg-info ' + (calc[k].ok ? 'muted' : 'erro')}>{calc[k].ok
              ? `Taxa ${calc[k].pct.toLocaleString('pt-BR')}% = ${brl(calc[k].taxa)} · líquido ${brl(calc[k].liquido)}`
              : 'Esta forma está desativada ou sem taxa cadastrada.'}</small>
          </div>)
      })}
      <button type="button" className="btn ghost" onClick={add}><Plus size={16} />Adicionar forma de pagamento</button>
      {linhas.length > 0 && <div className="pg-total">
        <span>Total informado <b>{brl(soma)}</b></span><span>Taxas <b>{brl(taxas)}</b></span><span>Líquido <b className="money">{brl(r2(soma - taxas))}</b></span>
        {alvo != null && <span className={Math.abs(dif) <= 0.01 ? 'ok' : 'erro'}>{Math.abs(dif) <= 0.01 ? 'Confere com o valor a receber' : dif > 0 ? `Faltam ${brl(dif)}` : `Passou ${brl(-dif)}`}</span>}
      </div>}
    </div>)
}
