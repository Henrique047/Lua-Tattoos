import { useEffect, useMemo, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGrid from '@fullcalendar/daygrid'
import timeGrid from '@fullcalendar/timegrid'
import list from '@fullcalendar/list'
import interaction from '@fullcalendar/interaction'
import ptBr from '@fullcalendar/core/locales/pt-br'
import { Plus, MessageCircle, Check, Ban, Pencil, Clock, Gem } from 'lucide-react'
import { supabase, brl, toLocalInput, zap } from '../lib/supabase'
import Modal from './Modal'

const COR = { tatuagem: '#c9708f', piercing: '#8d7bc4' }
const NOME = { tatuagem: 'Tatuagem', piercing: 'Piercing' }
const r2 = n => Math.round(n * 100) / 100
const hojeStr = () => new Date().toLocaleDateString('sv') // data LOCAL (AAAA-MM-DD), não UTC
const maisUmaHora = local => toLocalInput(new Date(new Date(local).getTime() + 36e5).toISOString())
const vazio = (inicio = hojeStr() + 'T10:00') => ({
  servico: 'piercing', cliente_nome: '', telefone: '', joia_id: '', inicio, fim: maisUmaHora(inicio),
  valor_total: 0, sinal: 0, desconto: 0, observacoes: ''
})
const falta = a => Math.max(0, r2(Number(a.valor_total || 0) - Number(a.desconto || 0) - Number(a.sinal || 0)))

// true quando a tela é de celular (a agenda troca de layout)
function useMobile(px = 700) {
  const [m, setM] = useState(() => window.innerWidth <= px)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${px}px)`), h = () => setM(mq.matches)
    h(); mq.addEventListener('change', h); return () => mq.removeEventListener('change', h)
  }, [px])
  return m
}

export default function Agenda() {
  const mobile = useMobile()
  const [lista, setLista] = useState([]), [joias, setJoias] = useState([]), [dia, setDia] = useState(hojeStr())
  const [form, setForm] = useState(null), [sel, setSel] = useState(null), [erro, setErro] = useState('')
  const [pago, setPago] = useState(''), [busy, setBusy] = useState(false)

  const carregar = async () => {
    const [a, j] = await Promise.all([
      supabase.from('agendamentos').select('*, joias(nome,tamanho,material)').neq('status', 'cancelado').order('inicio'),
      supabase.from('joias').select('*').order('nome')])
    setLista(a.data || []); setJoias(j.data || [])
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
  const escolherJoia = id => { const j = joias.find(x => x.id === id); setForm(f => ({ ...f, joia_id: id, valor_total: j ? j.valor_venda : f.valor_total })) }

  const salvar = async e => {
    e.preventDefault(); setErro('')
    const { id, joias: _j, status, concluido_em, custo_joia, comissao, created_at, ...f } = form
    if (new Date(f.fim) <= new Date(f.inicio)) return setErro('O horário final precisa ser depois do início.')
    const dados = {
      ...f, joia_id: f.servico === 'piercing' && f.joia_id ? f.joia_id : null,
      valor_total: Number(f.valor_total || 0), desconto: Number(f.desconto || 0), sinal: Number(f.sinal || 0),
      inicio: new Date(f.inicio).toISOString(), fim: new Date(f.fim).toISOString()
    }
    const { error } = id ? await supabase.from('agendamentos').update(dados).eq('id', id) : await supabase.from('agendamentos').insert(dados)
    if (error) return setErro(error.code === '23P01' ? 'Já existe um agendamento deste serviço nesse horário.' : error.message)
    setForm(null); setSel(null); carregar()
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
            <span className="muted">{NOME[a.servico]}{a.joias ? ` · ${a.joias.nome} ${a.joias.tamanho || ''}` : ''}</span>
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
            {sel.joias && <p className="det-line"><Gem size={16} />{sel.joias.nome} {sel.joias.tamanho} {sel.joias.material}</p>}
            {sel.observacoes && <p className="det-line muted">{sel.observacoes}</p>}
            {sel.telefone && <a className="btn ghost zap" href={zap(sel.telefone)} target="_blank" rel="noreferrer"><MessageCircle size={16} />{sel.telefone}</a>}

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
                  <button className="btn ghost" onClick={() => { setErro(''); setForm({ ...sel, joia_id: sel.joia_id || '', inicio: toLocalInput(sel.inicio), fim: toLocalInput(sel.fim) }) }}><Pencil size={16} />Editar ou remarcar</button>
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
            <label>WhatsApp<input inputMode="tel" value={form.telefone || ''} onChange={e => set('telefone', e.target.value)} placeholder="(47) 99999-9999" /></label>
            {form.servico === 'piercing' && <label>Joia<select value={form.joia_id} onChange={e => escolherJoia(e.target.value)}><option value="">Sem joia definida</option>
              {joias.map(j => <option key={j.id} value={j.id}>{j.nome} {j.tamanho} {j.material} ({j.quantidade})</option>)}</select></label>}
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