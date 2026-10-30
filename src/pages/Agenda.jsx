import { useEffect, useMemo, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGrid from '@fullcalendar/daygrid'
import timeGrid from '@fullcalendar/timegrid'
import list from '@fullcalendar/list'
import interaction from '@fullcalendar/interaction'
import ptBr from '@fullcalendar/core/locales/pt-br'
import { Plus, MessageCircle, Check, Ban, Pencil, Clock, Gem, Sparkles, Trash2 } from 'lucide-react'
import { supabase, brl, toLocalInput, zap, mensagemWhats } from '../lib/supabase'
import { r2, calcular } from '../lib/calc'
import useMobile from '../lib/useMobile'
import Modal from './Modal'

const COR = { tatuagem: '#c9708f', piercing: '#8d7bc4' }
const NOME = { tatuagem: 'Tatuagem', piercing: 'Piercing' }
const hojeStr = () => new Date().toLocaleDateString('sv') // data LOCAL (AAAA-MM-DD), não UTC
const maisUmaHora = local => toLocalInput(new Date(new Date(local).getTime() + 36e5).toISOString())
const itemVazio = () => ({ joia_id: '', procedimento_id: '' })
const vazio = (inicio = hojeStr() + 'T10:00') => ({
  servico: 'piercing', cliente_nome: '', telefone: '', inicio, fim: maisUmaHora(inicio),
  valor_total: 0, sinal: 0, desconto: 0, observacoes: '', itens: [itemVazio()]
})
const falta = a => Math.max(0, r2(Number(a.valor_total || 0) - Number(a.desconto || 0) - Number(a.sinal || 0)))
const txtJoia = j => [j?.nome, j?.tamanho, j?.material].filter(Boolean).join(' ')
// resumo curto dos itens para a lista do dia
const resumo = a => {
  const t = (a.agendamento_itens || []).map(i => [i.joias && txtJoia(i.joias), i.procedimentos?.nome].filter(Boolean).join(' + ')).filter(Boolean)
  return t.length > 2 ? `${t.slice(0, 2).join(' · ')} · +${t.length - 2}` : t.join(' · ')
}

export default function Agenda() {
  const mobile = useMobile()
  const [lista, setLista] = useState([]), [joias, setJoias] = useState([]), [procs, setProcs] = useState([]), [dia, setDia] = useState(hojeStr())
  const [form, setForm] = useState(null), [sel, setSel] = useState(null), [erro, setErro] = useState(''), [erroCarga, setErroCarga] = useState('')
  const [pago, setPago] = useState(''), [busy, setBusy] = useState(false)

  const carregar = async () => {
    const [a, j, p] = await Promise.all([
      supabase.from('agendamentos').select('*, agendamento_itens(id, joia_id, procedimento_id, joias(nome,tamanho,material), procedimentos(nome))')
        .neq('status', 'cancelado').order('inicio').order('created_at', { referencedTable: 'agendamento_itens' }),
      supabase.from('joias').select('*').order('nome'),
      supabase.from('procedimentos').select('*').order('nome')])
    setErroCarga(a.error?.message || j.error?.message || p.error?.message || '')
    setLista(a.data || []); setJoias(j.data || []); setProcs(p.data || [])
  }
  useEffect(() => { carregar() }, [])

  // ao abrir um agendamento, o valor recebido já vem preenchido com o que falta
  useEffect(() => { if (sel) setPago(String(falta(sel))) }, [sel?.id])

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

  // itens (joia + procedimento): o valor total é a soma dos preços e continua editável
  const resolver = it => ({ joia: joias.find(x => x.id === it.joia_id), proc: procs.find(x => x.id === it.procedimento_id) })
  const somaItens = itens => itens.reduce((s, it) => { const { joia, proc } = resolver(it); return { j: s.j + Number(joia?.valor_venda || 0), p: s.p + Number(proc?.valor || 0) } }, { j: 0, p: 0 })
  const mudarItens = itens => setForm(f => { const s = somaItens(itens); return { ...f, itens, valor_total: r2(s.j + s.p) } })
  const setItem = (k, campo, v) => mudarItens(form.itens.map((it, i) => i === k ? { ...it, [campo]: v } : it))
  const addItem = () => setForm(f => ({ ...f, itens: [...f.itens, itemVazio()] }))
  const delItem = k => mudarItens(form.itens.filter((_, i) => i !== k))
  const previa = () => {
    const usados = form.itens.filter(i => i.joia_id || i.procedimento_id), s = somaItens(usados)
    return { ...s, comissao: calcular(usados.map(resolver)).comissao }
  }

  const salvar = async e => {
    e.preventDefault(); setErro('')
    if (new Date(form.fim) <= new Date(form.inicio)) return setErro('O horário final precisa ser depois do início.')
    const dados = {
      servico: form.servico, cliente_nome: form.cliente_nome, telefone: form.telefone || null, observacoes: form.observacoes || null,
      joia_id: null, valor_total: Number(form.valor_total || 0), desconto: Number(form.desconto || 0), sinal: Number(form.sinal || 0),
      inicio: new Date(form.inicio).toISOString(), fim: new Date(form.fim).toISOString()
    }
    const r = form.id ? await supabase.from('agendamentos').update(dados).eq('id', form.id).select('id').single()
      : await supabase.from('agendamentos').insert(dados).select('id').single()
    if (r.error) return setErro(r.error.code === '23P01' ? 'Já existe um agendamento deste serviço nesse horário.' : r.error.message)
    const id = r.data.id
    // substitui os itens pelos que estão na tela (tatuagem não usa joia/procedimento)
    if (form.id) { const d = await supabase.from('agendamento_itens').delete().eq('agendamento_id', id); if (d.error) return setErro(d.error.message) }
    const novos = form.servico === 'piercing' ? form.itens.filter(i => i.joia_id || i.procedimento_id)
      .map(i => ({ agendamento_id: id, joia_id: i.joia_id || null, procedimento_id: i.procedimento_id || null })) : []
    if (novos.length) { const n = await supabase.from('agendamento_itens').insert(novos); if (n.error) return setErro(n.error.message) }
    setForm(null); setSel(null); carregar()
  }

  const editar = () => {
    setErro('')
    setForm({
      id: sel.id, servico: sel.servico, cliente_nome: sel.cliente_nome, telefone: sel.telefone || '',
      inicio: toLocalInput(sel.inicio), fim: toLocalInput(sel.fim), valor_total: sel.valor_total, sinal: sel.sinal, desconto: sel.desconto,
      observacoes: sel.observacoes || '',
      itens: sel.agendamento_itens?.length ? sel.agendamento_itens.map(i => ({ joia_id: i.joia_id || '', procedimento_id: i.procedimento_id || '' })) : [itemVazio()]
    })
  }

  // ---------- concluir / cancelar ----------
  const faltaSel = sel ? falta(sel) : 0
  const pagoNum = pago === '' ? NaN : Number(pago)
  const pagoOk = !Number.isNaN(pagoNum) && pagoNum >= 0 && pagoNum <= faltaSel + 0.001
  const descExtra = pagoOk ? r2(faltaSel - pagoNum) : 0

  const concluir = async () => {
    setBusy(true)
    const { error } = await supabase.rpc('concluir_atendimento', { p_id: sel.id, p_valor_pago: pagoNum })
    setBusy(false)
    if (error) return alert(error.message)
    setSel(null); carregar()
  }
  const cancelar = async () => {
    if (!confirm('Cancelar este agendamento?')) return
    const { error } = await supabase.from('agendamentos').update({ status: 'cancelado' }).eq('id', sel.id)
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
              </div>
              <div className="acts">
                <button className="btn primary big" disabled={!pagoOk || busy} onClick={concluir}><Check size={18} />{busy ? 'Concluindo…' : 'Concluir trabalho'}</button>
                <div className="duo">
                  <button className="btn ghost" onClick={editar}><Pencil size={16} />Editar ou remarcar</button>
                  <button className="btn ghost danger" onClick={cancelar}><Ban size={16} />Cancelar</button>
                </div>
              </div>
            </>}

            {sel.status === 'concluido' && <p className="hint">Total recebido do cliente: <b className="money">{brl(r2(Number(sel.valor_total) - Number(sel.desconto)))}</b></p>}
          </div>
        </Modal>)}

      {form && (
        <Modal title={form.id ? 'Editar agendamento' : 'Novo agendamento'} onClose={() => setForm(null)}>
          <form onSubmit={salvar} className="grid2">
            <label>Serviço<select value={form.servico} onChange={e => set('servico', e.target.value)}><option value="piercing">Piercing</option><option value="tatuagem">Tatuagem</option></select></label>
            <label>Cliente<input required value={form.cliente_nome} onChange={e => set('cliente_nome', e.target.value)} /></label>
            <label className="full">WhatsApp<input inputMode="tel" value={form.telefone || ''} onChange={e => set('telefone', e.target.value)} placeholder="(47) 99999-9999" /></label>

            {form.servico === 'piercing' && <div className="full itens">
              <div className="itens-head"><strong>Joias e procedimentos</strong><small className="muted">Escolha só a joia, só o procedimento ou os dois</small></div>
              {form.itens.map((it, k) => (
                <div className="item-row" key={k}>
                  <label>Joia<select value={it.joia_id} onChange={e => setItem(k, 'joia_id', e.target.value)}><option value="">Sem joia (cliente já tem)</option>
                    {joias.map(j => <option key={j.id} value={j.id} disabled={j.quantidade < 1 && j.id !== it.joia_id}>{txtJoia(j)} · {brl(j.valor_venda)} ({j.quantidade})</option>)}</select></label>
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
            <label>Sinal pago<input type="number" inputMode="decimal" step="0.01" min="0" value={form.sinal} onChange={e => set('sinal', e.target.value)} /></label>
            <label>Valor faltante<input readOnly className="money" value={brl(falta(form))} /></label>
            <label className="full">Observações<textarea rows="2" value={form.observacoes || ''} onChange={e => set('observacoes', e.target.value)} /></label>
            {erro && <p className="erro full">{erro}</p>}
            <div className="row end full"><button type="button" className="btn ghost" onClick={() => setForm(null)}>Voltar</button><button className="btn primary">Salvar</button></div>
          </form>
        </Modal>)}
    </div>)
}