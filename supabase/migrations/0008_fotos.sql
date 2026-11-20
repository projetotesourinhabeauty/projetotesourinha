-- Fotos reais: bucket público "fotos" no Supabase Storage.
-- Cada usuário envia só para a própria pasta (<uid>/...); o admin envia para qualquer pasta.
-- Leitura é pela URL pública (bucket público), sem permitir listar arquivos.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "fotos_envio_propria_pasta" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

create policy "fotos_atualiza_propria_pasta" on storage.objects
  for update to authenticated
  using (bucket_id = 'fotos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

create policy "fotos_remove_propria_pasta" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- Foto/capa dos cursos e foto do profissional já existem (courses.cover_url, professionals.avatar_url).
