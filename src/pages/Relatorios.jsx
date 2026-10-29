import { useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts'
import { supabase, brl } from '../lib/supabase'

const mes = () => { const d = new Date(); return [new Date(d.getFullYear(), d.getMonth(), 1), d].map(x => x.toLocaleDateString('sv')) }
export default function Relatorios() {
  const [dados, setDados] = useState([]), [ini, setIni] = useState(mes()[0]), [fim, setFim] = useState(mes()[1])
  const [f, setF] = useState({ servico: '', material: '', local: '', tipo: '' }), [agrupar, setAgrupar] = useState('dia')
  useEffect(() => { supabase.from('agendamentos').select('*, joias(nome,material,local,tipo)').eq('status', 'concluido').order('concluido_em', { ascending: false }).then(({ data }) => setDados(data || [])) }, [])
  const vis = useMemo(() => dados.filter(a => { const d = a.concluido_em.slice(0, 10)
    return d >= ini && d <= fim && (!f.servico || a.servico === f.servico) && ['material', 'local', 'tipo'].every(k => !f[k] || a.joias?.[k] === f[k]) }), [dados, ini, fim, f])
  const fat = a => Number(a.valor_total) - Number(a.desconto), luc = a => fat(a) - Number(a.custo_joia)
  const soma = fn => vis.reduce((s, a) => s + fn(a), 0)
  const chave = a => agrupar === 'dia' ? new Date(a.concluido_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : (agrupar === 'servico' ? a.servico : a.joias?.[agrupar]) || 'Sem informação'
  const graf = useMemo(() => { const m = {}; [...vis].reverse().forEach(a => { const k = chave(a); m[k] ||= { k, Faturamento: 0, Lucro: 0, 'A receber': 0 }
    m[k].Faturamento += fat(a); m[k].Lucro += luc(a); m[k]['A receber'] += Number(a.comissao) }); return Object.values(m) }, [vis, agrupar])
  const opc = k => [...new Set(dados.map(a => a.joias?.[k]).filter(Boolean))]
  const KPI = [['Faturamento', soma(fat)], ['Lucro (cobrado − custo)', soma(luc)], ['A receber da piercer', soma(a => Number(a.comissao))]]
  return (
    <section>
      <h2>Relatórios</h2>
      <div className="row wrap filtros">
        <label>De<input type="date" value={ini} onChange={e => setIni(e.target.value)} /></label>
        <label>Até<input type="date" value={fim} onChange={e => setFim(e.target.value)} /></label>
        <label>Serviço<select value={f.servico} onChange={e => setF({ ...f, servico: e.target.value })}><option value="">Todos</option><option value="tatuagem">Tatuagem</option><option value="piercing">Piercing</option></select></label>
        {['material', 'local', 'tipo'].map(k => <label key={k}>{k[0].toUpperCase() + k.slice(1)}<select value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })}><option value="">Todos</option>{opc(k).map(o => <option key={o}>{o}</option>)}</select></label>)}
      </div>
      <div className="kpis">{KPI.map(([t, v]) => <div className="card kpi" key={t}><span className="muted">{t}</span><strong>{brl(v)}</strong></div>)}
        <div className="card kpi"><span className="muted">Atendimentos</span><strong>{vis.length}</strong></div></div>
      <div className="card">
        <div className="row between wrap"><h3>Resultado</h3>
          <label className="inline">Agrupar por<select value={agrupar} onChange={e => setAgrupar(e.target.value)}>
            {[['dia', 'Dia'], ['servico', 'Serviço'], ['material', 'Material'], ['local', 'Local'], ['tipo', 'Tipo de joia']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label></div>
        <div style={{ height: 300 }}><ResponsiveContainer><BarChart data={graf}><CartesianGrid stroke="#3a2f38" vertical={false} /><XAxis dataKey="k" stroke="#a89aa5" /><YAxis stroke="#a89aa5" />
          <Tooltip formatter={v => brl(v)} contentStyle={{ background: '#221b21', border: '1px solid #3a2f38', borderRadius: 10 }} /><Legend />
          <Bar dataKey="Faturamento" fill="#d4859f" radius={[6, 6, 0, 0]} /><Bar dataKey="Lucro" fill="#8d7bc4" radius={[6, 6, 0, 0]} /><Bar dataKey="A receber" fill="#e6c3a3" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
      </div>
      <div className="card tabela"><h3>Histórico de atendimentos</h3>
        {vis.length === 0 && <p className="muted">Nenhum atendimento concluído neste filtro.</p>}
        {vis.length > 0 && <div className="scroll"><table><thead><tr><th>Data</th><th>Cliente</th><th>Serviço</th><th>Joia</th><th>Cobrado</th><th>Lucro</th><th>A receber</th></tr></thead><tbody>
          {vis.map(a => <tr key={a.id}><td>{new Date(a.concluido_em).toLocaleDateString('pt-BR')}</td><td>{a.cliente_nome}</td><td>{a.servico}</td><td>{a.joias?.nome || '–'}</td><td>{brl(fat(a))}</td><td>{brl(luc(a))}</td><td>{brl(a.comissao)}</td></tr>)}</tbody></table></div>}
      </div>
    </section>)
}
