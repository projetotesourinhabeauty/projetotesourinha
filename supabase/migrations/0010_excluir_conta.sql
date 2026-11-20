-- Exclusão de conta pelo próprio usuário (exigência da Apple e da LGPD).
-- Apaga o login e o perfil (e, em cascata, agendamentos, favoritos, inscrições, currículo,
-- candidaturas, avisos e aparelhos). O cadastro profissional, se houver, sai do app
-- e perde os dados de contato, mas o histórico de atendimentos de outros clientes é mantido.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Entre na sua conta para excluí-la';
  end if;
  update public.professionals
     set active = false, phone = null, avatar_url = null, bio = ''
   where profile_id = v_uid;
  delete from auth.users where id = v_uid;
end $$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
