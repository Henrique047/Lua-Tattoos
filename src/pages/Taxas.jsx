import { useEffect, useState } from 'react'
import { Plus, Save, Check, Banknote, QrCode, CreditCard } from 'lucide-react'
import { supabase } from '../lib/supabase'

const SIMPLES = [['dinheiro', 'Dinheiro', Banknote], ['pix', 'PIX', QrCode], ['debito', 'Cartão de débito', CreditCard]]

// Configuração das formas de pagamento e das taxas (cada parcela do crédito tem a sua taxa, como na tabela da maquininha)
export default function Taxas() {
  const [rows, setRows] = useState([]), [busy, setBusy] = useState(false), [ok, setOk] = useState(false), [erro, setErro] = useState('')
  const carregar = async () => {
    const { data, error } = await supabase.from('formas_pagamento').select('*').order('parcelas')
    if (error) setErro(error.message)
    setRows((data || []).map(r => ({ tipo: r.tipo, parcelas: r.parcelas, taxa: String(r.taxa), ativo: r.ativo })))
  }
  useEffect(() => { carregar() }, [])
  const muda = (tipo, parcelas, patch) => { setOk(false); setRows(rs => rs.map(r => r.tipo === tipo && r.parcelas === parcelas ? { ...r, ...patch } : r)) }
  const get = tipo => rows.find(r => r.tipo === tipo && r.parcelas === 1)
  const credito = rows.filter(r => r.tipo === 'credito').sort((a, b) => a.parcelas - b.parcelas)
  const proxima = (credito.at(-1)?.parcelas || 1) + 1
  const addParcela = () => { setOk(false); setRows(rs => [...rs, { tipo: 'credito', parcelas: proxima, taxa: '0', ativo: true }]) }

  const salvar = async () => {
    setErro(''); setOk(false)
    for (const r of rows) { const t = Number(r.taxa); if (r.taxa === '' || Number.isNaN(t) || t < 0 || t >= 100) return setErro('As taxas precisam estar entre 0% e 99,99%.') }
    setBusy(true)
    const { error } = await supabase.from('formas_pagamento').upsert(rows.map(r => ({ tipo: r.tipo, parcelas: r.parcelas, taxa: Number(r.taxa), ativo: r.ativo })), { onConflict: 'tipo,parcelas' })
    setBusy(false)
    if (error) return setErro(error.message)
    setOk(true); carregar()
  }

  const Campo = ({ r }) => (
    <div className="taxa-campos">
      <label className="inline"><input type="checkbox" checked={r.ativo} onChange={e => muda(r.tipo, r.parcelas, { ativo: e.target.checked })} />Ativa</label>
      <label>Taxa (%)<input type="number" inputMode="decimal" step="0.01" min="0" max="99.99" value={r.taxa} disabled={!r.ativo} onChange={e => muda(r.tipo, r.parcelas, { taxa: e.target.value })} /></label>
    </div>)

  return (
    <section>
      <div className="row between wrap"><h2>Pagamentos e taxas</h2>
        <button className="btn primary" onClick={salvar} disabled={busy}><Save size={18} />{busy ? 'Salvando…' : 'Salvar alterações'}</button></div>
      <p className="muted dica">Cadastre as taxas de cada forma de pagamento. Cada venda ou atendimento guarda a taxa da época em que foi feito, então mudar um valor aqui <b>não altera registros anteriores</b>. Formas desativadas não aparecem na hora de cobrar.</p>
      {erro && <p className="erro">{erro}</p>}
      {ok && <p className="ok-msg"><Check size={16} />Taxas salvas.</p>}

      <div className="taxas-grid">
        {SIMPLES.map(([tipo, nome, Icon]) => { const r = get(tipo); return r && (
          <div className="card taxa-card" key={tipo}>
            <h3><Icon size={18} /> {nome}</h3>
            <Campo r={r} />
          </div>) })}
      </div>

      <div className="card taxa-credito">
        <div className="row between wrap"><h3><CreditCard size={18} /> Cartão de crédito</h3>
          <button className="btn ghost" onClick={addParcela} disabled={proxima > 24}><Plus size={16} />Adicionar {proxima}x</button></div>
        <p className="muted dica">Use a tabela da sua operadora: cada parcelamento tem o seu percentual (não é a taxa de 1x multiplicada). Ative só as parcelas que você oferece.</p>
        <div className="scroll"><table><thead><tr><th>Condição</th><th>Taxa (%)</th><th>Ativa</th></tr></thead><tbody>
          {credito.map(r => <tr key={r.parcelas} className={r.ativo ? '' : 'inativa'}>
            <td>{r.parcelas === 1 ? 'À vista' : `${r.parcelas}x`}</td>
            <td><input type="number" inputMode="decimal" step="0.01" min="0" max="99.99" value={r.taxa} disabled={!r.ativo} onChange={e => muda('credito', r.parcelas, { taxa: e.target.value })} /></td>
            <td><input type="checkbox" aria-label={`Ativar ${r.parcelas}x`} checked={r.ativo} onChange={e => muda('credito', r.parcelas, { ativo: e.target.checked })} /></td>
          </tr>)}</tbody></table></div>
      </div>
    </section>)
}
