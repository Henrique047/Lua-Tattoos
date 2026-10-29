import { useEffect, useMemo, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGrid from '@fullcalendar/daygrid'
import timeGrid from '@fullcalendar/timegrid'
import interaction from '@fullcalendar/interaction'
import ptBr from '@fullcalendar/core/locales/pt-br'
import { Plus, MessageCircle, Check, Ban, Pencil, Clock } from 'lucide-react'
import { supabase, brl, toLocalInput, zap } from '../lib/supabase'
import Modal from './Modal'

const COR = { tatuagem: '#c9708f', piercing: '#8d7bc4' }
const vazio = () => ({ servico: 'piercing', cliente_nome: '', telefone: '', joia_id: '', inicio: '', fim: '', valor_total: 0, sinal: 0, desconto: 0, observacoes: '' })
const falta = a => Number(a.valor_total || 0) - Number(a.desconto || 0) - Number(a.sinal || 0)

export default function Agenda() {
  const [lista, setLista] = useState([]), [joias, setJoias] = useState([]), [dia, setDia] = useState(new Date().toISOString().slice(0, 10))
  const [form, setForm] = useState(null), [sel, setSel] = useState(null), [erro, setErro] = useState('')
  const carregar = async () => {
    const [a, j] = await Promise.all([supabase.from('agendamentos').select('*, joias(nome,tamanho,material)').neq('status', 'cancelado').order('inicio'), supabase.from('joias').select('*').order('nome')])
    setLista(a.data || []); setJoias(j.data || [])
  }
  useEffect(() => { carregar() }, [])
  const eventos = useMemo(() => lista.map(a => ({ id: a.id, title: `${a.cliente_nome}`, start: a.inicio, end: a.fim,
    backgroundColor: COR[a.servico], borderColor: COR[a.servico], classNames: a.status === 'concluido' ? ['feito'] : [] })), [lista])
  const doDia = lista.filter(a => new Date(a.inicio).toLocaleDateString('sv') === dia)
  const hora = i => new Date(i).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const salvar = async e => {
    e.preventDefault(); setErro('')
    const { id, joias: _j, status, concluido_em, custo_joia, comissao, created_at, ...f } = form
    const dados = { ...f, joia_id: f.servico === 'piercing' && f.joia_id ? f.joia_id : null, inicio: new Date(f.inicio).toISOString(), fim: new Date(f.fim).toISOString() }
    const { error } = id ? await supabase.from('agendamentos').update(dados).eq('id', id) : await supabase.from('agendamentos').insert(dados)
    if (error) return setErro(error.code === '23P01' ? 'Já existe um agendamento deste serviço nesse horário.' : error.message)
    setForm(null); setSel(null); carregar()
  }
  const acao = async (fn) => { const { error } = await fn(); if (error) return alert(error.message); setSel(null); carregar() }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const escolherJoia = id => { const j = joias.find(x => x.id === id); setForm(f => ({ ...f, joia_id: id, valor_total: j ? j.valor_venda : f.valor_total })) }

  return (
    <div className="agenda">
      <section className="card cal">
        <div className="row between"><h2>Agenda</h2>
          <button className="btn primary" onClick={() => setForm({ ...vazio(), inicio: dia + 'T10:00', fim: dia + 'T11:00' })}><Plus size={18} />Novo agendamento</button></div>
        <FullCalendar plugins={[dayGrid, timeGrid, interaction]} locale={ptBr} initialView="dayGridMonth" height="auto" events={eventos}
          headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' }}
          dateClick={i => setDia(i.dateStr.slice(0, 10))} eventClick={i => setSel(lista.find(a => a.id === i.event.id))} />
      </section>
      <aside className="card dia">
        <h3>{new Date(dia + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
        {doDia.length === 0 && <p className="muted">Nenhum agendamento neste dia. Clique em “Novo agendamento” para criar um.</p>}
        {doDia.map(a => (
          <button key={a.id} className="item" style={{ '--c': COR[a.servico] }} onClick={() => setSel(a)}>
            <span className="hora"><Clock size={14} />{hora(a.inicio)}–{hora(a.fim)}</span>
            <strong>{a.cliente_nome}</strong>
            <span className="muted">{a.servico}{a.joias ? ` · ${a.joias.nome} ${a.joias.tamanho || ''}` : ''}</span>
            <span className="pill">{a.status === 'concluido' ? 'Concluído' : `Falta ${brl(falta(a))}`}</span>
          </button>))}
      </aside>

      {sel && !form && (
        <Modal title={sel.cliente_nome} onClose={() => setSel(null)}>
          <div className="info">
            <p><b>Serviço:</b> {sel.servico}</p><p><b>Horário:</b> {hora(sel.inicio)}–{hora(sel.fim)}</p>
            {sel.joias && <p><b>Joia:</b> {sel.joias.nome} {sel.joias.tamanho} {sel.joias.material}</p>}
            <p><b>Total:</b> {brl(sel.valor_total)} · <b>Desconto:</b> {brl(sel.desconto)}</p>
            <p><b>Sinal pago:</b> {brl(sel.sinal)} · <b>Faltante:</b> {brl(falta(sel))}</p>
            {sel.observacoes && <p><b>Obs.:</b> {sel.observacoes}</p>}
            {sel.telefone && <a className="btn ghost" href={zap(sel.telefone)} target="_blank" rel="noreferrer"><MessageCircle size={16} />{sel.telefone}</a>}
          </div>
          {sel.status === 'agendado' && <div className="row end wrap">
            <button className="btn ghost danger" onClick={() => confirm('Cancelar este agendamento?') && acao(() => supabase.from('agendamentos').update({ status: 'cancelado' }).eq('id', sel.id))}><Ban size={16} />Cancelar</button>
            <button className="btn ghost" onClick={() => setForm({ ...sel, joia_id: sel.joia_id || '', inicio: toLocalInput(sel.inicio), fim: toLocalInput(sel.fim) })}><Pencil size={16} />Editar ou remarcar</button>
            <button className="btn primary" onClick={() => acao(() => supabase.rpc('concluir_atendimento', { p_id: sel.id }))}><Check size={16} />Concluir trabalho</button></div>}
        </Modal>)}

      {form && (
        <Modal title={form.id ? 'Editar agendamento' : 'Novo agendamento'} onClose={() => setForm(null)}>
          <form onSubmit={salvar} className="grid2">
            <label>Serviço<select value={form.servico} onChange={e => set('servico', e.target.value)}><option value="piercing">Piercing</option><option value="tatuagem">Tatuagem</option></select></label>
            <label>Cliente<input required value={form.cliente_nome} onChange={e => set('cliente_nome', e.target.value)} /></label>
            <label>WhatsApp<input value={form.telefone || ''} onChange={e => set('telefone', e.target.value)} placeholder="(47) 99999-9999" /></label>
            {form.servico === 'piercing' && <label>Joia<select value={form.joia_id} onChange={e => escolherJoia(e.target.value)}><option value="">Sem joia definida</option>
              {joias.map(j => <option key={j.id} value={j.id}>{j.nome} {j.tamanho} {j.material} ({j.quantidade})</option>)}</select></label>}
            <label>Início<input type="datetime-local" required value={form.inicio} onChange={e => set('inicio', e.target.value)} /></label>
            <label>Fim<input type="datetime-local" required value={form.fim} onChange={e => set('fim', e.target.value)} /></label>
            <label>Valor total<input type="number" step="0.01" min="0" value={form.valor_total} onChange={e => set('valor_total', e.target.value)} /></label>
            <label>Desconto<input type="number" step="0.01" min="0" value={form.desconto} onChange={e => set('desconto', e.target.value)} /></label>
            <label>Sinal pago<input type="number" step="0.01" min="0" value={form.sinal} onChange={e => set('sinal', e.target.value)} /></label>
            <label>Valor faltante<input readOnly value={brl(falta(form))} /></label>
            <label className="full">Observações<textarea rows="2" value={form.observacoes || ''} onChange={e => set('observacoes', e.target.value)} /></label>
            {erro && <p className="erro full">{erro}</p>}
            <div className="row end full"><button type="button" className="btn ghost" onClick={() => setForm(null)}>Voltar</button><button className="btn primary">Salvar</button></div>
          </form>
        </Modal>)}
    </div>)
}
