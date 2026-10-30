import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { supabase, brl } from '../lib/supabase'
import Modal from './Modal'

const vazio = { nome: '', valor: 0, comissao_tipo: 'percentual', comissao_valor: 0 }
const txtCom = p => p.comissao_tipo === 'percentual' ? `${Number(p.comissao_valor)}%` : brl(p.comissao_valor)

export default function Procedimentos() {
  const [itens, setItens] = useState([]), [form, setForm] = useState(null), [marc, setMarc] = useState(new Set())
  const [erro, setErro] = useState(''), [busy, setBusy] = useState(false)
  const carregar = async () => {
    const { data, error } = await supabase.from('procedimentos').select('*').order('nome')
    if (error) setErro(error.message); setItens(data || []); setMarc(new Set())
  }
  useEffect(() => { carregar() }, [])
  const set = (k, v) => setForm(x => ({ ...x, [k]: v }))

  const salvar = async e => {
    e.preventDefault(); setErro('')
    const d = { nome: form.nome.trim(), valor: Number(form.valor || 0), comissao_tipo: form.comissao_tipo, comissao_valor: Number(form.comissao_valor || 0) }
    if (!d.nome) return setErro('Digite o nome do procedimento.')
    if (d.comissao_tipo === 'percentual' && d.comissao_valor > 100) return setErro('A comissão em % não pode passar de 100.')
    if (d.comissao_tipo === 'valor' && d.comissao_valor > d.valor) return setErro('A comissão em R$ não pode ser maior que o valor do procedimento.')
    setBusy(true)
    const { error } = form.id ? await supabase.from('procedimentos').update(d).eq('id', form.id) : await supabase.from('procedimentos').insert(d)
    setBusy(false)
    if (error) return setErro(error.message)
    setForm(null); carregar()
  }
  const remover = async p => {
    if (!confirm(`Excluir o procedimento “${p.nome}”? Agendamentos futuros que o usam ficarão sem esse procedimento.`)) return
    const { error } = await supabase.from('procedimentos').delete().eq('id', p.id)
    if (error) return alert(error.message); carregar()
  }
  const removerLote = async () => {
    if (!confirm(`Excluir ${marc.size} procedimento(s) selecionado(s)?`)) return
    const { error } = await supabase.from('procedimentos').delete().in('id', [...marc])
    if (error) return alert(error.message); carregar()
  }
  const alterna = id => setMarc(m => { const n = new Set(m); n.has(id) ? n.delete(id) : n.add(id); return n })
  const todos = itens.length > 0 && marc.size === itens.length

  return (
    <section>
      <div className="row between wrap"><h2>Procedimentos</h2>
        <button className="btn primary" onClick={() => { setErro(''); setForm(vazio) }}><Plus size={18} />Adicionar</button></div>
      <p className="muted dica">Serviços que a piercer executa (ex.: perfuração de nariz). Eles aparecem no agendamento, e o valor e a comissão são somados aos da joia.</p>
      {erro && !form && <p className="erro">{erro}</p>}

      {marc.size > 0 && <div className="bulk"><span><b>{marc.size}</b> selecionado(s)</span>
        <button className="btn danger" onClick={removerLote}><Trash2 size={16} />Excluir selecionados</button></div>}

      <div className="card plista">
        {itens.length > 0 && <div className="plinha cab">
          <span className="pchk"><input type="checkbox" aria-label="Selecionar todos" checked={todos} onChange={() => setMarc(todos ? new Set() : new Set(itens.map(i => i.id)))} /></span>
          <span>Procedimento</span><span className="pval">Valor</span><span className="pcom">Comissão</span><span className="acoes" />
        </div>}
        {itens.length === 0 && <p className="muted pad">Nenhum procedimento ainda. Clique em Adicionar para criar o primeiro.</p>}
        {itens.map(p => (
          <div className={'plinha' + (marc.has(p.id) ? ' marc' : '')} key={p.id}>
            <span className="pchk"><input type="checkbox" aria-label={`Selecionar ${p.nome}`} checked={marc.has(p.id)} onChange={() => alterna(p.id)} /></span>
            <strong className="pnome">{p.nome}</strong>
            <span className="pval money">{brl(p.valor)}</span>
            <span className="pcom">{txtCom(p)}</span>
            <small className="pmeta">{brl(p.valor)} · comissão {txtCom(p)}</small>
            <span className="acoes"><button className="icon-btn" aria-label="Editar" onClick={() => { setErro(''); setForm(p) }}><Pencil size={17} /></button>
              <button className="icon-btn danger" aria-label="Excluir" onClick={() => remover(p)}><Trash2 size={17} /></button></span>
          </div>))}
      </div>

      {form && <Modal title={form.id ? 'Editar procedimento' : 'Novo procedimento'} onClose={() => setForm(null)}>
        <form onSubmit={salvar} className="grid2">
          <label className="full">Procedimento<input required autoFocus value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Perfuração de mamilo" /></label>
          <label className="full">Valor total (R$)<input type="number" inputMode="decimal" step="0.01" min="0" value={form.valor} onChange={e => set('valor', e.target.value)} /></label>
          <div className="full"><div className="seg">
            {['percentual', 'valor'].map(t => <button type="button" key={t} className={form.comissao_tipo === t ? 'on' : ''} onClick={() => set('comissao_tipo', t)}>{t === 'percentual' ? 'Lucro em %' : 'Lucro em R$'}</button>)}</div>
            <label>Lucro da piercer ({form.comissao_tipo === 'percentual' ? '%' : 'R$'})<input type="number" inputMode="decimal" step="0.01" min="0" value={form.comissao_valor} onChange={e => set('comissao_valor', e.target.value)} /></label></div>
          {erro && <p className="erro full">{erro}</p>}
          <div className="row end full"><button type="button" className="btn ghost" onClick={() => setForm(null)}>Cancelar</button><button className="btn primary" disabled={busy}>Salvar</button></div>
        </form></Modal>}
    </section>)
}