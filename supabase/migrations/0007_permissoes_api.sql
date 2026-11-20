-- Tesourinha Beauty · permissões da API (Data API)
-- Projetos novos do Supabase não liberam mais as tabelas do schema public para os papéis da API
-- automaticamente. Quem decide o que cada um vê continua sendo o RLS (políticas das migrações anteriores).

grant usage on schema public to anon, authenticated;

-- Visitante (sem login): só leitura do catálogo público.
grant select on public.categories, public.services, public.professionals, public.professional_services,
  public.working_hours, public.reviews, public.courses, public.jobs to anon;

-- Usuário logado: acesso às tabelas, sempre filtrado pelas políticas de RLS.
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Views públicas (já liberadas nas migrações 0002/0003; repetido por segurança).
grant select on public.professional_busy_slots, public.professional_days_off, public.course_enrollment_counts to anon, authenticated;

-- Tabelas criadas no futuro por migrações já nascem liberadas para usuários logados (RLS continua valendo).
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
