import { useEffect, useState } from 'react'
import { Plus, Pencil, Ban, Check, MessageCircle, CalendarDays, ShoppingBag, Package, Clock, Trash2, Image as Img } from 'lucide-react'
import { supabase, brl, zap, mensagemEncomenda } from '../lib/supabase'
import { PagamentoLinhas, useFormas, somaLinhas, paraRpc, linhasValidas } from '../lib/pagamentos'
import { JoiaCampos, joiaVazia } from './JoiaForm'
import JoiaBusca from './JoiaBusca'
import Modal from './Modal'

const hoje = () => new Date().toLocaleDateString('sv')
const dataBr = d => d ? new Date(d.length === 10 ? d + 'T12:00' : d).toLocaleDateString('pt-BR') : '–'
const descJoia = j => j ? [j.nome, j.tipo, j.tamanho, j.material, j.local].filter(Boolean).join(' · ') : '–'
const uid = () => Math.random().toString(36).slice(2)
const itemNovo = () => ({ k: uid(), id: null, modo: 'existente', joia_id: '', joia: { ...joiaVazia }, valor: '', manual: false, txt: '' })
const novo = () => ({ id: null, status: 'pendente', cliente_nome: '', telefone: '', itens: [itemNovo()], data_encomenda: hoje(), observacoes: '', pag: [], pagOriginal: null })
// itens do pedido na ordem em que foram incluídos
const itensDe = e => [...(e.encomenda_itens || [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
// mesmo cliente = mesmo nome e, quando os dois têm telefone, o mesmo telefone (igual à regra do banco)
const digitos = t => String(t || '').replace(/\D/g, '')
const mesmoCliente = (a, b) => a.cliente_nome.trim().toLowerCase() === b.cliente_nome.trim().toLowerCase() &&
  (!digitos(a.telefone) || !digitos(b.telefone) || digitos(a.telefone) === digitos(b.telefone))

const Thumb = ({ j, s = 56 }) => j?.imagem_url ? <img src={j.imagem_url} alt={j.nome} className="thumb" style={{ width: s, height: s }} /> : <span className="thumb" style={{ width: s, height: s }}><Img size={18} /></span>

export default function Encomendas({ nav }) {
  const formas = useFormas()
  const [lista, setLista] = useState([]), [joias, setJoias] = useState([]), [comp, setComp] = useState({}), [erroCarga, setErroCarga] = useState('')
  const [form, setForm] = useState(null), [erro, setErro] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState('')
  const [canc, setCanc] = useState(null), [destino, setDestino] = useState(null), [chegando, setChegando] = useState(null), [marcadas, setMarcadas] = useState(new Set())

  const carregar = async () => {
    const [e, j, c] = await Promise.all([
      supabase.from('encomendas').select('*, encomenda_itens(id, joia_id, valor, created_at, joias(*))').neq('status', 'agendada').order('data_encomenda').order('created_at'),
      supabase.from('joias').select('*').eq('oculta', false).order('nome'),
      supabase.rpc('joias_comprometidas', { p_excluir: null })])   // unidades já usadas em agendamentos abertos
    setErroCarga(e.error?.message || j.error?.message || ''); setLista(e.data || []); setJoias(j.data || [])
    setComp(Object.fromEntries((c.data || []).map(r => [r.joia_id, r.qtd])))
  }
  useEffect(() => { carregar() }, [])
  const pendentes = lista.filter(e => e.status === 'pendente'), chegaram = lista.filter(e => e.status === 'chegou')

  // ---------- formulário (criar / editar): várias joias por pedido ----------
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setItem = (k, patch) => setForm(f => ({ ...f, itens: f.itens.map((r, i) => i === k ? { ...r, ...patch } : r) }))
  const setJoiaItem = (k, campo, v) => setForm(f => ({ ...f, itens: f.itens.map((r, i) => i !== k ? r
    : { ...r, joia: { ...r.joia, [campo]: v }, ...(campo === 'valor_venda' && !r.manual ? { valor: v } : {}) }) }))
  const escolher = (k, id) => { const j = joias.find(x => x.id === id); setForm(f => ({ ...f, itens: f.itens.map((r, i) => i !== k ? r
    : { ...r, joia_id: id, ...(j && !r.manual ? { valor: String(j.valor_venda) } : {}) }) })) }
  const addItem = () => setForm(f => ({ ...f, itens: [...f.itens, itemNovo()] }))
  const delItem = k => {
    const r = form.itens[k]
    if (r.id && form.status === 'chegou' && !confirm('Retirar esta joia do pedido? Ao salvar, ela volta para o estoque principal.')) return
    setForm(f => ({ ...f, itens: f.itens.filter((_, i) => i !== k) }))
  }

  // disponível = estoque principal − unidades já comprometidas em agendamentos abertos
  const comDisp = j => ({ ...j, comprometidas: comp[j.id] || 0, disponivel: Math.max(0, j.quantidade - (comp[j.id] || 0)) })
  const opcoes = joias.map(comDisp)
  // para cada linha NOVA com joia já cadastrada: vai ser reservada agora (há unidade livre) ou ficará pendente?
  const usado = {}
  const previa = !form ? [] : form.itens.map(r => {
    if (r.id || r.modo !== 'existente' || !r.joia_id) return null
    const j = opcoes.find(x => x.id === r.joia_id); if (!j) return null
    usado[j.id] = (usado[j.id] || 0) + 1
    return { j, vai: usado[j.id] <= j.disponivel }
  })
  const nReservar = previa.filter(p => p?.vai).length
  const total = form ? form.itens.reduce((s, r) => s + Number(r.valor || 0), 0) : 0, sinal = form ? somaLinhas(form.pag) : 0
  const podeAdicionar = form && !(form.id && form.status === 'chegou')

  const abrirEditar = async e => {
    setErro('')
    const { data } = await supabase.from('pagamentos').select('*').eq('encomenda_id', e.id).eq('fase', 'sinal').order('created_at')
    const pag = (data || []).map(p => ({ valor: String(p.valor), tipo: p.tipo, parcelas: p.parcelas, auto: false }))
    setForm({ ...novo(), id: e.id, status: e.status, cliente_nome: e.cliente_nome, telefone: e.telefone || '',
      itens: itensDe(e).map(i => ({ ...itemNovo(), id: i.id, joia_id: i.joia_id, valor: String(i.valor), manual: true, txt: descJoia(i.joias) })),
      data_encomenda: e.data_encomenda, observacoes: e.observacoes || '', pag, pagOriginal: paraRpc(pag) })
  }

  const salvar = async ev => {
    ev.preventDefault(); setErro('')
    if (!form.itens.length) return setErro('Inclua ao menos uma joia no pedido.')
    for (const r of form.itens) {
      if (r.id) continue
      if (r.modo === 'existente' && !r.joia_id) return setErro('Selecione a joia em todas as linhas (ou remova a linha vazia).')
      if (r.modo === 'nova' && !r.joia.nome.trim()) return setErro('Informe o nome de todas as joias novas.')
    }
    if (sinal > total + 0.001) return setErro('O sinal não pode ser maior que o valor total.')
    if (!linhasValidas(form.pag, formas)) return setErro('Há uma forma de pagamento desativada ou sem taxa cadastrada.')
    const pag = paraRpc(form.pag)
    const itens = form.itens.map(r => r.id ? { id: r.id, valor: Number(r.valor || 0) }
      : r.modo === 'nova' ? { joia_nova: (({ quantidade, ...nova }) => nova)(r.joia), valor: Number(r.valor || 0) }
      : { joia_id: r.joia_id, valor: Number(r.valor || 0) })
    const dados = { p_cliente: form.cliente_nome.trim(), p_telefone: form.telefone || null, p_data: form.data_encomenda, p_obs: form.observacoes || null, p_itens: itens }
    setBusy(true)
    const r = !form.id ? await supabase.rpc('criar_encomenda', { ...dados, p_pagamentos: pag })
      : await supabase.rpc('editar_encomenda', { ...dados, p_id: form.id, p_pagamentos: JSON.stringify(pag) !== JSON.stringify(form.pagOriginal) ? pag : null })   // sem mudança nos pagamentos, as taxas originais são mantidas
    setBusy(false)
    if (r.error) return setErro(r.error.message)
    const novas = form.itens.filter(x => !x.id).length
    if (nReservar > 0) {
      setMsg(nReservar === novas
        ? `${nReservar === 1 ? 'A joia estava' : `As ${nReservar} joias estavam`} em estoque e ${nReservar === 1 ? 'foi reservada' : 'foram reservadas'} para ${form.cliente_nome.trim()}: já ${nReservar === 1 ? 'está' : 'estão'} em “Joias que já chegaram”.`
        : `${nReservar} de ${novas} joias estavam em estoque e foram reservadas (já em “Joias que já chegaram”). As outras ${novas - nReservar} ficaram em “pendentes”.`)
      setTimeout(() => setMsg(''), 9000)
    }
    setForm(null); carregar()
  }

  // ---------- chegada (total ou parcial) ----------
  const confirmarChegada = async (e, ids) => {
    setBusy(true)
    const { error } = await supabase.rpc('chegou_encomenda', { p_id: e.id, p_itens: ids })
    setBusy(false)
    if (error) return alert(error.message)
    setChegando(null); carregar()
  }
  const abrirChegada = e => { if (itensDe(e).length <= 1) return confirmarChegada(e, null); setMarcadas(new Set()); setChegando(e) }
  const itensCheg = chegando ? itensDe(chegando) : []
  const todas = itensCheg.length > 0 && marcadas.size === itensCheg.length
  const alterna = id => setMarcadas(m => { const n = new Set(m); n.has(id) ? n.delete(id) : n.add(id); return n })
  const prontoDoCliente = chegando && chegaram.find(o => mesmoCliente(o, chegando))

  // ---------- cancelamento (pedido inteiro) ----------
  const abrirCancelar = e => { setDestino(Number(e.sinal) > 0 ? null : 'nenhum'); setCanc(e); setErro('') }
  const cancelar = async () => {
    setBusy(true)
    const { error } = await supabase.rpc('cancelar_encomenda', { p_id: canc.id, p_reter: destino === 'reter' ? true : destino === 'devolver' ? false : null })
    setBusy(false)
    if (error) return setErro(error.message)
    setCanc(null); carregar()
  }

  const Cartao = ({ e, chegada }) => { const its = itensDe(e); return (
    <div className="enc-card">
      <div className="enc-thumb"><Thumb j={its[0]?.joias} />{its.length > 1 && <span className="enc-mais">+{its.length - 1}</span>}</div>
      <div className="enc-info">
        <strong>{e.cliente_nome}</strong>
        {chegada && e.telefone
          ? <a className="zap-link" href={zap(e.telefone, mensagemEncomenda(e))} target="_blank" rel="noreferrer" title="Abrir o WhatsApp do cliente com a mensagem pronta"><MessageCircle size={15} />{e.telefone}</a>
          : <small className="muted">{e.telefone || 'sem telefone'}</small>}
        <ul className="enc-joias">{its.map(i => <li key={i.id}><span>{descJoia(i.joias)}</span><b>{brl(i.valor)}</b></li>)}</ul>
        <small className="muted">Encomendada em {dataBr(e.data_encomenda)}{chegada && <> · chegou em {dataBr(e.data_chegada)}</>}</small>
        {e.observacoes && <small className="muted">{e.observacoes}</small>}
      </div>
      <div className="enc-vals">
        <div><span>Total</span><b>{brl(e.valor_total)}</b></div>
        <div><span>Sinal pago</span><b className="money">{brl(e.sinal)}</b></div>
        <div><span>Restante</span><b>{brl(Number(e.valor_total) - Number(e.sinal))}</b></div>
      </div>
      <div className="enc-acoes">
        <span className={'badge ' + (chegada ? 'ok' : '')} style={chegada ? null : { '--c': '#e0b04a' }}>{chegada ? <><Check size={13} />Pronta · reservada</> : <><Clock size={13} />Aguardando chegada</>}</span>
        {!chegada && <div className="enc-botoes">
          <button className="btn primary" onClick={() => abrirChegada(e)} disabled={busy}><Check size={16} />{its.length > 1 ? 'Joias chegaram' : 'Joia chegou'}</button>
          <button className="btn ghost" onClick={() => abrirEditar(e)}><Pencil size={16} />Editar</button>
          <button className="btn ghost danger" onClick={() => abrirCancelar(e)}><Ban size={16} />Cancelar</button>
        </div>}
        {chegada && <div className="enc-botoes">
          <button className="btn primary" onClick={() => nav('agenda', { encomenda: e })}><CalendarDays size={16} />Agendar</button>
          <button className="btn primary" onClick={() => nav('vendas', { encomenda: e })}><ShoppingBag size={16} />Vender</button>
          <button className="btn ghost" onClick={() => abrirEditar(e)}><Pencil size={16} />Editar</button>
          <button className="btn ghost danger" onClick={() => abrirCancelar(e)}><Ban size={16} />Cancelar encomenda</button>
        </div>}
      </div>
    </div>) }

  return (
    <section>
      <div className="row between wrap"><h2>Encomendas de joias</h2>
        <button className="btn primary" onClick={() => { setErro(''); setForm(novo()) }}><Plus size={18} />Nova encomenda</button></div>
      <p className="muted dica">Um pedido pode ter várias joias. As que têm unidade livre em estoque são reservadas na hora e descem para “Joias que já chegaram”; as outras ficam em “pendentes”. Quando o restante chega, ele se junta ao pedido pronto do mesmo cliente (mesmo nome e telefone).</p>
      {msg && <p className="ok-msg"><Check size={16} />{msg}</p>}
      {erroCarga && <p className="erro">Não foi possível carregar: {erroCarga}</p>}

      <div className="card enc-bloco">
        <h3><Clock size={18} /> Encomendas pendentes <span className="contador">{pendentes.length}</span></h3>
        {pendentes.length === 0 && <p className="muted">Nenhuma encomenda aguardando chegada.</p>}
        <div className="enc-lista">{pendentes.map(e => <Cartao key={e.id} e={e} />)}</div>
      </div>

      <div className="card enc-bloco">
        <h3><Package size={18} /> Joias que já chegaram <span className="contador">{chegaram.length}</span></h3>
        {chegaram.length === 0 && <p className="muted">Nenhuma joia reservada no momento.</p>}
        <div className="enc-lista">{chegaram.map(e => <Cartao key={e.id} e={e} chegada />)}</div>
      </div>

      {form && <Modal wide title={form.id ? 'Editar encomenda' : 'Nova encomenda'} onClose={() => setForm(null)}>
        <form onSubmit={salvar} className="grid2">
          <label>Cliente<input required value={form.cliente_nome} onChange={e => set('cliente_nome', e.target.value)} /></label>
          <label>WhatsApp<input inputMode="tel" value={form.telefone} onChange={e => set('telefone', e.target.value)} placeholder="(47) 99999-9999" /></label>

          <div className="full itens">
            <div className="itens-head"><strong>Joias do pedido</strong>
              <small className="muted">{form.id && form.status === 'chegou' ? 'Este pedido já chegou: dá para ajustar valores ou retirar uma joia, mas não acrescentar.' : 'Cada joia tem o seu valor. As que têm estoque livre são reservadas na hora.'}</small></div>

            {form.itens.map((r, k) => (
              <div className="enc-item-form" key={r.k}>
                <div className="enc-item-head"><strong>Joia {k + 1}</strong>
                  {form.itens.length > 1 && <button type="button" className="icon-btn danger" aria-label={`Remover joia ${k + 1}`} onClick={() => delItem(k)}><Trash2 size={17} /></button>}</div>

                {r.id ? <p className="det-line">{r.txt}</p> : <>
                  <div className="seg">
                    <button type="button" className={r.modo === 'existente' ? 'on' : ''} onClick={() => setItem(k, { modo: 'existente' })}>Já cadastrada</button>
                    <button type="button" className={r.modo === 'nova' ? 'on' : ''} onClick={() => setItem(k, { modo: 'nova' })}>Cadastrar nova</button></div>
                  {r.modo === 'existente' ? <>
                    <div className="campo-busca"><span className="rotulo">Joia (clique para ver a lista ou digite para buscar)</span>
                      <JoiaBusca joias={opcoes} valor={r.joia_id} onChange={id => escolher(k, id)} /></div>
                    {previa[k] && (previa[k].vai
                      ? <p className="hint aviso"><Package size={14} /> Há unidade disponível em estoque ({previa[k].j.disponivel}). Ao salvar, 1 unidade é reservada e sai do estoque principal; esta joia vai direto para “Joias que já chegaram”.</p>
                      : <p className="hint"><Clock size={14} /> {previa[k].j.quantidade > 0
                        ? 'As unidades em estoque já estão comprometidas em agendamentos'
                        : 'Sem estoque no momento'}: esta joia fica em “pendentes” até chegar.</p>)}</>
                    : <div className="grid2"><JoiaCampos form={r.joia} set={(c, v) => setJoiaItem(k, c, v)} quantidade={false} />
                        <small className="muted full">Joia nova: fica reservada para este pedido e só entra no estoque principal se o pedido for cancelado depois que ela chegar.</small></div>}
                </>}

                <label>Valor desta joia (R$)<input required type="number" inputMode="decimal" step="0.01" min="0" value={r.valor} onChange={e => setItem(k, { valor: e.target.value, manual: true })} /></label>
              </div>))}

            {podeAdicionar && <button type="button" className="btn ghost" onClick={addItem}><Plus size={16} />Adicionar joia ao pedido</button>}
            {nReservar > 0 && form.itens.filter(r => !r.id).length > nReservar && <p className="hint aviso"><Package size={14} /> {nReservar} joia{nReservar > 1 ? 's' : ''} será{nReservar > 1 ? 'ão' : ''} reservada{nReservar > 1 ? 's' : ''} agora e o restante fica pendente. O pedido se divide e depois se junta de novo quando o restante chegar.</p>}
          </div>

          <label>Data da encomenda<input type="date" required value={form.data_encomenda} onChange={e => set('data_encomenda', e.target.value)} /></label>
          <span />

          <div className="full itens">
            <div className="itens-head"><strong>Sinal</strong><small className="muted">Pode ser dividido em várias formas de pagamento. Se o pedido for dividido, o sinal acompanha o valor de cada parte.</small></div>
            <PagamentoLinhas formas={formas} linhas={form.pag} onChange={l => set('pag', l)} inicial={!form.id} />
            <div className="vals">
              <div><span>Valor total</span><b>{brl(total)}</b></div>
              <div><span>Sinal</span><b className="money">{brl(sinal)}</b></div>
              <div><span>Restante</span><b>{brl(Math.max(0, total - sinal))}</b></div>
            </div>
          </div>

          <label className="full">Observações<textarea rows="2" value={form.observacoes} onChange={e => set('observacoes', e.target.value)} /></label>
          {erro && <p className="erro full">{erro}</p>}
          <div className="row end full"><button type="button" className="btn ghost" onClick={() => setForm(null)}>Voltar</button><button className="btn primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button></div>
        </form></Modal>}

      {chegando && <Modal title="Quais joias chegaram?" onClose={() => setChegando(null)}>
        <div className="det">
          <p>Pedido de <b>{chegando.cliente_nome}</b>. Marque o que já chegou: essas joias descem para “Joias que já chegaram”; as demais continuam em pendentes.</p>
          <label className={'opcao' + (todas ? ' on' : '')}><input type="checkbox" checked={todas} onChange={() => setMarcadas(todas ? new Set() : new Set(itensCheg.map(i => i.id)))} />
            <span><b>Selecionar todas</b><small>Todas chegaram: o pedido desce inteiro.</small></span></label>
          <div className="opcoes">{itensCheg.map(i => (
            <label className={'opcao' + (marcadas.has(i.id) ? ' on' : '')} key={i.id}>
              <input type="checkbox" checked={marcadas.has(i.id)} onChange={() => alterna(i.id)} />
              <span><b>{i.joias?.nome}</b><small>{descJoia(i.joias).replace(i.joias?.nome + ' · ', '')} · {brl(i.valor)}</small></span></label>))}</div>
          {marcadas.size > 0 && !todas && <p className="hint">As {itensCheg.length - marcadas.size} joia{itensCheg.length - marcadas.size > 1 ? 's' : ''} não marcada{itensCheg.length - marcadas.size > 1 ? 's' : ''} continua{itensCheg.length - marcadas.size > 1 ? 'm' : ''} em pendentes, com o valor e a parte do sinal correspondentes.</p>}
          {marcadas.size > 0 && prontoDoCliente && <p className="hint aviso"><Package size={14} /> {chegando.cliente_nome} já tem um pedido pronto: as joias que chegaram vão se juntar a ele.</p>}
          <div className="row end"><button className="btn ghost" onClick={() => setChegando(null)}>Voltar</button>
            <button className="btn primary" disabled={busy || marcadas.size === 0} onClick={() => confirmarChegada(chegando, todas ? null : [...marcadas])}><Check size={16} />{busy ? 'Confirmando…' : 'Confirmar chegada'}</button></div>
        </div></Modal>}

      {canc && <Modal title="Cancelar encomenda" onClose={() => setCanc(null)}>
        <div className="det">
          <p>Cancelar o pedido inteiro de <b>{canc.cliente_nome}</b> ({itensDe(canc).map(i => i.joias?.nome).join(', ')})? {canc.status === 'chegou'
            ? 'As joias saem do estoque reservado e voltam para o estoque principal, com o mesmo cadastro.' : 'As joias ainda não chegaram, então o estoque não muda.'} O registro será apagado e <b>não dá para desfazer</b>.{itensDe(canc).length > 1 && ' Para desistir de apenas uma joia, use Editar e remova a linha.'}</p>
          {Number(canc.sinal) > 0 && <div className="opcoes">
            <p className="hint">O sinal de <b className="money">{brl(canc.sinal)}</b> deve ser:</p>
            <label className={'opcao' + (destino === 'reter' ? ' on' : '')}><input type="radio" name="destino" checked={destino === 'reter'} onChange={() => setDestino('reter')} />
              <span><b>Retido pelo estúdio</b><small>Entra nos relatórios como receita de sinal retido.</small></span></label>
            <label className={'opcao' + (destino === 'devolver' ? ' on' : '')}><input type="radio" name="destino" checked={destino === 'devolver'} onChange={() => setDestino('devolver')} />
              <span><b>Devolvido ao cliente</b><small>Fica registrado como saída (não entra nos totais de receita).</small></span></label>
          </div>}
          {erro && <p className="hint erro">{erro}</p>}
          <div className="row end"><button className="btn ghost" onClick={() => setCanc(null)}>Voltar</button>
            <button className="btn primary" disabled={busy || !destino} onClick={cancelar}><Ban size={16} />{busy ? 'Cancelando…' : 'Confirmar cancelamento'}</button></div>
        </div></Modal>}
    </section>)
}
