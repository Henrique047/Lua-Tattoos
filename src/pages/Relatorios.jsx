import { useCallback, useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LabelList } from 'recharts'
import { RefreshCw, Trash2, ChevronRight } from 'lucide-react'
import { supabase, brl } from '../lib/supabase'
import { categoria, rotulo } from '../lib/pagamentos'
import Modal from './Modal'

const iso = d => d.toLocaleDateString('sv') // AAAA-MM-DD na data LOCAL
const PERIODOS = {
  'Hoje': () => [iso(new Date()), iso(new Date())],
  '7 dias': () => { const d = new Date(); d.setDate(d.getDate() - 6); return [iso(d), iso(new Date())] },
  'Este mês': () => { const d = new Date(); return [iso(new Date(d.getFullYear(), d.getMonth(), 1)), iso(d)] },
  'Mês passado': () => { const d = new Date(); return [iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), iso(new Date(d.getFullYear(), d.getMonth(), 0))] },
}
const SERV = { tatuagem: 'Tatuagem', piercing: 'Piercing', venda: 'Venda de joias', sinal: 'Sinal retido', devolucao: 'Sinal devolvido' }
const COR = { tatuagem: '#c9708f', piercing: '#8d7bc4', venda: '#6fcf97', sinal: '#e0b04a', devolucao: '#e5707e' }
const FORMAS = ['Dinheiro', 'PIX', 'Débito', 'Crédito à vista', 'Crédito parcelado']
const GRUPOS = [['dia', 'Dia'], ['servico', 'Serviço'], ['forma', 'Forma de pagamento'], ['material', 'Material'], ['local', 'Local'], ['tipo', 'Tipo de joia']]
const METRICAS = [['bruto', 'Valor bruto'], ['taxa', 'Taxas'], ['liquido', 'Valor líquido'], ['resultado', 'Resultado após custos'], ['comissao', 'Comissão da piercer'], ['estudio', 'Parte do estúdio']]
const SOMAS = ['bruto', 'taxa', 'liquido', 'custo', 'resultado', 'comissao', 'estudio']
const zeros = () => Object.fromEntries(SOMAS.map(k => [k, 0]))
const curto = v => v >= 1000 ? (v / 1000).toFixed(1).replace('.0', '') + 'k' : v
const dataHora = d => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// cada linha = uma joia e/ou procedimento de um atendimento, ou um item de venda
const linhaDe = it => ({
  valor: Number(it.valor), custo: Number(it.custo), comissao: Number(it.comissao),
  material: it.material, local: it.local, tipo: it.tipo,
  joia: it.joia_nome ? `${it.joia_nome}${it.joia_tamanho ? ' ' + it.joia_tamanho : ''}${it.qtd > 1 ? ` ×${it.qtd}` : ''}` : null, proc: it.proc_nome || null
})
const pagDe = p => ({ fase: p.fase, tipo: p.tipo, parcelas: p.parcelas, valor: Number(p.valor), pct: Number(p.taxa_pct), taxa: Number(p.taxa_valor), liquido: Number(p.liquido), cat: categoria(p.tipo, p.parcelas) })

export default function Relatorios() {
  const [raw, setRaw] = useState({ a: [], v: [], s: [] }), [carregando, setCarregando] = useState(true), [erro, setErro] = useState('')
  const [[ini, fim], setPeriodo] = useState(PERIODOS['Este mês']())
  const [f, setF] = useState({ servico: '', forma: '', material: '', local: '', tipo: '' })
  const [agrupar, setAgrupar] = useState('dia'), [metrica, setMetrica] = useState('bruto')
  const [det, setDet] = useState(null), [del, setDel] = useState(null), [devolver, setDevolver] = useState(true), [excluindo, setExcluindo] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const [a, v, s] = await Promise.all([
      supabase.from('agendamentos').select('*, agendamento_itens(*), pagamentos(*)').eq('status', 'concluido').not('concluido_em', 'is', null),
      supabase.from('vendas').select('*, venda_itens(*), pagamentos(*)'),
      supabase.from('sinais_encerrados').select('*, pagamentos(*)')])
    setErro(a.error?.message || v.error?.message || s.error?.message || ''); setRaw({ a: a.data || [], v: v.data || [], s: s.data || [] }); setCarregando(false)
  }, [])
  useEffect(() => {
    carregar()
    const volta = () => document.visibilityState === 'visible' && carregar() // atualiza ao voltar para a aba/app
    document.addEventListener('visibilitychange', volta); return () => document.removeEventListener('visibilitychange', volta)
  }, [carregar])

  // junta atendimentos, vendas e sinais de encomenda numa lista única de registros
  const registros = useMemo(() => [
    ...raw.a.map(x => ({
      kind: 'atendimento', id: x.id, servico: x.servico, data: x.concluido_em, cliente: x.cliente_nome, ext: x, pags: (x.pagamentos || []).map(pagDe),
      linhas: x.agendamento_itens.length ? x.agendamento_itens.map(linhaDe)
        : [{ valor: Number(x.valor_total) - Number(x.desconto), custo: Number(x.custo_joia), comissao: Number(x.comissao) }] })),
    ...raw.v.map(x => ({ kind: 'venda', id: x.id, servico: 'venda', data: x.created_at, cliente: x.cliente_nome, ext: x, pags: (x.pagamentos || []).map(pagDe), linhas: x.venda_itens.map(linhaDe) })),
    ...raw.s.map(x => ({ kind: x.tipo === 'retido' ? 'sinal' : 'devolucao', id: x.id, servico: x.tipo === 'retido' ? 'sinal' : 'devolucao', info: x.tipo !== 'retido',
      data: x.created_at, cliente: x.cliente_nome, ext: x, pags: (x.pagamentos || []).map(pagDe),
      linhas: [{ valor: Number(x.valor), custo: 0, comissao: 0, joia: x.joia_desc || null, proc: null }] }))
  ], [raw])

  // Cada "célula" = uma linha de item × uma forma de pagamento do mesmo registro.
  // O valor do item é repartido pelas formas na proporção do que foi pago em cada uma; a taxa de cada forma é repartida pelos itens.
  // Assim todos os filtros e agrupamentos (dia, serviço, forma, material...) fecham com o mesmo total.
  const celulas = useMemo(() => {
    const out = []
    registros.forEach(r => {
      if (r.info) return                                       // sinal devolvido não é receita
      const dia = iso(new Date(r.data))
      if (dia < ini || dia > fim || (f.servico && r.servico !== f.servico)) return
      const G = r.linhas.reduce((s, l) => s + l.valor, 0)
      const pags = r.pags.length ? r.pags : [{ valor: G, taxa: 0, cat: 'Não informado', tipo: 'nao_informado', parcelas: 1 }]
      const P = pags.reduce((s, p) => s + p.valor, 0)
      r.linhas.forEach(l => {
        if (!['material', 'local', 'tipo'].every(k => !f[k] || l[k] === f[k])) return
        pags.forEach(p => {
          if (f.forma && p.cat !== f.forma) return
          const wp = P > 0 ? p.valor / P : 1 / pags.length, wl = G > 0 ? l.valor / G : 1 / r.linhas.length
          const bruto = l.valor * wp, taxa = p.taxa * wl, custo = l.custo * wp, comissao = l.comissao * wp
          out.push({ r, l, p, dia, bruto, taxa, custo, comissao, liquido: bruto - taxa, resultado: bruto - taxa - custo, estudio: bruto - taxa - custo - comissao })
        })
      })
    })
    return out
  }, [registros, ini, fim, f])

  const total = useMemo(() => celulas.reduce((t, c) => { SOMAS.forEach(k => { t[k] += c[k] }); return t }, zeros()), [celulas])
  const nRegistros = useMemo(() => new Set(celulas.map(c => c.r.kind + c.r.id)).size, [celulas])

  const grupos = useMemo(() => {
    const m = new Map()
    celulas.forEach(c => {
      let k, label
      if (agrupar === 'dia') { k = c.dia; label = `${k.slice(8)}/${k.slice(5, 7)}` }
      else if (agrupar === 'servico') { label = SERV[c.r.servico]; k = label }
      else if (agrupar === 'forma') { label = c.p.cat; k = label }
      else { label = c.l[agrupar] || 'Sem joia'; k = label }
      const g = m.get(k) || { k, label, ids: new Set(), ...zeros() }
      g.ids.add(c.r.kind + c.r.id); SOMAS.forEach(s => { g[s] += c[s] }); m.set(k, g)
    })
    const arr = [...m.values()].map(g => ({ ...g, n: g.ids.size }))
    return agrupar === 'dia' ? arr.sort((x, y) => x.k.localeCompare(y.k)) : arr.sort((x, y) => y[metrica] - x[metrica])
  }, [celulas, agrupar, metrica])

  // quanto entrou em cada forma de pagamento (respeita os filtros)
  const porForma = useMemo(() => {
    const m = { Dinheiro: zeros(), PIX: zeros(), 'Débito': zeros(), 'Crédito': zeros(), 'Não informado': zeros() }
    celulas.forEach(c => { const k = c.p.cat.startsWith('Crédito') ? 'Crédito' : c.p.cat; SOMAS.forEach(s => { m[k][s] += c[s] }) })
    return m
  }, [celulas])

  // histórico: um registro por linha (os valores já consideram os filtros ativos)
  const historico = useMemo(() => {
    const m = new Map()
    celulas.forEach(c => { const k = c.r.kind + c.r.id; const h = m.get(k) || { r: c.r, ...zeros() }; SOMAS.forEach(s => { h[s] += c[s] }); m.set(k, h) })
    const arr = [...m.values()]
    const semFiltroItem = !f.material && !f.local && !f.tipo && !f.forma
    registros.filter(r => r.info && semFiltroItem && (!f.servico || f.servico === 'devolucao')).forEach(r => {
      const dia = iso(new Date(r.data)); if (dia >= ini && dia <= fim) arr.push({ r, ...zeros(), bruto: r.linhas[0].valor })
    })
    return arr.sort((x, y) => y.r.data.localeCompare(x.r.data))
  }, [celulas, registros, f, ini, fim])
  const devolvidoTotal = historico.filter(h => h.r.info).reduce((s, h) => s + h.bruto, 0)

  const opc = k => [...new Set(registros.flatMap(r => r.linhas.map(l => l[k])).filter(Boolean))]
  const horiz = agrupar !== 'dia'                        // categorias em barras horizontais (rótulos legíveis no celular)
  const altura = horiz ? Math.max(200, grupos.length * 54 + 30) : 300
  const nomeMetrica = METRICAS.find(([v]) => v === metrica)[1]
  const limpar = () => setF({ servico: '', forma: '', material: '', local: '', tipo: '' })
  const filtrando = Object.values(f).some(Boolean)

  const excluir = async () => {
    const info = del.kind === 'sinal' || del.kind === 'devolucao'
    setExcluindo(true)
    const { error } = info ? await supabase.rpc('excluir_sinal_encerrado', { p_id: del.id })
      : await supabase.rpc(del.kind === 'venda' ? 'excluir_venda' : 'excluir_atendimento', { p_id: del.id, p_devolver: devolver })
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
        <label>Forma de pagamento<select value={f.forma} onChange={e => setF({ ...f, forma: e.target.value })}><option value="">Todas</option>
          {FORMAS.map(o => <option key={o}>{o}</option>)}</select></label>
        {[['material', 'Material'], ['local', 'Local'], ['tipo', 'Tipo de joia']].map(([k, l]) => <label key={k}>{l}<select value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })}><option value="">Todos</option>{opc(k).map(o => <option key={o}>{o}</option>)}</select></label>)}
      </div>
      <p className="muted nota">Os filtros de material, local e tipo consideram só as joias (perfurações e vendas).{filtrando && <> <button className="link" onClick={limpar}>Limpar filtros</button></>}</p>

      <div className="kpis">
        <div className="card kpi"><span className="muted">Valor bruto (pago pelos clientes)</span><strong>{brl(total.bruto)}</strong></div>
        <div className="card kpi"><span className="muted">Taxas das operadoras</span><strong>{brl(total.taxa)}</strong></div>
        <div className="card kpi"><span className="muted">Valor líquido recebido</span><strong>{brl(total.liquido)}</strong></div>
        <div className="card kpi"><span className="muted">Custos dos produtos</span><strong>{brl(total.custo)}</strong></div>
        <div className="card kpi"><span className="muted">Resultado após custos</span><strong>{brl(total.resultado)}</strong></div>
        <div className="card kpi"><span className="muted">Comissão da piercer</span><strong>{brl(total.comissao)}</strong></div>
        <div className="card kpi"><span className="muted">Parte do estúdio</span><strong>{brl(total.estudio)}</strong></div>
        <div className="card kpi"><span className="muted">Atendimentos e vendas</span><strong>{nRegistros}</strong></div>
      </div>
      <p className="muted nota">Líquido = bruto − taxas · Resultado após custos = líquido − custo das joias · Parte do estúdio = resultado − comissão da piercer (descontos saem só daqui).{devolvidoTotal > 0 && <> Sinais devolvidos no período: <b>{brl(devolvidoTotal)}</b> (não entram nos totais).</>}</p>

      <div className="formas-strip">{['Dinheiro', 'PIX', 'Débito', 'Crédito'].map(k => (
        <div className="card kpi mini" key={k}><span className="muted">Recebido em {k}</span><strong>{brl(porForma[k].bruto)}</strong>
          <small className="muted">taxas {brl(porForma[k].taxa)} · líquido {brl(porForma[k].liquido)}</small></div>))}
        {porForma['Não informado'].bruto > 0 && <div className="card kpi mini"><span className="muted">Forma não informada</span><strong>{brl(porForma['Não informado'].bruto)}</strong><small className="muted">registros anteriores às formas de pagamento</small></div>}
      </div>

      <div className="card">
        <h3>Resultado</h3>
        <div className="ctrl">
          <div><small className="muted">Mostrar</small>
            <div className="seg rolar">{METRICAS.map(([v, l]) => <button type="button" key={v} className={metrica === v ? 'on' : ''} onClick={() => setMetrica(v)}>{l}</button>)}</div></div>
          <div><small className="muted">Agrupar por</small>
            <div className="seg rolar">{GRUPOS.map(([v, l]) => <button type="button" key={v} className={agrupar === v ? 'on' : ''} onClick={() => setAgrupar(v)}>{l}</button>)}</div></div>
        </div>

        {nRegistros === 0 ? <p className="muted pad">Nada registrado neste filtro.</p> :
          <div className="grafico" style={{ height: altura }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart key={`${agrupar}-${metrica}`} data={grupos} layout={horiz ? 'vertical' : 'horizontal'} margin={{ top: 18, right: horiz ? 76 : 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#3a2f38" vertical={!horiz} horizontal={horiz ? false : true} />
                {horiz ? <XAxis type="number" hide /> : <XAxis dataKey="label" stroke="#a89aa5" tick={{ fontSize: 12 }} interval="preserveStartEnd" />}
                {horiz ? <YAxis type="category" dataKey="label" width={104} stroke="#a89aa5" tick={{ fontSize: 12 }} /> : <YAxis stroke="#a89aa5" width={44} tick={{ fontSize: 12 }} tickFormatter={curto} />}
                <Tooltip formatter={v => brl(v)} cursor={{ fill: 'rgba(255,255,255,.05)' }} contentStyle={{ background: '#221b21', border: '1px solid #3a2f38', borderRadius: 10 }} />
                <Bar dataKey={metrica} name={nomeMetrica} fill="#d4859f" radius={horiz ? [0, 6, 6, 0] : [6, 6, 0, 0]} isAnimationActive={false}>
                  {(horiz || grupos.length <= 8) && <LabelList dataKey={metrica} position={horiz ? 'right' : 'top'} formatter={brl} fill="#f2eaf0" fontSize={12} />}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>}
      </div>

      {nRegistros > 0 && <div className="card tabela"><h3>Resumo por {GRUPOS.find(([v]) => v === agrupar)[1].toLowerCase()}</h3>
        <div className="scroll"><table><thead><tr><th>Grupo</th><th>Registros</th><th>Bruto</th><th>Taxas</th><th>Líquido</th><th>Custos</th><th>Resultado</th><th>Comissão</th><th>Estúdio</th></tr></thead><tbody>
          {grupos.map(g => <tr key={g.k}><td>{g.label}</td><td>{g.n}</td><td>{brl(g.bruto)}</td><td>{brl(g.taxa)}</td><td>{brl(g.liquido)}</td><td>{brl(g.custo)}</td><td>{brl(g.resultado)}</td><td>{brl(g.comissao)}</td><td>{brl(g.estudio)}</td></tr>)}
          <tr className="tot"><td>Total</td><td>{nRegistros}</td><td>{brl(total.bruto)}</td><td>{brl(total.taxa)}</td><td>{brl(total.liquido)}</td><td>{brl(total.custo)}</td><td>{brl(total.resultado)}</td><td>{brl(total.comissao)}</td><td>{brl(total.estudio)}</td></tr></tbody></table></div></div>}

      <div className="card tabela"><h3>Histórico de atendimentos e vendas</h3>
        <p className="muted nota">Clique em uma linha para ver o detalhamento completo.</p>
        {historico.length === 0 && <p className="muted">Nada registrado neste filtro.</p>}
        {historico.length > 0 && <div className="scroll"><table className="clicavel"><thead><tr><th>Data</th><th>Tipo</th><th>Cliente</th><th>Itens</th><th>Bruto</th><th>Taxas</th><th>Resultado</th><th>Comissão</th><th>Estúdio</th><th></th></tr></thead><tbody>
          {historico.map(h => { const r = h.r; return <tr key={r.kind + r.id} className={r.info ? 'info' : ''} onClick={() => setDet(r)}>
            <td>{new Date(r.data).toLocaleDateString('pt-BR')}</td>
            <td><span className="badge" style={{ '--c': COR[r.servico] }}>{SERV[r.servico]}</span></td>
            <td>{r.cliente || '–'}</td>
            <td>{[...new Set(r.linhas.flatMap(l => [l.joia, l.proc].filter(Boolean)))].join(' + ') || '–'}</td>
            <td>{brl(h.bruto)}</td><td>{r.info ? '–' : brl(h.taxa)}</td><td>{r.info ? '–' : brl(h.resultado)}</td><td>{r.info ? '–' : brl(h.comissao)}</td><td>{r.info ? '–' : brl(h.estudio)}</td>
            <td className="acao-linha"><ChevronRight size={16} className="muted" />
              <button className="icon-btn danger" aria-label="Excluir registro" title="Excluir" onClick={e => { e.stopPropagation(); setDevolver(true); setDel(r) }}><Trash2 size={17} /></button></td>
          </tr> })}</tbody></table></div>}
      </div>

      {det && <Modal wide title={{ atendimento: 'Detalhes do atendimento', venda: 'Detalhes da venda', sinal: 'Sinal retido', devolucao: 'Sinal devolvido' }[det.kind]} onClose={() => setDet(null)}>
        <Detalhe r={det} onExcluir={() => { setDevolver(true); setDel(det); setDet(null) }} /></Modal>}

      {del && <Modal title="Excluir registro" onClose={() => setDel(null)}>
        <div className="det">
          <p>Excluir {del.kind === 'venda' ? 'a venda' : del.kind === 'atendimento' ? 'o atendimento' : 'o registro de sinal'} de <b>{del.cliente || 'cliente sem nome'}</b> ({new Date(del.data).toLocaleDateString('pt-BR')})? Ele some dos relatórios e <b>não dá para desfazer</b>.</p>
          {(del.kind === 'venda' || del.kind === 'atendimento') && del.linhas.some(l => l.joia) && <label className="inline"><input type="checkbox" checked={devolver} onChange={e => setDevolver(e.target.checked)} />Devolver as joias ao estoque</label>}
          <div className="row end"><button className="btn ghost" onClick={() => setDel(null)}>Cancelar</button>
            <button className="btn primary" disabled={excluindo} onClick={excluir}><Trash2 size={16} />{excluindo ? 'Excluindo…' : 'Excluir'}</button></div>
        </div></Modal>}
    </section>)
}

// ---------- detalhamento completo de um atendimento / venda / sinal ----------
function Detalhe({ r, onExcluir }) {
  const x = r.ext, G = r.linhas.reduce((s, l) => s + l.valor, 0)
  const taxas = r.pags.reduce((s, p) => s + p.taxa, 0), custo = r.linhas.reduce((s, l) => s + l.custo, 0), com = r.linhas.reduce((s, l) => s + l.comissao, 0)
  const liquido = G - taxas, resultado = liquido - custo
  const hm = d => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return (
    <div className="det">
      <div className="det-tags">
        <span className="badge" style={{ '--c': COR[r.servico] }}>{SERV[r.servico]}</span>
        <span className="badge ghost">{dataHora(r.data)}</span>
        {r.kind === 'atendimento' && <span className="badge ghost">Agendado: {new Date(x.inicio).toLocaleDateString('pt-BR')} · {hm(x.inicio)}–{hm(x.fim)}</span>}
      </div>
      <div className="det-cli"><b>{r.cliente || 'Cliente sem nome'}</b>{x.telefone && <span className="muted"> · {x.telefone}</span>}</div>
      {x.observacoes && <p className="det-line muted">{x.observacoes}</p>}

      <h4>{r.kind === 'venda' ? 'Joias vendidas' : r.kind === 'atendimento' ? 'Joias e procedimentos realizados' : 'Joia da encomenda'}</h4>
      <div className="det-itens">{r.linhas.map((l, i) => (
        <div className="det-item" key={i}>
          <div className="det-item-nome">
            {l.joia && <span><b>Joia:</b> {l.joia}{[l.material, l.local, l.tipo].filter(Boolean).length > 0 && <small className="muted"> ({[l.material, l.local, l.tipo].filter(Boolean).join(' · ')})</small>}</span>}
            {l.proc && <span><b>Procedimento:</b> {l.proc}</span>}
            {!l.joia && !l.proc && <span>{r.servico === 'tatuagem' ? 'Tatuagem' : 'Serviço'}</span>}
          </div>
          <div className="det-item-vals">
            <div><span>Valor cobrado</span><b>{brl(l.valor)}</b></div>
            <div><span>Custo da joia</span><b>{brl(l.custo)}</b></div>
            <div><span>Comissão</span><b className="money">{brl(l.comissao)}</b></div>
          </div>
        </div>))}</div>

      <h4>Valores</h4>
      <div className="vals">
        {r.kind === 'atendimento' && <><div><span>Total de tabela</span><b>{brl(x.valor_total)}</b></div><div><span>Desconto</span><b>{brl(x.desconto)}</b></div><div><span>Sinal</span><b className="money">{brl(x.sinal)}</b></div></>}
        {r.kind === 'venda' && <><div><span>Subtotal</span><b>{brl(x.subtotal)}</b></div><div><span>Desconto</span><b>{brl(x.desconto)}</b></div><div><span>Total cobrado</span><b className="money">{brl(G)}</b></div></>}
        {(r.kind === 'sinal' || r.kind === 'devolucao') && <div><span>Valor do sinal</span><b className="money">{brl(G)}</b></div>}
      </div>

      <h4>Pagamentos</h4>
      {r.pags.length === 0 ? <p className="muted">Pagamento sem forma informada (registro anterior ao controle de formas de pagamento).</p> :
        <div className="scroll"><table><thead><tr><th>Quando</th><th>Forma</th><th>Valor</th><th>Taxa</th><th>Taxa (R$)</th><th>Líquido</th></tr></thead><tbody>
          {r.pags.map((p, i) => <tr key={i}><td>{p.fase === 'sinal' ? 'Sinal' : r.kind === 'venda' ? 'Venda' : 'Restante'}</td><td>{rotulo(p.tipo, p.parcelas)}</td><td>{brl(p.valor)}</td><td>{p.pct.toLocaleString('pt-BR')}%</td><td>{brl(p.taxa)}</td><td>{brl(p.liquido)}</td></tr>)}
        </tbody></table></div>}

      {r.kind !== 'devolucao' && <><h4>Resultado</h4>
        <div className="res-det">
          <div className="res-linha"><span>Valor bruto</span><b>{brl(G)}</b></div>
          <div className="res-linha"><span>− Taxas das operadoras</span><b>{brl(taxas)}</b></div>
          <div className="res-linha"><span>Valor líquido recebido</span><b>{brl(liquido)}</b></div>
          <div className="res-linha"><span>− Custo das joias</span><b>{brl(custo)}</b></div>
          <div className="res-linha total"><span>Resultado após custos</span><b>{brl(resultado)}</b></div>
          <div className="res-linha"><span>− Comissão da piercer</span><b className="money">{brl(com)}</b></div>
          <div className="res-linha total"><span>Parte do estúdio</span><b className="money">{brl(resultado - com)}</b></div>
        </div></>}
      {r.kind === 'devolucao' && <p className="hint">Sinal devolvido ao cliente. Registrado como saída; não entra nos totais de receita.</p>}
      <div className="row end"><button className="btn ghost danger" onClick={onExcluir}><Trash2 size={16} />Excluir registro</button></div>
    </div>)
}
