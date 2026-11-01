import { useId, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLocais } from '../lib/locais'

export const MAT = ['Aço', 'Titânio']
export const joiaVazia = { nome: '', tipo: '', material: '', tamanho: '', local: '', valor_compra: 0, valor_venda: 0, comissao_tipo: 'percentual', comissao_valor: 0, quantidade: 0, imagem_url: '' }

// Local de aplicação: lista editável. O botão "+" abre um campo para escrever um local novo
// e mostra os locais cadastrados, cada um com um X para excluir.
function LocalSelect({ value, onChange }) {
  const id = useId(), { locais, adicionar, remover } = useLocais()
  const [gerir, setGerir] = useState(false), [novo, setNovo] = useState(''), [erro, setErro] = useState('')
  const nomes = [...new Set([...locais.map(l => l.nome), ...(value ? [value] : [])])]   // mantém o local atual mesmo se já saiu da lista

  const add = async () => {
    setErro(''); const r = await adicionar(novo)
    if (r.erro) return setErro(r.erro)
    setNovo(''); onChange(r.nome)                                                       // já deixa o novo local selecionado
  }
  const excluir = async l => {
    if (!confirm(`Excluir o local “${l.nome}” da lista? As joias que já usam esse local continuam com ele.`)) return
    setErro(''); const r = await remover(l)
    if (r.erro) return setErro(r.erro)
    if (value === l.nome) onChange('')
  }
  return (<>
    <div className="campo-local">
      <label htmlFor={id}>Local de aplicação</label>
      <div className="select-mais">
        <select id={id} value={value || ''} onChange={e => onChange(e.target.value)}><option value="">Opcional</option>{nomes.map(m => <option key={m}>{m}</option>)}</select>
        <button type="button" className={'icon-btn' + (gerir ? ' ativo' : '')} aria-label="Adicionar ou excluir locais" title="Adicionar ou excluir locais" onClick={() => { setGerir(g => !g); setErro('') }}>{gerir ? <X size={18} /> : <Plus size={18} />}</button>
      </div>
    </div>
    {gerir && <div className="full local-gerir">
      <div className="local-add">
        <input value={novo} placeholder="Novo local (Língua, Septo…)" maxLength={40} onChange={e => setNovo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <button type="button" className="btn primary" onClick={add}><Plus size={16} />Adicionar</button>
      </div>
      {erro && <small className="erro">{erro}</small>}
      {locais.length === 0 ? <small className="muted">Nenhum local cadastrado ainda.</small> :
        <div className="local-chips">{locais.map(l => <span className="chip-local" key={l.id}>{l.nome}
          <button type="button" aria-label={`Excluir local ${l.nome}`} onClick={() => excluir(l)}><X size={14} /></button></span>)}</div>}
    </div>}
  </>)
}

// Campos do cadastro de joia. Usado no Estoque e nas Encomendas (mesmo formulário, nada duplicado).
export function JoiaCampos({ form, set, quantidade = true }) {
  const [up, setUp] = useState(false)
  const foto = async file => {
    if (!file) return; setUp(true)
    const p = `${crypto.randomUUID()}.${file.name.split('.').pop()}`
    const { error } = await supabase.storage.from('joias').upload(p, file)
    if (!error) set('imagem_url', supabase.storage.from('joias').getPublicUrl(p).data.publicUrl)
    setUp(false)
  }
  return (<>
    <label className="full">Nome<input required value={form.nome} onChange={e => set('nome', e.target.value)} /></label>
    <label>Tipo<input value={form.tipo || ''} onChange={e => set('tipo', e.target.value)} placeholder="Argola, labret…" /></label>
    <label>Tamanho<input value={form.tamanho || ''} onChange={e => set('tamanho', e.target.value)} placeholder="8mm" /></label>
    <label>Material<select value={form.material || ''} onChange={e => set('material', e.target.value)}><option value="">Opcional</option>{MAT.map(m => <option key={m}>{m}</option>)}</select></label>
    <LocalSelect value={form.local} onChange={v => set('local', v)} />
    <label>Valor de compra<input type="number" step="0.01" min="0" value={form.valor_compra} onChange={e => set('valor_compra', e.target.value)} /></label>
    <label>Valor de venda<input type="number" step="0.01" min="0" value={form.valor_venda} onChange={e => set('valor_venda', e.target.value)} /></label>
    <div className="full"><div className="seg">
      {['percentual', 'valor'].map(t => <button type="button" key={t} className={form.comissao_tipo === t ? 'on' : ''} onClick={() => set('comissao_tipo', t)}>{t === 'percentual' ? 'Ganho em %' : 'Ganho em R$'}</button>)}</div>
      <label>Ganho da profissional<input type="number" step="0.01" min="0" value={form.comissao_valor} onChange={e => set('comissao_valor', e.target.value)} /></label></div>
    {quantidade && <label>Quantidade<input type="number" min="0" value={form.quantidade} onChange={e => set('quantidade', e.target.value)} /></label>}
    <label>Imagem<input type="file" accept="image/*" onChange={e => foto(e.target.files[0])} />{up && <small>Enviando…</small>}{form.imagem_url && !up && <small className="money">Imagem anexada ✓</small>}</label>
  </>)
}
