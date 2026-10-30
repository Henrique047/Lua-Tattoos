export const r2 = n => Math.round(n * 100) / 100
const num = v => Number(v || 0)

// Prévia de custo e comissão da piercer. Espelha as funções do banco (concluir_atendimento e registrar_venda).
// itens: [{ joia?, proc?, qtd? }]
// A comissão NÃO muda com desconto (o desconto sai só da parte do estúdio):
//  - em %: joia = (preço de tabela − custo) × %, procedimento = valor cheio × %
//  - em R$: valor fixo (por unidade, na joia)
export function calcular(itens) {
  let custo = 0, lista = 0, comissao = 0
  itens.forEach(i => {
    const q = i.qtd || 1, j = num(i.joia?.valor_venda) * q, c = num(i.joia?.valor_compra) * q
    lista += j + num(i.proc?.valor); custo += c
    if (i.joia) comissao += i.joia.comissao_tipo === 'percentual'
      ? Math.max(j - c, 0) * num(i.joia.comissao_valor) / 100 : num(i.joia.comissao_valor) * q
    if (i.proc) comissao += i.proc.comissao_tipo === 'percentual'
      ? num(i.proc.valor) * num(i.proc.comissao_valor) / 100 : num(i.proc.comissao_valor)
  })
  return { lista: r2(lista), custo: r2(custo), comissao: r2(comissao) }
}