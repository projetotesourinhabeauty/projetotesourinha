-- Vitrine da loja: quantos produtos por linha (o admin escolhe 1 ou 2) e destaque de produto.
alter table public.store_settings
  add column if not exists grid_columns int not null default 2 check (grid_columns in (1, 2)),
  add column if not exists banner_title text not null default 'Produtos profissionais para sua beleza',
  add column if not exists banner_subtitle text not null default 'Use seus cupons de pontos. Profissional aprovado compra com desconto.',
  add column if not exists banner_image_url text;

alter table public.products
  add column if not exists featured boolean not null default false;
