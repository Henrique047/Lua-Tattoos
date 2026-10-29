create extension if not exists btree_gist;
create table joias(
 id uuid primary key default gen_random_uuid(), nome text not null, tipo text, material text, tamanho text, local text,
 valor_compra numeric not null default 0, valor_venda numeric not null default 0,
 comissao_tipo text not null default 'percentual' check (comissao_tipo in ('percentual','valor')),
 comissao_valor numeric not null default 0, quantidade int not null default 0, imagem_url text, created_at timestamptz default now());
create table agendamentos(
 id uuid primary key default gen_random_uuid(), servico text not null check (servico in ('tatuagem','piercing')),
 cliente_nome text not null, telefone text, joia_id uuid references joias(id) on delete set null,
 inicio timestamptz not null, fim timestamptz not null check (fim > inicio),
 valor_total numeric not null default 0, sinal numeric not null default 0, desconto numeric not null default 0, observacoes text,
 status text not null default 'agendado' check (status in ('agendado','concluido','cancelado')),
 concluido_em timestamptz, custo_joia numeric not null default 0, comissao numeric not null default 0,
 created_at timestamptz default now(),
 -- impede dois agendamentos do MESMO serviço sobrepostos; serviços diferentes podem coincidir
 exclude using gist (servico with =, tstzrange(inicio, fim) with &&) where (status <> 'cancelado'));
create or replace function concluir_atendimento(p_id uuid) returns void language plpgsql as $$
declare a agendamentos; j joias; cst numeric := 0; com numeric := 0;
begin
 select * into a from agendamentos where id = p_id and status = 'agendado' for update;
 if not found then raise exception 'Agendamento não encontrado ou já finalizado'; end if;
 if a.joia_id is not null then
  select * into j from joias where id = a.joia_id for update;
  if j.quantidade < 1 then raise exception 'Joia sem estoque'; end if;
  update joias set quantidade = quantidade - 1 where id = j.id;
  cst := j.valor_compra;
  com := case when j.comissao_tipo = 'percentual' then (a.valor_total - a.desconto - cst) * j.comissao_valor / 100 else j.comissao_valor end;
 end if;
 update agendamentos set status='concluido', concluido_em=now(), custo_joia=cst, comissao=com where id = p_id;
end $$;
alter table joias enable row level security; alter table agendamentos enable row level security;
create policy "admin joias" on joias for all to authenticated using (true) with check (true);
create policy "admin agend" on agendamentos for all to authenticated using (true) with check (true);
insert into storage.buckets (id, name, public) values ('joias','joias',true);
create policy "upload joias" on storage.objects for insert to authenticated with check (bucket_id = 'joias');
