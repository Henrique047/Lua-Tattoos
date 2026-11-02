import { useEffect, useRef, useState } from 'react'
import { Search, ChevronDown } from 'lucide-react'
import { brl } from '../lib/supabase'

// sem diferenciar maiúsculas, minúsculas nem acentos
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
// o que está livre de verdade (se a tela informar `disponivel`, desconta o que já está em agendamentos)
const estoqueTxt = j => {
  const d = j.disponivel ?? j.quantidade, c = j.comprometidas || 0
  if (d > 0) return `${d} disponível${d > 1 ? 'is' : ''}${c ? ` · ${c} em agendamento${c > 1 ? 's' : ''}` : ''}`
  return j.quantidade > 0 ? `${j.quantidade} em estoque, já em agendamento` : 'sem estoque'
}
const texto = j => [j.nome, j.tipo, j.tamanho, j.material, j.local].filter(Boolean).join(' · ')

// Um campo só: clique para ver a lista completa ou digite para filtrar (todas as palavras precisam aparecer).
// Setas ↑ ↓ navegam, Enter escolhe, Esc fecha.
export default function JoiaBusca({ joias, valor, onChange }) {
  const [q, setQ] = useState(''), [aberto, setAberto] = useState(false), [idx, setIdx] = useState(0)
  const inputRef = useRef(null), listaRef = useRef(null)
  const sel = joias.find(j => j.id === valor)
  const termos = norm(q).split(/\s+/).filter(Boolean)
  const lista = joias.filter(j => { const t = norm(texto(j)); return termos.every(x => t.includes(x)) })

  useEffect(() => { listaRef.current?.children[idx]?.scrollIntoView({ block: 'nearest' }) }, [idx, aberto])
  const escolher = j => { onChange(j.id); setAberto(false); setQ(''); inputRef.current?.blur() }
  const teclas = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAberto(true); setIdx(i => Math.min(i + 1, Math.max(lista.length - 1, 0))) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (aberto && lista[idx]) escolher(lista[idx]) }   // não envia o formulário
    else if (e.key === 'Escape') { setAberto(false); inputRef.current?.blur() }
  }

  return (
    <div className="busca-joia">
      <div className={'busca-campo' + (aberto ? ' on' : '')}>
        <Search size={16} />
        <input ref={inputRef} autoComplete="off" role="combobox" aria-expanded={aberto}
          value={aberto ? q : (sel ? texto(sel) : '')}
          placeholder={aberto && sel ? texto(sel) : 'Clique para ver as joias ou digite para buscar'}
          onFocus={() => { setAberto(true); setQ(''); setIdx(0) }} onClick={() => setAberto(true)}
          onChange={e => { setQ(e.target.value); setAberto(true); setIdx(0) }} onBlur={() => setAberto(false)} onKeyDown={teclas} />
        <ChevronDown size={16} className="busca-seta" onMouseDown={e => { e.preventDefault(); aberto ? inputRef.current?.blur() : inputRef.current?.focus() }} />
      </div>
      {aberto && <ul className="busca-lista" role="listbox" ref={listaRef}>
        {lista.length === 0 && <li className="vazio">Nenhuma joia encontrada para “{q}”.</li>}
        {lista.map((j, i) => (
          <li key={j.id} role="option" aria-selected={j.id === valor} className={(i === idx ? 'ativo ' : '') + (j.id === valor ? 'sel' : '')}
            onMouseDown={e => { e.preventDefault(); escolher(j) }} onMouseEnter={() => setIdx(i)}>
            <span className="bl-nome"><b>{j.nome}</b><small className="muted">{[j.tipo, j.tamanho, j.material, j.local].filter(Boolean).join(' · ') || '–'}</small></span>
            <span className="bl-meta"><b>{brl(j.valor_venda)}</b><small className={(j.disponivel ?? j.quantidade) > 0 ? 'money' : 'muted'}>{estoqueTxt(j)}</small></span>
          </li>))}
      </ul>}
    </div>)
}
