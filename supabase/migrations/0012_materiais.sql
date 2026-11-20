-- Apostilas em PDF dos cursos: bucket público "materiais" (só o admin envia).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('materiais', 'materiais', true, 31457280, array['application/pdf'])
on conflict (id) do nothing;

create policy "materiais_admin_envia" on storage.objects
  for insert to authenticated with check (bucket_id = 'materiais' and public.is_admin());
create policy "materiais_admin_atualiza" on storage.objects
  for update to authenticated using (bucket_id = 'materiais' and public.is_admin());
create policy "materiais_admin_remove" on storage.objects
  for delete to authenticated using (bucket_id = 'materiais' and public.is_admin());
