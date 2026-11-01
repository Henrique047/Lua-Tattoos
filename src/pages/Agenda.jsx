import { useEffect, useMemo, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGrid from '@fullcalendar/daygrid'
import timeGrid from '@fullcalendar/timegrid'
import list from '@fullcalendar/list'
import interaction from '@fullcalendar/interaction'
import ptBr from '@fullcalendar/core/locales/pt-br'
import { Plus, MessageCircle, Check, Ban, Pencil, Clock, Gem, Sparkles, Trash2, Package } from 'lucide-react'
import { supabase, brl, toLocalInput, zap, mensagemWhats } from '../lib/supabase'
import { r2, calcular } from '../lib/calc'
import { PagamentoLinhas, useFormas, somaLinhas, paraRpc, linhasValidas } from '../lib/pagamentos'
import useMobile from '../lib/useMobile'
import Modal from './Modal'

const COR = { tatuagem: '#c9708f', piercing: '#8d7bc4' }
const NOME = { tatuagem: 'Tatuagem', piercing: 'Piercing' }
const hojeStr = () => new Date().toLocaleDateString('sv') // data LOCAL (AAAA-MM-DD), não UTC
const maisUmaHora = local => toLocalInput(new Date(new Date(local).getTime() + 36e5).toISOString())
const itemVazio = () => ({ joia_id: '', procedimento_id: '' })
const vazio = (inicio = hojeStr() + 'T10:00') => ({
  servico: 'piercing', cliente_nome: '', telefone: '', inicio, fim: maisUmaHora(inicio),
  valor_total: 0, desconto: 0, custo_tatuagem: '', pagSinal: [], encomenda: null, observacoes: '', itens: [itemVazio()]
})
const txtJoia = j => [j?.nome, j?.tamanho, j?.material].filter(Boolean).join(' ')
// resumo curto dos itens para a lista do dia
const resumo = a => {
  const t = (a.agendamento_itens || []).map(i => [i.joias && txtJoia(i.joias), i.procedimentos?.nome].filter(Boolean).join(' + ')).filter(Boolean)
  return t.length > 2 ? `${t.slice(0, 2).join(' · ')} · +${t.length - 2}` : t.join(' · ')
}
const falta = a => Math.max(0, r2(Number(a.valor_total || 0) - Number(a.desconto || 0) - Number(a.sinal || 0)))

export default function Agenda({ ctx }) {
  const mobile = useMobile(), formas = useFormas()
  const [lista, setLista] = useState([]), [joias, setJoias] = useState([]), [procs, setProcs] = useState([]), [dia, setDia] = useState(hojeStr())
  const [form, setForm] = useState(null), [sel, setSel] = useState(null), [erro, setErro] = useState(''), [erroCarga, setErroCarga] = useState('')
  const [pago, setPago] = useState(''), [linhasConc, setLinhasConc] = useState([]), [busy, setBusy] = useState(false)

  const carregar = async () => {
    const [a, j, p] = await Promise.all([
      supabase.from('agendamentos').select('*, encomendas(id,joia_id,valor_total,sinal), agendamento_itens(id, joia_id, procedimento_id, joias(nome,tamanho,material), procedimentos(nome))')
        .neq('status', 'cancelado').order('inicio').order('created_at', { referencedTable: 'agendamento_itens' }),
      supabase.from('joias').select('*').order('nome'),
      supabase.from('procedimentos').select('*').order('nome')])
    setErroCarga(a.error?.message || j.error?.message || p.error?.message || '')
    setLista(a.data || []); setJoias(j.data || []); setProcs(p.data || [])
  }
  useEffect(() => { carregar() }, [])

  // vindo da tela de Encomendas ("Agendar"): o formulário abre com cliente, joia, total e sinal já preenchidos
  useEffect(() => {
    const e = ctx?.encomenda; if (!e) return
    setForm({ ...vazio(), cliente_nome: e.cliente_nome, telefone: e.telefone || '', valor_total: Number(e.valor_total),
      encomenda: { id: e.id, joia_id: e.joia_id, valor_total: Number(e.valor_total), sinal: Number(e.sinal) }, itens: [{ joia_id: e.joia_id, procedimento_id: '' }] })
  }, [])

  // ao abrir um agendamento, o valor recebido já vem preenchido com o que falta
  useEffect(() => { if (sel) { setPago(String(falta(sel))); setLinhasConc([]) } }, [sel?.id])

  const eventos = useMemo(() => lista.map(a => ({
    id: a.id, title: a.cliente_nome, start: a.inicio, end: a.fim,
    backgroundColor: COR[a.servico], borderColor: COR[a.servico], classNames: a.status === 'concluido' ? ['feito'] : []
  })), [lista])
  const doDia = lista.filter(a => new Date(a.inicio).toLocaleDateString('sv') === dia)
  const hora = i => new Date(i).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const dataCurta = i => new Date(i).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })

  // ---------- criar / editar ----------
  const abrirNovo = inicio => { setErro(''); setSel(null); setForm(vazio(inicio)) }
  const clicouDia = i => {
    const d = i.dateStr.slice(0, 10); setDia(d)
    // na visão de semana o clique traz o horário; no mês usamos 10:00
    abrirNovo(`${d}T${i.dateStr.length > 10 ? i.dateStr.slice(11, 16) : '10:00'}`)
  }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const mudarInicio = v => setForm(f => {
    const dur = new Date(f.fim) - new Date(f.inicio)       // mantém a duração ao mudar o início
    return { ...f, inicio: v, fim: v && dur > 0 ? toLocalInput(new Date(new Date(v).getTime() + dur).toISOString()) : f.fim }
  })

  // itens (joia + procedimento): o valor total é a soma dos preços e continua editável.
  // A joia de uma encomenda vale o preço combinado na encomenda, não o do catálogo.
  const resolver = it => {
    const joia = joias.find(x => x.id === it.joia_id)
    const enc = form?.encomenda
    return { joia: joia && enc && joia.id === enc.joia_id ? { ...joia, valor_venda: enc.valor_total } : joia, proc: procs.find(x => x.id === it.procedimento_id) }
  }
  const somaItens = itens => itens.reduce((s, it) => { const { joia, proc } = resolver(it); return { j: s.j + Number(joia?.valor_venda || 0), p: s.p + Number(proc?.valor || 0) } }, { j: 0, p: 0 })
  const mudarItens = itens => setForm(f => { const s = somaItens(itens); return { ...f, itens, valor_total: r2(s.j + s.p) } })
  const setItem = (k, campo, v) => mudarItens(form.itens.map((it, i) => i === k ? { ...it, [campo]: v } : it))
  const addItem = () => setForm(f => ({ ...f, itens: [...f.itens, itemVazio()] }))
  const delItem = k => mudarItens(form.itens.filter((_, i) => i !== k))
  const previa = () => {
    const usados = form.itens.filter(i => i.joia_id || i.procedimento_id), s = somaItens(usados)
    return { ...s, comissao: calcular(usados.map(resolver)).comissao }
  }
  const sinalForm = form ? (form.encomenda ? Number(form.encomenda.sinal) : somaLinhas(form.pagSinal)) : 0
  const faltaForm = form ? falta({ valor_total: form.valor_total, desconto: form.desconto, sinal: sinalForm }) : 0
  const cobrarForm = form ? Math.max(0, Number(form.valor_total || 0) - Number(form.desconto || 0)) : 0
  const custoForm = form ? (Number(form.custo_tatuagem || 0) || 0) : 0

  const salvar = async e => {
    e.preventDefault(); setErro('')
    if (new Date(form.fim) <= new Date(form.inicio)) return setErro('O horário final precisa ser depois do início.')
    const custo = form.servico === 'tatuagem' ? Number(form.custo_tatuagem || 0) : 0
    if (Number.isNaN(custo) || custo < 0) return setErro('O custo precisa ser um valor igual ou maior que zero.')
    if (sinalForm > Number(form.valor_total || 0) - Number(form.desconto || 0) + 0.001) return setErro('O sinal não pode ser maior que o valor a cobrar.')
    if (!form.encomenda && !linhasValidas(form.pagSinal, formas)) return setErro('Há uma forma de pagamento do sinal desativada ou sem taxa cadastrada.')
    const dados = {
      servico: form.servico, cliente_nome: form.cliente_nome, telefone: form.telefone || null, observacoes: form.observacoes || null,
      valor_total: Number(form.valor_total || 0), desconto: Number(form.desconto || 0), custo_tatuagem: custo,
      inicio: new Date(form.inicio).toISOString(), fim: new Date(form.fim).toISOString()
    }
    const itens = form.servico === 'piercing' ? form.itens.filter(i => i.joia_id || i.procedimento_id) : []
    setBusy(true)
    const { error } = await supabase.rpc('salvar_agendamento', {
      p_id: form.id || null, p_dados: dados, p_itens: itens,
      p_pagamentos: form.encomenda ? null : paraRpc(form.pagSinal), p_encomenda: !form.id && form.encomenda ? form.encomenda.id : null })
    setBusy(false)
    if (error) return setErro(error.code === '23P01' ? 'Já existe um agendamento deste serviço nesse horário.' : error.message)
    setForm(null); setSel(null); carregar()
  }

  const editar = async () => {
    setErro('')
    let pagSinal = []
    if (!sel.encomendas) {
      const { data } = await supabase.from('pagamentos').select('*').eq('agendamento_id', sel.id).eq('fase', 'sinal').order('created_at')
      pagSinal = (data || []).map(p => ({ valor: String(p.valor), tipo: p.tipo, parcelas: p.parcelas, auto: false }))
    }
    setForm({
      id: sel.id, servico: sel.servico, cliente_nome: sel.cliente_nome, telefone: sel.telefone || '',
      inicio: toLocalInput(sel.inicio), fim: toLocalInput(sel.fim), valor_total: sel.valor_total, desconto: sel.desconto, custo_tatuagem: Number(sel.custo_tatuagem) > 0 ? String(sel.custo_tatuagem) : '',
      pagSinal, encomenda: sel.encomendas ? { id: sel.encomendas.id, joia_id: sel.encomendas.joia_id, valor_total: Number(sel.encomendas.valor_total), sinal: Number(sel.encomendas.sinal) } : null,
      observacoes: sel.observacoes || '',
      itens: sel.agendamento_itens?.length ? sel.agendamento_itens.map(i => ({ joia_id: i.joia_id || '', procedimento_id: i.procedimento_id || '' })) : [itemVazio()]
    })
  }

  // ---------- concluir / cancelar ----------
  const faltaSel = sel ? falta(sel) : 0
  const pagoNum = pago === '' ? NaN : Number(pago)
  const pagoOk = !Number.isNaN(pagoNum) && pagoNum >= 0 && pagoNum <= faltaSel + 0.001
  const descExtra = pagoOk ? r2(faltaSel - pagoNum) : 0
  const pagamentoOk = pagoOk && (pagoNum === 0 || (Math.abs(somaLinhas(linhasConc) - pagoNum) <= 0.01 && linhasValidas(linhasConc, formas)))

  const concluir = async () => {
    setBusy(true)
    const { error } = await supabase.rpc('concluir_atendimento', { p_id: sel.id, p_valor_pago: pagoNum, p_pagamentos: paraRpc(linhasConc) })
    setBusy(false)
    if (error) return alert(error.message)
    setSel(null); carregar()
  }
  const cancelar = async () => {
    if (!confirm('Cancelar este agendamento?' + (sel.encomendas ? ' A joia encomendada volta para a lista de joias que já chegaram.' : ''))) return
    const { error } = await supabase.rpc('cancelar_agendamento', { p_id: sel.id })
    if (error) return alert(error.message)
    setSel(null); carregar()
  }

  return (
    <div className="agenda">
      <section className="card cal">
        <div className="row between wrap"><h2>Agenda</h2>
          <button className="btn primary" onClick={() => abrirNovo(dia + 'T10:00')}><Plus size={18} />Novo agendamento</button></div>
        <p className="muted dica">Toque em um dia do calendário para criar um agendamento nele.</p>
        {erroCarga && <p className="erro">Não foi possível carregar tudo: {erroCarga}</p>}
        <FullCalendar key={mobile ? 'm' : 'd'}
          plugins={[dayGrid, timeGrid, list, interaction]} locale={ptBr} initialView="dayGridMonth" height="auto"
          events={eventos} fixedWeekCount={false} dayMaxEvents={mobile ? 2 : 3}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          views={{ dayGridMonth: { displayEventTime: !mobile } }}
          headerToolbar={mobile ? { left: 'prev,next', center: 'title', right: 'today' }
            : { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listWeek' }}
          footerToolbar={mobile ? { center: 'dayGridMonth,listWeek' } : false}
          dateClick={clicouDia} eventClick={i => { setDia(i.event.startStr.slice(0, 10)); setSel(lista.find(a => a.id === i.event.id)) }} />
      </section>

      <aside className="card dia">
        <h3>{new Date(dia + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
        {doDia.length === 0 && <p className="muted">Nenhum agendamento neste dia.</p>}
        {doDia.map(a => (
          <button key={a.id} className="item" style={{ '--c': COR[a.servico] }} onClick={() => setSel(a)}>
            <span className="hora"><Clock size={14} />{hora(a.inicio)}–{hora(a.fim)}</span>
            <strong>{a.cliente_nome}</strong>
            <span className="muted">{NOME[a.servico]}{resumo(a) ? ` · ${resumo(a)}` : ''}</span>
            <span className={'pill' + (a.status === 'concluido' ? ' ok' : '')}>{a.status === 'concluido' ? 'Concluído' : `Falta ${brl(falta(a))}`}</span>
          </button>))}
      </aside>

      {sel && !form && (
        <Modal title={sel.cliente_nome} onClose={() => setSel(null)}>
          <div className="det">
            <div className="det-tags">
              <span className="badge" style={{ '--c': COR[sel.servico] }}>{NOME[sel.servico]}</span>
              <span className="badge ghost"><Clock size={13} />{dataCurta(sel.inicio)} · {hora(sel.inicio)}–{hora(sel.fim)}</span>
              {sel.encomendas && <span className="badge" style={{ '--c': '#e0b04a' }}><Package size={13} />Joia encomendada</span>}
              {sel.status === 'concluido' && <span className="badge ok"><Check size={13} />Concluído</span>}
            </div>
            {sel.agendamento_itens?.length > 0 && <div className="it-lista">{sel.agendamento_itens.map(i => (
              <div className="it-row" key={i.id}>
                {i.joias && <span><Gem size={15} />{txtJoia(i.joias)}</span>}
                {i.procedimentos && <span><Sparkles size={15} />{i.procedimentos.nome}</span>}
              </div>))}</div>}
            {sel.observacoes && <p className="det-line muted">{sel.observacoes}</p>}
            {sel.telefone && <a className="btn ghost zap" href={zap(sel.telefone, mensagemWhats(sel))} target="_blank" rel="noreferrer"><MessageCircle size={16} />Confirmar no WhatsApp · {sel.telefone}</a>}

            <div className="vals">
              <div><span>Total</span><b className="money">{brl(sel.valor_total)}</b></div>
              <div><span>Desconto</span><b>{brl(sel.desconto)}</b></div>
              <div><span>Sinal pago</span><b className="money">{brl(sel.sinal)}</b></div>
            </div>
            {sel.servico === 'tatuagem' && Number(sel.custo_tatuagem) > 0 && <p className="hint">Custo estimado da tatuagem: <b>{brl(sel.custo_tatuagem)}</b> (entra nos relatórios como custo).</p>}

            {sel.status === 'agendado' && <>
              <div className="pagar">
                <div className="pagar-row">
                  <div className="pagar-falta"><span>Valor faltante</span><strong className="money">{brl(faltaSel)}</strong></div>
                  <label>Recebido agora (R$)
                    <input type="number" inputMode="decimal" step="0.01" min="0" max={faltaSel} value={pago} onChange={e => setPago(e.target.value)} /></label>
                </div>
                {!pagoOk && <p className="hint erro">Digite um valor entre R$ 0,00 e {brl(faltaSel)}.</p>}
                {pagoOk && descExtra > 0 && <p className="hint">Será registrado um desconto extra de <b>{brl(descExtra)}</b>. Total recebido do cliente: <b className="money">{brl(r2(Number(sel.sinal) + pagoNum))}</b>.</p>}
                {pagoOk && descExtra === 0 && <p className="hint">O valor faltante será considerado pago por inteiro.</p>}
                {pagoOk && pagoNum > 0 && <PagamentoLinhas formas={formas} linhas={linhasConc} onChange={setLinhasConc} total={pagoNum} />}
              </div>
              <div className="acts">
                <button className="btn primary big" disabled={!pagamentoOk || busy} onClick={concluir}><Check size={18} />{busy ? 'Concluindo…' : 'Concluir trabalho'}</button>
                <div className="duo">
                  <button className="btn ghost" onClick={editar}><Pencil size={16} />Editar ou remarcar</button>
                  <button className="btn ghost danger" onClick={cancelar}><Ban size={16} />Cancelar</button>
                </div>
              </div>
            </>}

            {sel.status === 'concluido' && <p className="hint">Total recebido do cliente: <b className="money">{brl(r2(Number(sel.valor_total) - Number(sel.desconto)))}</b>. Veja o detalhamento completo em Relatórios.</p>}
          </div>
        </Modal>)}

      {form && (
        <Modal wide title={form.id ? 'Editar agendamento' : 'Novo agendamento'} onClose={() => setForm(null)}>
          <form onSubmit={salvar} className="grid2">
            <label>Serviço<select value={form.servico} onChange={e => set('servico', e.target.value)}><option value="piercing">Piercing</option><option value="tatuagem">Tatuagem</option></select></label>
            <label>Cliente<input required value={form.cliente_nome} onChange={e => set('cliente_nome', e.target.value)} /></label>
            <label className="full">WhatsApp<input inputMode="tel" value={form.telefone || ''} onChange={e => set('telefone', e.target.value)} placeholder="(47) 99999-9999" /></label>

            {form.servico === 'piercing' && <div className="full itens">
              <div className="itens-head"><strong>Joias e procedimentos</strong><small className="muted">Escolha só a joia, só o procedimento ou os dois</small></div>
              {form.encomenda && <p className="hint"><Package size={14} /> A joia da encomenda já está selecionada (preço combinado de {brl(form.encomenda.valor_total)}). Escolha o procedimento.</p>}
              {form.itens.map((it, k) => (
                <div className="item-row" key={k}>
                  <label>Joia<select value={it.joia_id} onChange={e => setItem(k, 'joia_id', e.target.value)}><option value="">Sem joia (cliente já tem)</option>
                    {joias.filter(j => !j.oculta || j.id === it.joia_id).map(j => <option key={j.id} value={j.id} disabled={j.quantidade < 1 && j.id !== it.joia_id}>{txtJoia(j)} · {brl(j.valor_venda)} ({j.quantidade}{j.reservado > 0 ? ` · ${j.reservado} reservada${j.reservado > 1 ? 's' : ''}` : ''})</option>)}</select></label>
                  <label>Procedimento<select value={it.procedimento_id} onChange={e => setItem(k, 'procedimento_id', e.target.value)}><option value="">Sem procedimento</option>
                    {procs.map(p => <option key={p.id} value={p.id}>{p.nome} · {brl(p.valor)}</option>)}</select></label>
                  <button type="button" className="icon-btn danger" aria-label="Remover linha" onClick={() => delItem(k)}><Trash2 size={17} /></button>
                </div>))}
              <button type="button" className="btn ghost" onClick={addItem}><Plus size={16} />Adicionar joia e procedimento</button>
              {procs.length === 0 && <small className="muted">Nenhum procedimento cadastrado ainda. Cadastre na tela Procedimentos.</small>}
              {(() => { const p = previa(); return (
                <div className="vals">
                  <div><span>Joias</span><b className="money">{brl(p.j)}</b></div>
                  <div><span>Procedimentos</span><b className="money">{brl(p.p)}</b></div>
                  <div><span>Comissão da piercer</span><b className="money">{brl(p.comissao)}</b></div>
                </div>) })()}
            </div>}

            <label>Início<input type="datetime-local" required value={form.inicio} onChange={e => mudarInicio(e.target.value)} /></label>
            <label>Fim<input type="datetime-local" required value={form.fim} onChange={e => set('fim', e.target.value)} /></label>
            <label>Valor total<input type="number" inputMode="decimal" step="0.01" min="0" value={form.valor_total} onChange={e => set('valor_total', e.target.value)} /></label>
            <label>Desconto<input type="number" inputMode="decimal" step="0.01" min="0" value={form.desconto} onChange={e => set('desconto', e.target.value)} /></label>

            {form.servico === 'tatuagem' && <div className="full itens">
              <div className="itens-head"><strong>Custo da tatuagem</strong><small className="muted">Opcional: uma estimativa usada nos relatórios para calcular o lucro. Em branco vale R$ 0,00.</small></div>
              <label>Custo estimado (R$)<input type="number" inputMode="decimal" step="0.01" min="0" placeholder="0,00" value={form.custo_tatuagem} onChange={e => set('custo_tatuagem', e.target.value)} /></label>
              <div className="vals">
                <div><span>A cobrar</span><b className="money">{brl(cobrarForm)}</b></div>
                <div><span>Custo estimado</span><b>{brl(custoForm)}</b></div>
                <div><span>Lucro estimado</span><b className="money">{brl(cobrarForm - custoForm)}</b></div>
              </div>
            </div>}

            <div className="full itens">
              <div className="itens-head"><strong>Sinal</strong>
                <small className="muted">{form.encomenda ? 'Sinal já pago na encomenda (não será contado de novo)' : 'Opcional. Pode ser dividido em várias formas de pagamento'}</small></div>
              {form.encomenda
                ? <div className="vals"><div><span>Sinal pago</span><b className="money">{brl(form.encomenda.sinal)}</b></div></div>
                : <PagamentoLinhas formas={formas} linhas={form.pagSinal} onChange={l => set('pagSinal', l)} inicial={!form.id} />}
              <div className="vals"><div><span>Valor faltante</span><b className="money">{brl(faltaForm)}</b></div></div>
            </div>

            <label className="full">Observações<textarea rows="2" value={form.observacoes || ''} onChange={e => set('observacoes', e.target.value)} /></label>
            {erro && <p className="erro full">{erro}</p>}
            <div className="row end full"><button type="button" className="btn ghost" onClick={() => setForm(null)}>Voltar</button><button className="btn primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button></div>
          </form>
        </Modal>)}
    </div>)
}
