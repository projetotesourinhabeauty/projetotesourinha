// Copia o catálogo compartilhado do app mobile para dentro do painel antes do build/dev.
// Assim o painel compila sozinho (ex.: no Vercel) sem depender do tsconfig/node_modules do mobile.
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const from = fileURLToPath(new URL('../../mobile/src/data/', import.meta.url))
const to = fileURLToPath(new URL('../src/shared/', import.meta.url))
mkdirSync(to, { recursive: true })
// Só os arquivos de dados puros: os demais (remote-catalog, student, points, shop...) dependem
// do cliente Supabase do app e não compilam aqui.
const FILES = ['catalog.ts', 'types.ts', 'icons.ts']
rmSync(to, { recursive: true, force: true })
mkdirSync(to, { recursive: true })
for (const f of FILES) cpSync(from + f, to + f)
console.log('catálogo compartilhado sincronizado em src/shared')
