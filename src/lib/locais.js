import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

// Lista de locais de aplicação (editável pelo usuário). Cada joia guarda só o NOME do local,
// então excluir um local da lista não altera joias, vendas nem relatórios já existentes.
export function useLocais() {
  const [locais, setLocais] = useState([])
  const carregar = useCallback(async () => {
    const { data } = await supabase.from('locais').select('*').order('nome')
    setLocais((data || []).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))
  }, [])
  useEffect(() => { carregar() }, [carregar])

  // devolve { nome } em caso de sucesso ou { erro }
  const adicionar = async texto => {
    const nome = String(texto || '').trim().replace(/\s+/g, ' ')
    if (!nome) return { erro: 'Digite o nome do local.' }
    const igual = locais.find(l => l.nome.toLowerCase() === nome.toLowerCase())
    if (igual) return { nome: igual.nome }                       // já existe: só seleciona
    const { error } = await supabase.from('locais').insert({ nome })
    if (error) return { erro: error.code === '23505' ? 'Este local já existe.' : error.message }
    await carregar(); return { nome }
  }
  const remover = async l => {
    const { error } = await supabase.from('locais').delete().eq('id', l.id)
    if (error) return { erro: error.message }
    await carregar(); return {}
  }
  return { locais, adicionar, remover }
}
