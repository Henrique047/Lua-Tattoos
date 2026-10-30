import { useCallback, useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LabelList } from 'recharts'
import { RefreshCw, Trash2 } from 'lucide-react'
import { supabase, brl } from '../lib/supabase'
import Modal from './Modal'

const iso = d => d.toLocaleDateString('sv') // AAAA-MM-DD na data LOCAL
const PERIODOS = {
  'Hoje': () => [iso(new Date()), iso(new Date())],
  '7 dias': () => { const d = new Date(); d.setDate(d.getDate() - 6); return [iso(d), iso(new Date())] },
  'Este mês': () => { const d = new Date(); return [iso(new Date(d.getFullYear(), d.getMonth(), 1)), iso(d)] },
  'Mês passado': () => { const d = new Date(); return [iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), iso(new Date(d.getFullYear(), d.getMonth(), 0))] },
}
const SERV = { tatuagem: 'Tatuagem', piercing: 'Piercing', venda: 'Venda de joias' }
const COR = { tatuagem: '#c9708f', piercing: '#8d7bc4', venda: '#6fcf97' }
const GRUPOS = [['dia', 'Dia'], ['servico', 'Serviço'], ['material', 'Material'], ['local', 'Local'], ['tipo', 'Tipo de joia']]
const METRICAS = [['faturamento', 'Faturamento'], ['lucro', 'Lucro'], ['comissao', 'Comissão da piercer']]
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s
const curto = v => v >= 1000 ? (v / 1000).toFixed(1).replace('.0', '') + 'k' : v

// cada linha = uma joia e/ou procedimento de um atendimento, ou um item de venda
const linhaDe = it => ({
  valor: Number(it.valor), custo: Number(it.custo), comissao: Number(it.comissao),
  material: it.material, local: it.local, tipo: it.tipo,
  joia: it.joia_nome ? `${it.joia_nome}${it.joia_tamanho ? ' ' + it.joia_tamanho : ''}${it.qtd > 1 ? ` ×${it.qtd}` : ''}` : null, proc: it.proc_nome || null
})

export default function Relatorios() {
  const [raw, setRaw] = useState({ a: [], v: [] }), [carregando, setCarregando] = useState(true), [erro, setErro] = useState('')
  const [[ini, fim], setPeriodo] = useState(PERIODOS['Este mês']())
  const [f, setF] = useState({ servico: '', material: '', local: '', tipo: '' })
  const [agrupar, setAgrupar] = useState('dia'), [metrica, setMetrica] = useState('faturamento')
  const [del, setDel] = useState(null), [devolver, setDevolver] = useState(true), [excluindo, setExcluindo] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const [a, v] = await Promise.all([
      supabase.from('agendamentos').select('*, agendamento_itens(*)').eq('status', 'concluido').not('concluido_em', 'is', null),
      supabase.from('vendas').select('*, venda_itens(*)')])
    setErro(a.error?.message || v.error?.message || ''); setRaw({ a: a.data || [], v: v.data || [] }); setCarregando(false)
  }, [])
  useEffect(() => {
    carregar()
    const volta = () => document.visibilityState === 'visible' && carregar() // atualiza ao voltar para a aba/app
    document.addEventListener('visibilitychange', volta); return () => document.removeEventListener('visibilitychange', volta)
  }, [carregar])

  // junta atendimentos e vendas numa lista única de registros
  const registros = useMemo(() => [
    ...raw.a.map(x => ({
      kind: 'atendimento', id: x.id, servico: x.servico, data: x.concluido_em, cliente: x.cliente_nome,
      linhas: x.agendamento_itens.length ? x.agendamento_itens.map(linhaDe)
        : [{ valor: Number(x.valor_total) - Number(x.desconto), custo: Number(x.custo_joia), comissao: Number(x.comissao) }] })),
    ...raw.v.map(x => ({ kind: 'venda', id: x.id, servico: 'venda', data: x.created_at, cliente: x.cliente_nome, linhas: x.venda_itens.map(linhaDe) }))
  ], [raw])

  // filtros: tudo é recalculado na hora, sem recarregar a página
  const vis = useMemo(() => registros.map(r => {
    const dia = iso(new Date(r.data))
    if (dia < ini || dia > fim || (f.servico && r.servico !== f.servico)) return null
    const linhas = r.linhas.filter(l => ['material', 'local', 'tipo'].every(k => !f[k] || l[k] === f[k]))
    if (!linhas.length) return null
    const s = fn => linhas.reduce((t, l) => t + fn(l), 0)
    return { ...r, linhas, dia, faturamento: s(l => l.valor), lucro: s(l => l.valor - l.custo), comissao: s(l => l.comissao) }
  }).filter(Boolean).sort((x, y) => y.data.localeCompare(x.data)), [registros, ini, fim, f])

  const total = useMemo(() => vis.reduce((t, r) => ({ faturamento: t.faturamento + r.faturamento, lucro: t.lucro + r.lucro, comissao: t.comissao + r.comissao }),
    { faturamento: 0, lucro: 0, comissao: 0 }), [vis])

  const grupos = useMemo(() => {
    const m = new Map()
    vis.forEach(r => r.linhas.forEach(l => {
      let k, label
      if (agrupar === 'dia') { k = r.dia; label = `${k.slice(8)}/${k.slice(5, 7)}` }
      else { label = agrupar === 'servico' ? SERV[r.servico] : (l[agrupar] || 'Sem joia'); k = label }
      const g = m.get(k) || { k, label, ids: new Set(), faturamento: 0, lucro: 0, comissao: 0 }
      g.ids.add(r.kind + r.id); g.faturamento += l.valor; g.lucro += l.valor - l.custo; g.comissao += l.comissao; m.set(k, g)
    }))
    const arr = [...m.values()].map(g => ({ ...g, n: g.ids.size }))
    return agrupar === 'dia' ? arr.sort((x, y) => x.k.localeCompare(y.k)) : arr.sort((x, y) => y[metrica] - x[metrica])
  }, [vis, agrupar, metrica])

  const opc = k => [...new Set(registros.flatMap(r => r.linhas.map(l => l[k])).filter(Boolean))]
  const horiz = agrupar !== 'dia'                        // categorias em barras horizontais (rótulos legíveis no celular)
  const altura = horiz ? Math.max(200, grupos.length * 54 + 30) : 300
  const nomeMetrica = METRICAS.find(([v]) => v === metrica)[1]
  const limpar = () => setF({ servico: '', material: '', local: '', tipo: '' })
  const filtrando = Object.values(f).some(Boolean)

  const excluir = async () => {
    setExcluindo(true)
    const { error } = await supabase.rpc(del.kind === 'venda' ? 'excluir_venda' : 'excluir_atendimento', { p_id: del.id, p_devolver: devolver })
    setExcluindo(false)
    if (error) return alert(error.message)
    setDel(null); carregar()
  }

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
        <label>Serviço<select value={f.servico} onChange={e => setF({ ...f, servico: e.target.value })}><option value="">Todos</option>
          {Object.entries(SERV).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        {[['material', 'Material'], ['local', 'Local'], ['tipo', 'Tipo de joia']].map(([k, l]) => <label key={k}>{l}<select value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })}><option value="">Todos</option>{opc(k).map(o => <option key={o}>{o}</option>)}</select></label>)}
      </div>
      <p className="muted nota">Os filtros de material, local e tipo consideram só as joias (perfurações e vendas).{filtrando && <> <button className="link" onClick={limpar}>Limpar filtros</button></>}</p>

      <div className="kpis">
        <div className="card kpi"><span className="muted">Faturamento</span><strong>{brl(total.faturamento)}</strong></div>
        <div className="card kpi"><span className="muted">Lucro (cobrado − custo da joia)</span><strong>{brl(total.lucro)}</strong></div>
        <div className="card kpi"><span className="muted">Comissão da piercer</span><strong>{brl(total.comissao)}</strong></div>
        <div className="card kpi"><span className="muted">Atendimentos e vendas</span><strong>{vis.length}</strong></div>
      </div>

      <div className="card">
        <h3>Resultado</h3>
        <div className="ctrl">
          <div><small className="muted">Mostrar</small>
            <div className="seg rolar">{METRICAS.map(([v, l]) => <button type="button" key={v} className={metrica === v ? 'on' : ''} onClick={() => setMetrica(v)}>{l}</button>)}</div></div>
          <div><small className="muted">Agrupar por</small>
            <div className="seg rolar">{GRUPOS.map(([v, l]) => <button type="button" key={v} className={agrupar === v ? 'on' : ''} onClick={() => setAgrupar(v)}>{l}</button>)}</div></div>
        </div>

        {vis.length === 0 ? <p className="muted pad">Nada registrado neste filtro.</p> :
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
        <div className="scroll"><table><thead><tr><th>Grupo</th><th>Registros</th><th>Faturamento</th><th>Lucro</th><th>Comissão</th></tr></thead><tbody>
          {grupos.map(g => <tr key={g.k}><td>{g.label}</td><td>{g.n}</td><td>{brl(g.faturamento)}</td><td>{brl(g.lucro)}</td><td>{brl(g.comissao)}</td></tr>)}
          <tr className="tot"><td>Total</td><td>{vis.length}</td><td>{brl(total.faturamento)}</td><td>{brl(total.lucro)}</td><td>{brl(total.comissao)}</td></tr></tbody></table></div></div>}

      <div className="card tabela"><h3>Histórico de atendimentos e vendas</h3>
        {vis.length === 0 && <p className="muted">Nada registrado neste filtro.</p>}
        {vis.length > 0 && <div className="scroll"><table><thead><tr><th>Data</th><th>Tipo</th><th>Cliente</th><th>Itens</th><th>Cobrado</th><th>Lucro</th><th>Comissão</th><th></th></tr></thead><tbody>
          {vis.map(r => <tr key={r.kind + r.id}>
            <td>{new Date(r.data).toLocaleDateString('pt-BR')}</td>
            <td><span className="badge" style={{ '--c': COR[r.servico] }}>{SERV[r.servico]}</span></td>
            <td>{r.cliente || '–'}</td>
            <td>{[...new Set(r.linhas.flatMap(l => [l.joia, l.proc].filter(Boolean)))].join(' + ') || '–'}</td>
            <td>{brl(r.faturamento)}</td><td>{brl(r.lucro)}</td><td>{brl(r.comissao)}</td>
            <td><button className="icon-btn danger" aria-label="Excluir registro" title="Excluir" onClick={() => { setDevolver(true); setDel(r) }}><Trash2 size={17} /></button></td>
          </tr>)}</tbody></table></div>}
      </div>

      {del && <Modal title="Excluir registro" onClose={() => setDel(null)}>
        <div className="det">
          <p>Excluir {del.kind === 'venda' ? 'a venda' : 'o atendimento'} de <b>{del.cliente || 'cliente sem nome'}</b> ({new Date(del.data).toLocaleDateString('pt-BR')}, {brl(del.faturamento)})? Ele some dos relatórios e <b>não dá para desfazer</b>.</p>
          {del.linhas.some(l => l.joia) && <label className="inline"><input type="checkbox" checked={devolver} onChange={e => setDevolver(e.target.checked)} />Devolver as joias ao estoque</label>}
          <div className="row end"><button className="btn ghost" onClick={() => setDel(null)}>Cancelar</button>
            <button className="btn primary" disabled={excluindo} onClick={excluir}><Trash2 size={16} />{excluindo ? 'Excluindo…' : 'Excluir'}</button></div>
        </div></Modal>}
    </section>)
}