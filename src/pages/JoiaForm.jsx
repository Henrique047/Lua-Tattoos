import { useState } from 'react'
import { supabase } from '../lib/supabase'

export const MAT = ['Aço', 'Titânio'], LOCAIS = ['Nariz', 'Sobrancelha', 'Umbigo', 'Orelha']
export const joiaVazia = { nome: '', tipo: '', material: '', tamanho: '', local: '', valor_compra: 0, valor_venda: 0, comissao_tipo: 'percentual', comissao_valor: 0, quantidade: 0, imagem_url: '' }

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
    <label>Local de aplicação<select value={form.local || ''} onChange={e => set('local', e.target.value)}><option value="">Opcional</option>{LOCAIS.map(m => <option key={m}>{m}</option>)}</select></label>
    <label>Valor de compra<input type="number" step="0.01" min="0" value={form.valor_compra} onChange={e => set('valor_compra', e.target.value)} /></label>
    <label>Valor de venda<input type="number" step="0.01" min="0" value={form.valor_venda} onChange={e => set('valor_venda', e.target.value)} /></label>
    <div className="full"><div className="seg">
      {['percentual', 'valor'].map(t => <button type="button" key={t} className={form.comissao_tipo === t ? 'on' : ''} onClick={() => set('comissao_tipo', t)}>{t === 'percentual' ? 'Ganho em %' : 'Ganho em R$'}</button>)}</div>
      <label>Ganho da profissional<input type="number" step="0.01" min="0" value={form.comissao_valor} onChange={e => set('comissao_valor', e.target.value)} /></label></div>
    {quantidade && <label>Quantidade<input type="number" min="0" value={form.quantidade} onChange={e => set('quantidade', e.target.value)} /></label>}
    <label>Imagem<input type="file" accept="image/*" onChange={e => foto(e.target.files[0])} />{up && <small>Enviando…</small>}{form.imagem_url && !up && <small className="money">Imagem anexada ✓</small>}</label>
  </>)
}
