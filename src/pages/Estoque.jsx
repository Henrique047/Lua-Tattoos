import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Search, Image as Img } from 'lucide-react'
import { supabase, brl } from '../lib/supabase'
import Modal from './Modal'
import { JoiaCampos, joiaVazia, MAT } from './JoiaForm'
import { useLocais } from '../lib/locais'

export default function Estoque() {
  const [itens, setItens] = useState([]), [q, setQ] = useState(''), [f, setF] = useState({ material: '', local: '', tipo: '' })
  const [form, setForm] = useState(null), [qtd, setQtd] = useState(null), [add, setAdd] = useState(0), [comp, setComp] = useState({})
  // joias exclusivas de encomenda (oculta = true) não aparecem no estoque convencional
  const carregar = async () => {
    const [j, c] = await Promise.all([supabase.from('joias').select('*').eq('oculta', false).order('nome'), supabase.rpc('joias_comprometidas', { p_excluir: null })])
    setItens(j.data || []); setComp(Object.fromEntries((c.data || []).map(r => [r.joia_id, r.qtd])))   // unidades já comprometidas em agendamentos abertos
  }
  useEffect(() => { carregar() }, [])
  const tipos = [...new Set(itens.map(i => i.tipo).filter(Boolean))]
  // locais cadastrados + os que já estão em uso nas joias (mesmo que tenham saído da lista)
  const { locais } = useLocais()
  const opcLocal = [...new Set([...locais.map(l => l.nome), ...itens.map(i => i.local).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const vis = useMemo(() => itens.filter(i => (!q || i.nome.toLowerCase().includes(q.toLowerCase())) && Object.entries(f).every(([k, v]) => !v || i[k] === v)), [itens, q, f])
  const set = (k, v) => setForm(x => ({ ...x, [k]: v }))
  const salvar = async e => {
    e.preventDefault(); const { id, created_at, reservado, oculta, ...d } = form   // reservado/oculta são controlados pelas encomendas
    Object.keys(d).forEach(k => d[k] === '' && !['nome'].includes(k) && (d[k] = null)); d.valor_compra ||= 0; d.valor_venda ||= 0; d.comissao_valor ||= 0; d.quantidade ||= 0
    const { error } = id ? await supabase.from('joias').update(d).eq('id', id) : await supabase.from('joias').insert(d)
    if (error) return alert(error.message); setForm(null); carregar()
  }
  const entrada = async e => { e.preventDefault(); await supabase.from('joias').update({ quantidade: qtd.quantidade + Number(add) }).eq('id', qtd.id); setQtd(null); setAdd(0); carregar() }
  const remover = async i => { if (confirm(`Remover “${i.nome}” e zerar o estoque?`)) { const { error } = await supabase.from('joias').delete().eq('id', i.id); if (error) alert(error.message); carregar() } }
  const Thumb = ({ i, s = 48 }) => i.imagem_url ? <img src={i.imagem_url} alt={i.nome} className="thumb" style={{ width: s, height: s }} /> : <span className="thumb" style={{ width: s, height: s }}><Img size={18} /></span>

  return (
    <section>
      <div className="row between wrap"><h2>Estoque</h2><button className="btn primary" onClick={() => setForm(joiaVazia)}><Plus size={18} />Adicionar</button></div>
      <div className="row wrap filtros">
        <label className="busca"><Search size={16} /><input placeholder="Buscar por nome" value={q} onChange={e => setQ(e.target.value)} /></label>
        <select value={f.material} onChange={e => setF({ ...f, material: e.target.value })}><option value="">Material</option>{MAT.map(m => <option key={m}>{m}</option>)}</select>
        <select value={f.local} onChange={e => setF({ ...f, local: e.target.value })}><option value="">Local</option>{opcLocal.map(m => <option key={m}>{m}</option>)}</select>
        <select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}><option value="">Tipo</option>{tipos.map(m => <option key={m}>{m}</option>)}</select>
      </div>
      <div className="card lista">
        {vis.length === 0 && <p className="muted pad">Nenhum item encontrado. Adicione a primeira joia ou ajuste os filtros.</p>}
        {vis.map(i => (
          <div className="linha" key={i.id}>
            <Thumb i={i} />
            <button className={'qtd' + (i.quantidade <= 2 ? ' baixo' : '')} onClick={() => setQtd(i)} title="Dar entrada">{i.quantidade}</button>
            <strong className="nome">{i.nome}{i.reservado > 0 && <span className="badge ghost reserv">{i.reservado} reservada{i.reservado > 1 ? 's' : ''}</span>}{comp[i.id] > 0 && <span className="badge reserv" style={{ '--c': '#e0b04a' }}>{comp[i.id]} em agendamento{comp[i.id] > 1 ? 's' : ''}</span>}</strong>
            <span>{i.material || '–'}</span><span>{i.tamanho || '–'}</span><span>{i.local || '–'}</span>
            <span>{brl(i.valor_venda)}</span>
            <span className="muted">{i.comissao_tipo === 'percentual' ? `${i.comissao_valor}%` : brl(i.comissao_valor)}</span>
            <span className="acoes"><button className="icon-btn" aria-label="Editar" onClick={() => setForm(i)}><Pencil size={17} /></button>
              <button className="icon-btn danger" aria-label="Remover" onClick={() => remover(i)}><Trash2 size={17} /></button></span>
          </div>))}
      </div>

      {qtd && <Modal title="Entrada de estoque" onClose={() => setQtd(null)}>
        <form onSubmit={entrada} className="center"><Thumb i={qtd} s={120} /><strong>{qtd.nome} {qtd.tamanho}</strong>
          <p className="muted">Quantidade atual: {qtd.quantidade}</p>
          <label>Quantidade a adicionar<input type="number" autoFocus value={add} onChange={e => setAdd(e.target.value)} /></label>
          <p>Novo total: <b>{qtd.quantidade + Number(add || 0)}</b></p>
          <div className="row end"><button type="button" className="btn ghost" onClick={() => setQtd(null)}>Cancelar</button><button className="btn primary">Salvar</button></div></form></Modal>}

      {form && <Modal title={form.id ? 'Editar item' : 'Adicionar item'} onClose={() => setForm(null)}>
        <form onSubmit={salvar} className="grid2">
          <JoiaCampos form={form} set={set} />
          <div className="row end full"><button type="button" className="btn ghost" onClick={() => setForm(null)}>Cancelar</button><button className="btn primary">Salvar</button></div>
        </form></Modal>}
    </section>)
}
