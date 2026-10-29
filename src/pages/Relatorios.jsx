import { useCallback, useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LabelList } from 'recharts'
import { RefreshCw } from 'lucide-react'
import { supabase, brl } from '../lib/supabase'

const iso = d => d.toLocaleDateString('sv') // AAAA-MM-DD na data LOCAL
const PERIODOS = {
  'Hoje': () => [iso(new Date()), iso(new Date())],
  '7 dias': () => { const d = new Date(); d.setDate(d.getDate() - 6); return [iso(d), iso(new Date())] },
  'Este mês': () => { const d = new Date(); return [iso(new Date(d.getFullYear(), d.getMonth(), 1)), iso(d)] },
  'Mês passado': () => { const d = new Date(); return [iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), iso(new Date(d.getFullYear(), d.getMonth(), 0))] },
}
const GRUPOS = [['dia', 'Dia'], ['servico', 'Serviço'], ['material', 'Material'], ['local', 'Local'], ['tipo', 'Tipo de joia']]
const METRICAS = [['faturamento', 'Faturamento'], ['lucro', 'Lucro'], ['receber', 'A receber da piercer']]
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s
const curto = v => v >= 1000 ? (v / 1000).toFixed(1).replace('.0', '') + 'k' : v
const fat = a => Number(a.valor_total) - Number(a.desconto)   // o que o cliente realmente pagou
const luc = a => fat(a) - Number(a.custo_joia)                // pago − custo da joia

export default function Relatorios() {
  const [dados, setDados] = useState([]), [carregando, setCarregando] = useState(true), [erro, setErro] = useState('')
  const [[ini, fim], setPeriodo] = useState(PERIODOS['Este mês']())
  const [f, setF] = useState({ servico: '', material: '', local: '', tipo: '' })
  const [agrupar, setAgrupar] = useState('dia'), [metrica, setMetrica] = useState('faturamento')

  const carregar = useCallback(async () => {
    setCarregando(true)
    const { data, error } = await supabase.from('agendamentos').select('*, joias(nome,material,local,tipo)')
      .eq('status', 'concluido').not('concluido_em', 'is', null).order('concluido_em', { ascending: false })
    setErro(error ? error.message : ''); setDados(data || []); setCarregando(false)
  }, [])
  useEffect(() => {
    carregar()
    const volta = () => document.visibilityState === 'visible' && carregar() // atualiza ao voltar para a aba/app
    document.addEventListener('visibilitychange', volta); return () => document.removeEventListener('visibilitychange', volta)
  }, [carregar])

  // filtros: tudo é recalculado na hora, sem recarregar a página
  const vis = useMemo(() => dados.filter(a => {
    const d = iso(new Date(a.concluido_em))
    return d >= ini && d <= fim && (!f.servico || a.servico === f.servico) &&
      ['material', 'local', 'tipo'].every(k => !f[k] || a.joias?.[k] === f[k])
  }), [dados, ini, fim, f])

  const soma = fn => vis.reduce((s, a) => s + fn(a), 0)
  const total = { faturamento: soma(fat), lucro: soma(luc), receber: soma(a => Number(a.comissao)) }

  const grupos = useMemo(() => {
    const m = new Map()
    vis.forEach(a => {
      let k, label
      if (agrupar === 'dia') { k = iso(new Date(a.concluido_em)); label = `${k.slice(8)}/${k.slice(5, 7)}` }
      else { label = agrupar === 'servico' ? cap(a.servico) : (a.joias?.[agrupar] || 'Sem joia'); k = label }
      const g = m.get(k) || { k, label, n: 0, faturamento: 0, lucro: 0, receber: 0 }
      g.n++; g.faturamento += fat(a); g.lucro += luc(a); g.receber += Number(a.comissao); m.set(k, g)
    })
    const arr = [...m.values()]
    return agrupar === 'dia' ? arr.sort((x, y) => x.k.localeCompare(y.k)) : arr.sort((x, y) => y[metrica] - x[metrica])
  }, [vis, agrupar, metrica])

  const opc = k => [...new Set(dados.map(a => a.joias?.[k]).filter(Boolean))]
  const horiz = agrupar !== 'dia'                        // categorias em barras horizontais (rótulos legíveis no celular)
  const altura = horiz ? Math.max(200, grupos.length * 54 + 30) : 300
  const nomeMetrica = METRICAS.find(([v]) => v === metrica)[1]
  const limpar = () => setF({ servico: '', material: '', local: '', tipo: '' })
  const filtrando = Object.values(f).some(Boolean)

  return (
    <section>
      <div className="row between wrap"><h2>Relatórios</h2>
        <button className="btn ghost" onClick={carregar} disabled={carregando}><RefreshCw size={16} />{carregando ? 'Atualizando…' : 'Atualizar'}</button></div>
      {erro && <p className="erro">Não foi possível carregar: {erro}</p>}

      <div className="chips">{Object.keys(PERIODOS).map(p =>
        <button key={p} className={'chip' + (PERIODOS[p]().join() === [ini, fim].join() ? ' on' : '')} onClick={() => setPeriodo(PERIODOS[p]())}>{p}</button>)}</div>
      <div className="row wrap filtros">
        <label>De<input type="date" value={ini} max={fim} onChange={e => setPeriodo([e.target.value, fim])} /></label>
        <label>Até<input type="date" value={fim} min={ini} onChange={e => setPeriodo([ini, e.target.value])} /></label>
        <label>Serviço<select value={f.servico} onChange={e => setF({ ...f, servico: e.target.value })}><option value="">Todos</option><option value="tatuagem">Tatuagem</option><option value="piercing">Piercing</option></select></label>
        {['material', 'local', 'tipo'].map(k => <label key={k}>{cap(k)}<select value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })}><option value="">Todos</option>{opc(k).map(o => <option key={o}>{o}</option>)}</select></label>)}
      </div>
      <p className="muted nota">Os filtros de material, local e tipo consideram apenas atendimentos com joia (piercings).{filtrando && <> <button className="link" onClick={limpar}>Limpar filtros</button></>}</p>

      <div className="kpis">
        <div className="card kpi"><span className="muted">Faturamento</span><strong>{brl(total.faturamento)}</strong></div>
        <div className="card kpi"><span className="muted">Lucro (cobrado − custo da joia)</span><strong>{brl(total.lucro)}</strong></div>
        <div className="card kpi"><span className="muted">A receber da piercer</span><strong>{brl(total.receber)}</strong></div>
        <div className="card kpi"><span className="muted">Atendimentos</span><strong>{vis.length}</strong></div>
      </div>

      <div className="card">
        <h3>Resultado</h3>
        <div className="ctrl">
          <div><small className="muted">Mostrar</small>
            <div className="seg rolar">{METRICAS.map(([v, l]) => <button type="button" key={v} className={metrica === v ? 'on' : ''} onClick={() => setMetrica(v)}>{l}</button>)}</div></div>
          <div><small className="muted">Agrupar por</small>
            <div className="seg rolar">{GRUPOS.map(([v, l]) => <button type="button" key={v} className={agrupar === v ? 'on' : ''} onClick={() => setAgrupar(v)}>{l}</button>)}</div></div>
        </div>

        {vis.length === 0 ? <p className="muted pad">Nenhum atendimento concluído neste filtro.</p> :
          <div className="grafico" style={{ height: altura }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart key={`${agrupar}-${metrica}`} data={grupos} layout={horiz ? 'vertical' : 'horizontal'} margin={{ top: 18, right: horiz ? 76 : 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#3a2f38" vertical={!horiz} horizontal={horiz ? false : true} />
                {horiz ? <XAxis type="number" hide /> : <XAxis dataKey="label" stroke="#a89aa5" tick={{ fontSize: 12 }} interval="preserveStartEnd" />}
                {horiz ? <YAxis type="category" dataKey="label" width={92} stroke="#a89aa5" tick={{ fontSize: 12 }} /> : <YAxis stroke="#a89aa5" width={44} tick={{ fontSize: 12 }} tickFormatter={curto} />}
                <Tooltip formatter={v => brl(v)} cursor={{ fill: 'rgba(255,255,255,.05)' }} contentStyle={{ background: '#221b21', border: '1px solid #3a2f38', borderRadius: 10 }} />
                <Bar dataKey={metrica} name={nomeMetrica} fill="#d4859f" radius={horiz ? [0, 6, 6, 0] : [6, 6, 0, 0]} isAnimationActive={false}>
                  {(horiz || grupos.length <= 8) && <LabelList dataKey={metrica} position={horiz ? 'right' : 'top'} formatter={brl} fill="#f2eaf0" fontSize={12} />}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>}
      </div>

      {vis.length > 0 && <div className="card tabela"><h3>Resumo por {GRUPOS.find(([v]) => v === agrupar)[1].toLowerCase()}</h3>
        <div className="scroll"><table><thead><tr><th>Grupo</th><th>Atend.</th><th>Faturamento</th><th>Lucro</th><th>A receber</th></tr></thead><tbody>
          {grupos.map(g => <tr key={g.k}><td>{g.label}</td><td>{g.n}</td><td>{brl(g.faturamento)}</td><td>{brl(g.lucro)}</td><td>{brl(g.receber)}</td></tr>)}
          <tr className="tot"><td>Total</td><td>{vis.length}</td><td>{brl(total.faturamento)}</td><td>{brl(total.lucro)}</td><td>{brl(total.receber)}</td></tr></tbody></table></div></div>}

      <div className="card tabela"><h3>Histórico de atendimentos</h3>
        {vis.length === 0 && <p className="muted">Nenhum atendimento concluído neste filtro.</p>}
        {vis.length > 0 && <div className="scroll"><table><thead><tr><th>Data</th><th>Cliente</th><th>Serviço</th><th>Joia</th><th>Cobrado</th><th>Lucro</th><th>A receber</th></tr></thead><tbody>
          {vis.map(a => <tr key={a.id}><td>{new Date(a.concluido_em).toLocaleDateString('pt-BR')}</td><td>{a.cliente_nome}</td><td>{cap(a.servico)}</td><td>{a.joias?.nome || '–'}</td><td>{brl(fat(a))}</td><td>{brl(luc(a))}</td><td>{brl(a.comissao)}</td></tr>)}</tbody></table></div>}
      </div>
    </section>)
}