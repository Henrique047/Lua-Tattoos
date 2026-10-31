import { useEffect, useMemo, useState } from 'react'
import { Search, Image as Img, Minus, Plus, ShoppingBag, X, Check, Package, ArrowLeft } from 'lucide-react'
import { supabase, brl } from '../lib/supabase'
import { r2, calcular } from '../lib/calc'
import { PagamentoLinhas, useFormas, somaLinhas, paraRpc, linhasValidas } from '../lib/pagamentos'
import useMobile from '../lib/useMobile'
import Modal from './Modal'

const Thumb = ({ i, s = 56 }) => i?.imagem_url
  ? <img src={i.imagem_url} alt={i.nome} className="thumb" style={{ width: s, height: s }} />
  : <span className="thumb" style={{ width: s, height: s }}><Img size={18} /></span>
const unicos = (arr, k) => [...new Set(arr.map(i => i[k]).filter(Boolean))]
// comissão da piercer por unidade, sem desconto
const comUn = j => j.comissao_tipo === 'percentual'
  ? Math.max(0, Number(j.valor_venda) - Number(j.valor_compra)) * Number(j.comissao_valor) / 100 : Number(j.comissao_valor)

export default function Vendas({ ctx, nav }) {
  const enc = ctx?.encomenda                       // venda de uma joia encomendada (vem da tela de Encomendas)
  const mobile = useMobile(900), formas = useFormas()
  const [joias, setJoias] = useState([]), [q, setQ] = useState(''), [f, setF] = useState({ material: '', local: '', tipo: '' })
  const [cart, setCart] = useState({}), [desc, setDesc] = useState(''), [cliente, setCliente] = useState(''), [pag, setPag] = useState([])
  const [busy, setBusy] = useState(false), [ok, setOk] = useState(''), [erro, setErro] = useState(''), [aberto, setAberto] = useState(false)

  const carregar = async () => {
    const { data, error } = await supabase.from('joias').select('*').eq('oculta', false).gt('quantidade', 0).order('nome')
    if (error) setErro(error.message); setJoias(data || [])
  }
  useEffect(() => { carregar() }, [])

  const vis = useMemo(() => joias.filter(i => (!q || i.nome.toLowerCase().includes(q.toLowerCase())) &&
    Object.entries(f).every(([k, v]) => !v || i[k] === v)), [joias, q, f])

  const troca = (j, d) => setCart(c => {
    const n = Math.min(j.quantidade, Math.max(0, (c[j.id] || 0) + d)), nc = { ...c }
    if (n === 0) delete nc[j.id]; else nc[j.id] = n
    return nc
  })

  // ---------- totais ----------
  // na venda de encomenda, a joia vale o preço combinado e o sinal já foi pago
  const itens = enc ? [{ joia: { ...enc.joias, valor_venda: Number(enc.valor_total) }, qtd: 1 }]
    : joias.filter(j => cart[j.id] > 0).map(j => ({ joia: j, qtd: cart[j.id] }))
  const qtdTotal = itens.reduce((s, i) => s + i.qtd, 0)
  const sinal = enc ? Number(enc.sinal) : 0
  const subtotal = r2(itens.reduce((s, i) => s + Number(i.joia.valor_venda) * i.qtd, 0))
  const descNum = desc === '' ? 0 : Number(desc)
  const descOk = !Number.isNaN(descNum) && descNum >= 0 && descNum <= subtotal + 0.001 && subtotal - descNum >= sinal - 0.001
  const total = descOk ? r2(subtotal - descNum) : subtotal
  const restante = Math.max(0, r2(total - sinal))      // o que ainda será pago agora
  const { comissao } = calcular(itens)                 // não muda com desconto
  const pagOk = restante <= 0.001 || (Math.abs(somaLinhas(pag) - restante) <= 0.01 && linhasValidas(pag, formas))

  const vender = async () => {
    setBusy(true); setErro('')
    const { error } = await supabase.rpc('registrar_venda', {
      p_itens: enc ? [] : itens.map(i => ({ joia_id: i.joia.id, qtd: i.qtd })), p_desconto: descNum,
      p_cliente: enc ? null : cliente.trim() || null, p_pagamentos: restante > 0.001 ? paraRpc(pag) : [], p_encomenda: enc?.id || null })
    setBusy(false)
    if (error) return setErro(error.message)
    if (enc) return nav('encomendas')
    setCart({}); setDesc(''); setCliente(''); setPag([]); setAberto(false); carregar()
    setOk(`Venda registrada! Total ${brl(total)}`); setTimeout(() => setOk(''), 5000)
  }

  const resumoVenda = (
    <div className="carrinho-in">
      <h3><ShoppingBag size={18} /> Venda</h3>
      {itens.length === 0 ? <p className="muted">Use os botões + nas joias para montar a venda.</p> :
        <div className="res-itens">{itens.map(({ joia, qtd }) => (
          <div className="res-item" key={joia.id}>
            <span><b>{joia.nome}</b> <small className="muted">{joia.tamanho}</small></span>
            <span className="muted">{qtd} × {brl(joia.valor_venda)}</span>
            {!enc && <button className="icon-btn danger" aria-label="Remover" onClick={() => setCart(c => { const n = { ...c }; delete n[joia.id]; return n })}><X size={15} /></button>}
          </div>))}</div>}
      {!enc && <label>Cliente (opcional)<input value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Nome" /></label>}
      <div className="res-linha"><span className="muted">Subtotal</span><b>{brl(subtotal)}</b></div>
      <label>Desconto (R$)<input type="number" inputMode="decimal" step="0.01" min="0" max={subtotal} value={desc} onChange={e => setDesc(e.target.value)} placeholder="0,00" /></label>
      {!descOk && <p className="hint erro">{enc ? `O desconto não pode deixar o total abaixo do sinal já pago (${brl(sinal)}).` : `O desconto precisa estar entre R$ 0,00 e ${brl(subtotal)}.`}</p>}
      <div className="res-linha total"><span>Total da venda</span><strong className="total-grande money">{brl(total)}</strong></div>
      {enc && <>
        <div className="res-linha"><span className="muted">Sinal já pago (não conta de novo)</span><b className="money">− {brl(sinal)}</b></div>
        <div className="res-linha"><span>Restante a receber agora</span><b>{brl(restante)}</b></div></>}
      {restante > 0.001 && itens.length > 0 && <div className="pagar"><strong>Forma de pagamento{enc ? ' do restante' : ''}</strong>
        <PagamentoLinhas formas={formas} linhas={pag} onChange={setPag} total={restante} /></div>}
      <div className="ganho"><span>Lucro da piercer</span><b className="money">{brl(comissao)}</b></div>
      {erro && <p className="hint erro">{erro}</p>}
      <button className="btn primary big" disabled={!itens.length || !descOk || !pagOk || busy} onClick={vender}><Check size={18} />{busy ? 'Registrando…' : 'Vender'}</button>
    </div>)

  const inline = !mobile || enc
  return (
    <div className={'vendas' + (mobile && qtdTotal && !enc ? ' com-barra' : '')}>
      <section>
        <h2>Vendas</h2>
        {enc ? <div className="card enc-banner">
          <button className="btn ghost" onClick={() => nav('encomendas')}><ArrowLeft size={16} />Voltar às encomendas</button>
          <div className="enc-banner-in"><Thumb i={enc.joias} /><div><strong><Package size={15} /> Venda de joia encomendada</strong>
            <span>{enc.cliente_nome}{enc.telefone ? ` · ${enc.telefone}` : ''}</span>
            <small className="muted">{[enc.joias?.nome, enc.joias?.tamanho, enc.joias?.material].filter(Boolean).join(' · ')}</small></div></div>
          <div className="vals"><div><span>Valor total</span><b>{brl(enc.valor_total)}</b></div><div><span>Sinal pago</span><b className="money">{brl(enc.sinal)}</b></div>
            <div><span>Restante</span><b>{brl(Number(enc.valor_total) - Number(enc.sinal))}</b></div></div>
        </div> : <>
          <p className="muted dica">Escolha as joias e as quantidades. O estoque e os relatórios são atualizados ao vender.</p>
          {ok && <p className="ok-msg"><Check size={16} />{ok}</p>}
          <div className="row wrap filtros">
            <label className="busca"><Search size={16} /><input placeholder="Buscar por nome" value={q} onChange={e => setQ(e.target.value)} /></label>
            {[['material', 'Material'], ['local', 'Local'], ['tipo', 'Tipo']].map(([k, l]) => (
              <select key={k} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })}><option value="">{l}</option>{unicos(joias, k).map(m => <option key={m}>{m}</option>)}</select>))}
          </div>
          <div className="vlista">
            {vis.length === 0 && <p className="muted pad card">Nenhuma joia disponível. Cadastre no Estoque ou ajuste os filtros.</p>}
            {vis.map(j => { const n = cart[j.id] || 0; return (
              <div className={'vlinha' + (n ? ' sel' : '')} key={j.id}>
                <Thumb i={j} />
                <div className="vinfo"><strong>{j.nome}</strong>
                  <small className="muted">{[j.tipo, j.material, j.tamanho, j.local].filter(Boolean).join(' · ') || '–'}</small></div>
                <div className="vnums">
                  <div><span>Valor</span><b>{brl(j.valor_venda)}</b></div>
                  <div><span>Comissão</span><b className="money">{brl(comUn(j))}</b></div>
                  <div><span>Estoque</span><b className={j.quantidade <= 2 ? 'baixo' : ''}>{j.quantidade}</b></div>
                </div>
                <div className="stepper">
                  <button aria-label="Diminuir" disabled={!n} onClick={() => troca(j, -1)}><Minus size={16} /></button>
                  <b>{n}</b>
                  <button aria-label="Aumentar" disabled={n >= j.quantidade} onClick={() => troca(j, 1)}><Plus size={16} /></button>
                </div>
              </div>) })}
          </div></>}
        {enc && inline && mobile && <aside className="card carrinho estatico">{resumoVenda}</aside>}
      </section>

      {!mobile && <aside className="card carrinho">{resumoVenda}</aside>}

      {mobile && !enc && qtdTotal > 0 && <div className="barra-venda">
        <div><small className="muted">{qtdTotal} {qtdTotal === 1 ? 'joia' : 'joias'}</small><strong className="money">{brl(total)}</strong></div>
        <button className="btn primary" onClick={() => setAberto(true)}><ShoppingBag size={17} />Ver venda</button>
      </div>}
      {mobile && !enc && aberto && <Modal title="Finalizar venda" onClose={() => setAberto(false)}>{resumoVenda}</Modal>}
    </div>)
}
