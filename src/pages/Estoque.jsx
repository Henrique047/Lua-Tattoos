import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Search, Image as Img } from 'lucide-react'
import { supabase, brl } from '../lib/supabase'
import Modal from './Modal'

const vazio = { nome: '', tipo: '', material: '', tamanho: '', local: '', valor_compra: 0, valor_venda: 0, comissao_tipo: 'percentual', comissao_valor: 0, quantidade: 0, imagem_url: '' }
const MAT = ['Aço', 'Titânio'], LOCAIS = ['Nariz', 'Sobrancelha', 'Umbigo', 'Orelha']

export default function Estoque() {
  const [itens, setItens] = useState([]), [q, setQ] = useState(''), [f, setF] = useState({ material: '', local: '', tipo: '' })
  const [form, setForm] = useState(null), [qtd, setQtd] = useState(null), [add, setAdd] = useState(0), [up, setUp] = useState(false)
  const carregar = async () => { const { data } = await supabase.from('joias').select('*').order('nome'); setItens(data || []) }
  useEffect(() => { carregar() }, [])
  const tipos = [...new Set(itens.map(i => i.tipo).filter(Boolean))]
  const vis = useMemo(() => itens.filter(i => (!q || i.nome.toLowerCase().includes(q.toLowerCase())) && Object.entries(f).every(([k, v]) => !v || i[k] === v)), [itens, q, f])
  const set = (k, v) => setForm(x => ({ ...x, [k]: v }))
  const salvar = async e => {
    e.preventDefault(); const { id, created_at, ...d } = form
    Object.keys(d).forEach(k => d[k] === '' && !['nome'].includes(k) && (d[k] = null)); d.valor_compra ||= 0; d.valor_venda ||= 0; d.comissao_valor ||= 0; d.quantidade ||= 0
    const { error } = id ? await supabase.from('joias').update(d).eq('id', id) : await supabase.from('joias').insert(d)
    if (error) return alert(error.message); setForm(null); carregar()
  }
  const foto = async file => { if (!file) return; setUp(true)
    const p = `${crypto.randomUUID()}.${file.name.split('.').pop()}`; const { error } = await supabase.storage.from('joias').upload(p, file)
    if (!error) set('imagem_url', supabase.storage.from('joias').getPublicUrl(p).data.publicUrl); setUp(false) }
  const entrada = async e => { e.preventDefault(); await supabase.from('joias').update({ quantidade: qtd.quantidade + Number(add) }).eq('id', qtd.id); setQtd(null); setAdd(0); carregar() }
  const remover = async i => { if (confirm(`Remover “${i.nome}” e zerar o estoque?`)) { await supabase.from('joias').delete().eq('id', i.id); carregar() } }
  const Thumb = ({ i, s = 48 }) => i.imagem_url ? <img src={i.imagem_url} alt={i.nome} className="thumb" style={{ width: s, height: s }} /> : <span className="thumb" style={{ width: s, height: s }}><Img size={18} /></span>

  return (
    <section>
      <div className="row between wrap"><h2>Estoque</h2><button className="btn primary" onClick={() => setForm(vazio)}><Plus size={18} />Adicionar</button></div>
      <div className="row wrap filtros">
        <label className="busca"><Search size={16} /><input placeholder="Buscar por nome" value={q} onChange={e => setQ(e.target.value)} /></label>
        <select value={f.material} onChange={e => setF({ ...f, material: e.target.value })}><option value="">Material</option>{MAT.map(m => <option key={m}>{m}</option>)}</select>
        <select value={f.local} onChange={e => setF({ ...f, local: e.target.value })}><option value="">Local</option>{LOCAIS.map(m => <option key={m}>{m}</option>)}</select>
        <select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}><option value="">Tipo</option>{tipos.map(m => <option key={m}>{m}</option>)}</select>
      </div>
      <div className="card lista">
        {vis.length === 0 && <p className="muted pad">Nenhum item encontrado. Adicione a primeira joia ou ajuste os filtros.</p>}
        {vis.map(i => (
          <div className="linha" key={i.id}>
            <Thumb i={i} />
            <button className={'qtd' + (i.quantidade <= 2 ? ' baixo' : '')} onClick={() => setQtd(i)} title="Dar entrada">{i.quantidade}</button>
            <strong className="nome">{i.nome}</strong>
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
          <label className="full">Nome<input required value={form.nome} onChange={e => set('nome', e.target.value)} /></label>
          <label>Tipo<input value={form.tipo || ''} onChange={e => set('tipo', e.target.value)} placeholder="Argola, labret…" /></label>
          <label>Tamanho<input value={form.tamanho || ''} onChange={e => set('tamanho', e.target.value)} placeholder="8mm" /></label>
          <label>Material<select value={form.material || ''} onChange={e => set('material', e.target.value)}><option value="">Opcional</option>{MAT.map(m => <option key={m}>{m}</option>)}</select></label>
          <label>Local de aplicação<select value={form.local || ''} onChange={e => set('local', e.target.value)}><option value="">Opcional</option>{LOCAIS.map(m => <option key={m}>{m}</option>)}</select></label>
          <label>Valor de compra<input type="number" step="0.01" min="0" value={form.valor_compra} onChange={e => set('valor_compra', e.target.value)} /></label>
          <label>Valor de venda<input type="number" step="0.01" min="0" value={form.valor_venda} onChange={e => set('valor_venda', e.target.value)} /></label>
          <div className="full"><div className="seg">
            {['percentual', 'valor'].map(t => <button type="button" key={t} className={form.comissao_tipo === t ? 'on' : ''} onClick={() => set('comissao_tipo', t)}>{t === 'percentual' ? 'Ganho em %' : 'Ganho em R$'}</button>)}</div>
            <label>Ganho da profissional<input type="number" step="0.01" min="0" value={form.comissao_valor} onChange={e => set('comissao_valor', e.target.value)} /></label></div>
          <label>Quantidade<input type="number" min="0" value={form.quantidade} onChange={e => set('quantidade', e.target.value)} /></label>
          <label>Imagem<input type="file" accept="image/*" onChange={e => foto(e.target.files[0])} />{up && <small>Enviando…</small>}</label>
          <div className="row end full"><button type="button" className="btn ghost" onClick={() => setForm(null)}>Cancelar</button><button className="btn primary">Salvar</button></div>
        </form></Modal>}
    </section>)
}
