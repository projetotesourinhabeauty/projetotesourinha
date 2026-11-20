-- Tesourinha Beauty · ajustes apontados pelo Security Advisor do Supabase

-- Funções de gatilho não devem ser chamadas pela API (/rest/v1/rpc/...).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.on_professional_approved() from public, anon, authenticated;
revoke execute on function public.refresh_professional_rating() from public, anon, authenticated;

-- search_path fixo nas funções de proteção (evita sequestro de search_path).
alter function public.protect_profile_role() set search_path = public;
alter function public.protect_professional_fields() set search_path = public;

-- Observação: is_admin() e my_professional_id() continuam executáveis por anon/authenticated
-- porque são usadas nas políticas de RLS. As views professional_busy_slots, professional_days_off
-- e course_enrollment_counts são "security definer" de propósito: expõem só dados agregados/mínimos
-- (horário ocupado, dia de folga, nº de inscritos) de tabelas que são privadas.
