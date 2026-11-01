import { useEffect, useState } from 'react'
import { Plus, Pencil, Ban, Check, MessageCircle, CalendarDays, ShoppingBag, Package, Clock, Image as Img } from 'lucide-react'
import { supabase, brl, zap, mensagemEncomenda } from '../lib/supabase'
import { PagamentoLinhas, useFormas, somaLinhas, paraRpc, linhasValidas } from '../lib/pagamentos'
import { JoiaCampos, joiaVazia } from './JoiaForm'
import JoiaBusca from './JoiaBusca'
import Modal from './Modal'

const hoje = () => new Date().toLocaleDateString('sv')
const dataBr = d => d ? new Date(d.length === 10 ? d + 'T12:00' : d).toLocaleDateString('pt-BR') : '–'
const descJoia = j => j ? [j.nome, j.tipo, j.tamanho, j.material, j.local].filter(Boolean).join(' · ') : '–'
const novo = () => ({ id: null, status: 'pendente', cliente_nome: '', telefone: '', modo: 'existente', joia_id: '', joia_original: null, joia: { ...joiaVazia }, totalManual: false,
  valor_total: '', data_encomenda: hoje(), observacoes: '', pag: [], pagOriginal: null })

const Thumb = ({ j, s = 56 }) => j?.imagem_url ? <img src={j.imagem_url} alt={j.nome} className="thumb" style={{ width: s, height: s }} /> : <span className="thumb" style={{ width: s, height: s }}><Img size={18} /></span>

export default function Encomendas({ nav }) {
  const formas = useFormas()
  const [lista, setLista] = useState([]), [joias, setJoias] = useState([]), [erroCarga, setErroCarga] = useState('')
  const [form, setForm] = useState(null), [erro, setErro] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState('')
  const [canc, setCanc] = useState(null), [destino, setDestino] = useState(null)

  const carregar = async () => {
    const [e, j] = await Promise.all([
      supabase.from('encomendas').select('*, joias(*)').neq('status', 'agendada').order('data_encomenda').order('created_at'),
      supabase.from('joias').select('*').eq('oculta', false).order('nome')])
    setErroCarga(e.error?.message || j.error?.message || ''); setLista(e.data || []); setJoias(j.data || [])
  }
  useEffect(() => { carregar() }, [])
  const pendentes = lista.filter(e => e.status === 'pendente'), chegaram = lista.filter(e => e.status === 'chegou')

  // ---------- formulário (criar / editar) ----------
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setJoia = (k, v) => setForm(f => ({ ...f, joia: { ...f.joia, [k]: v }, ...(k === 'valor_venda' && !f.totalManual ? { valor_total: v } : {}) }))
  const escolher = id => { const j = joias.find(x => x.id === id); setForm(f => ({ ...f, joia_id: id, ...(j && !f.totalManual ? { valor_total: String(j.valor_venda) } : {}) })) }
  const atual = form?.id ? lista.find(e => e.id === form.id)?.joias : null   // a joia da própria encomenda pode ser exclusiva (oculta)
  const opcoes = atual && !joias.some(j => j.id === atual.id) ? [atual, ...joias] : joias
  const jSel = form?.modo === 'existente' ? opcoes.find(j => j.id === form.joia_id) : null
  // joia que já está em estoque: é reservada na hora (sai do estoque principal) e vai direto para "Joias que já chegaram"
  const vaiReservar = !!jSel && jSel.quantidade > 0 && (!form.id || (form.status === 'pendente' && form.joia_id !== form.joia_original))
  const total = Number(form?.valor_total || 0), sinal = form ? somaLinhas(form.pag) : 0

  const abrirEditar = async e => {
    setErro('')
    const { data } = await supabase.from('pagamentos').select('*').eq('encomenda_id', e.id).eq('fase', 'sinal').order('created_at')
    const pag = (data || []).map(p => ({ valor: String(p.valor), tipo: p.tipo, parcelas: p.parcelas, auto: false }))
    setForm({ ...novo(), id: e.id, status: e.status, cliente_nome: e.cliente_nome, telefone: e.telefone || '', joia_id: e.joia_id, joia_original: e.joia_id, totalManual: true,
      valor_total: String(e.valor_total), data_encomenda: e.data_encomenda, observacoes: e.observacoes || '', pag, pagOriginal: paraRpc(pag) })
  }

  const salvar = async ev => {
    ev.preventDefault(); setErro('')
    if (sinal > total + 0.001) return setErro('O sinal não pode ser maior que o valor total.')
    if (!linhasValidas(form.pag, formas)) return setErro('Há uma forma de pagamento desativada ou sem taxa cadastrada.')
    const pag = paraRpc(form.pag), dados = { p_cliente: form.cliente_nome.trim(), p_telefone: form.telefone || null, p_valor_total: total, p_data: form.data_encomenda, p_obs: form.observacoes || null }
    setBusy(true); let r
    if (!form.id) {
      if (form.modo === 'existente' && !form.joia_id) { setBusy(false); return setErro('Selecione a joia.') }
      if (form.modo === 'nova' && !form.joia.nome.trim()) { setBusy(false); return setErro('Informe o nome da joia.') }
      const { quantidade, ...nova } = form.joia
      r = await supabase.rpc('criar_encomenda', { ...dados, p_joia_id: form.modo === 'existente' ? form.joia_id : null, p_joia_nova: form.modo === 'nova' ? nova : null, p_pagamentos: pag })
    } else {
      if (form.status === 'pendente' && !form.joia_id) { setBusy(false); return setErro('Selecione a joia.') }
      const mudou = JSON.stringify(pag) !== JSON.stringify(form.pagOriginal)   // sem mudança nos pagamentos, as taxas originais são mantidas
      r = await supabase.rpc('editar_encomenda', { ...dados, p_id: form.id, p_joia_id: form.status === 'pendente' ? form.joia_id : null, p_pagamentos: mudou ? pag : null })
    }
    setBusy(false)
    if (r.error) return setErro(r.error.message)
    if (vaiReservar) { setMsg(`“${jSel.nome}” estava em estoque: 1 unidade foi reservada para ${form.cliente_nome.trim()} e já está em “Joias que já chegaram”.`); setTimeout(() => setMsg(''), 8000) }
    setForm(null); carregar()
  }

  // ---------- ações ----------
  const chegou = async e => {
    const { error } = await supabase.rpc('chegou_encomenda', { p_id: e.id })
    if (error) return alert(error.message)
    carregar()
  }
  const abrirCancelar = e => { setDestino(Number(e.sinal) > 0 ? null : 'nenhum'); setCanc(e); setErro('') }
  const cancelar = async () => {
    setBusy(true)
    const { error } = await supabase.rpc('cancelar_encomenda', { p_id: canc.id, p_reter: destino === 'reter' ? true : destino === 'devolver' ? false : null })
    setBusy(false)
    if (error) return setErro(error.message)
    setCanc(null); carregar()
  }

  const Cartao = ({ e, chegada }) => (
    <div className="enc-card">
      <Thumb j={e.joias} />
      <div className="enc-info">
        <strong>{e.cliente_nome}</strong>
        {chegada && e.telefone
          ? <a className="zap-link" href={zap(e.telefone, mensagemEncomenda(e))} target="_blank" rel="noreferrer" title="Abrir o WhatsApp do cliente com a mensagem pronta"><MessageCircle size={15} />{e.telefone}</a>
          : <small className="muted">{e.telefone || 'sem telefone'}</small>}
        <span>{descJoia(e.joias)}</span>
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
          <button className="btn primary" onClick={() => chegou(e)}><Check size={16} />Joia chegou</button>
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
    </div>)

  return (
    <section>
      <div className="row between wrap"><h2>Encomendas de joias</h2>
        <button className="btn primary" onClick={() => { setErro(''); setForm(novo()) }}><Plus size={18} />Nova encomenda</button></div>
      <p className="muted dica">Joias sem estoque ficam em “pendentes” até chegar. Joias que já estão em estoque são reservadas na hora: saem do estoque principal e vão direto para “Joias que já chegaram”. Ao vender, agendar e concluir ou cancelar, o registro sai da lista.</p>
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
            <div className="itens-head"><strong>Joia</strong>{form.id && form.status === 'chegou' && <small className="muted">A joia já está reservada e não pode ser trocada.</small>}</div>
            {!form.id && <div className="seg">
              <button type="button" className={form.modo === 'existente' ? 'on' : ''} onClick={() => set('modo', 'existente')}>Já cadastrada</button>
              <button type="button" className={form.modo === 'nova' ? 'on' : ''} onClick={() => set('modo', 'nova')}>Cadastrar nova</button></div>}
            {form.modo === 'existente' && !(form.id && form.status === 'chegou') && <>
              <div className="campo-busca"><span className="rotulo">Joia (clique para ver a lista ou digite para buscar)</span>
                <JoiaBusca joias={opcoes} valor={form.joia_id} onChange={escolher} /></div>
              {vaiReservar
                ? <p className="hint aviso"><Package size={14} /> Esta joia está em estoque ({jSel.quantidade}). Ao salvar, 1 unidade é reservada para o cliente e sai do estoque principal; a encomenda vai direto para “Joias que já chegaram”.</p>
                : jSel && jSel.quantidade <= 0 ? <p className="hint"><Clock size={14} /> Sem estoque no momento: a encomenda fica em “pendentes” até a joia chegar.</p> : null}</>}
            {form.modo === 'existente' && form.id && form.status === 'chegou' && <p className="det-line">{descJoia(opcoes.find(j => j.id === form.joia_id))}</p>}
            {form.modo === 'nova' && <div className="grid2"><JoiaCampos form={form.joia} set={setJoia} quantidade={false} />
              <small className="muted full">Esta joia fica reservada para a encomenda e só entra no estoque convencional se a encomenda for cancelada depois que ela chegar.</small></div>}
          </div>

          <label>Valor total (R$)<input required type="number" inputMode="decimal" step="0.01" min="0" value={form.valor_total} onChange={e => setForm(f => ({ ...f, valor_total: e.target.value, totalManual: true }))} /></label>
          <label>Data da encomenda<input type="date" required value={form.data_encomenda} onChange={e => set('data_encomenda', e.target.value)} /></label>

          <div className="full itens">
            <div className="itens-head"><strong>Sinal</strong><small className="muted">Pode ser dividido em várias formas de pagamento</small></div>
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

      {canc && <Modal title="Cancelar encomenda" onClose={() => setCanc(null)}>
        <div className="det">
          <p>Cancelar a encomenda de <b>{canc.cliente_nome}</b> ({descJoia(canc.joias)})? {canc.status === 'chegou'
            ? 'A joia sai do estoque reservado e volta para o estoque principal, com o mesmo cadastro.' : 'A joia ainda não chegou, então o estoque não muda.'} O registro da encomenda será apagado e <b>não dá para desfazer</b>.</p>
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
