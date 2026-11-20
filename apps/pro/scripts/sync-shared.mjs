// Copia do app do cliente (apps/mobile) o design system e o catálogo compartilhados.
// Os arquivos copiados ficam nos mesmos caminhos (src/theme, src/lib, src/data, src/components/*),
// então os imports "@/..." funcionam igual nos dois apps. Edite sempre no apps/mobile.
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const mobile = (p) => fileURLToPath(new URL(`../../mobile/src/${p}`, import.meta.url))
const here = (p) => fileURLToPath(new URL(`../src/${p}`, import.meta.url))

const shared = [
  'theme/index.ts',
  'lib/format.ts',
  'lib/haptics.ts',
  'lib/confirm.ts',
  'lib/supabase.ts',
  'lib/notifications.ts',
  'lib/account.ts',
  'lib/fonts.ts',
  'data/catalog.ts',
  'data/types.ts',
  'data/icons.ts',
  'data/mappers.ts',
  'data/remote-catalog.ts',
  'components/ui.tsx',
  'components/screen.tsx',
  'components/logo.tsx',
  'components/calendar.tsx',
  'components/notices.tsx',
  'components/icon.tsx',
  'components/points-screen.tsx',
  'data/points.ts',
  'components/shop.tsx',
  'data/shop.ts',
  'data/imagery.ts',
]

if (!existsSync(mobile(''))) {
  console.log('apps/mobile não encontrado; usando as cópias já versionadas')
  process.exit(0)
}
for (const file of shared) {
  mkdirSync(here(file.split('/').slice(0, -1).join('/')), { recursive: true })
  cpSync(mobile(file), here(file))
}
console.log(`design system compartilhado sincronizado (${shared.length} arquivos)`)
