# Publicação na App Store e no Google Play

São dois apps: **Tesourinha Beauty** (cliente, pasta `apps/mobile`, id `br.org.tesourinha.beauty`) e
**Tesourinha Pro** (profissional, pasta `apps/pro`, id `br.org.tesourinha.pro`). Os builds são feitos na nuvem pelo
**EAS (Expo)**, sem precisar de Mac. A configuração já está em `eas.json` de cada app.

## 1. Contas (feitas pelo cliente, em nome da Associação)
| Conta | Custo | Observação |
|---|---|---|
| Apple Developer Program (como **organização**) | US$ 99/ano | Exige **D-U-N-S** da Associação (gratuito, leva alguns dias) |
| Google Play Console (como **organização**) | US$ 25 uma vez | Exige CNPJ e verificação de identidade |
| Expo (expo.dev) | gratuito | Criar uma organização "tesourinha" e convidar o desenvolvedor |

## 2. Primeiro build (desenvolvedor)
```bash
npm i -g eas-cli
eas login
cd apps/mobile && eas init      # grava o projectId no app.json (necessário para o push)
eas build --platform all --profile production
eas submit --platform all       # envia para App Store Connect e Play Console
# repetir em apps/pro (rodar antes: node scripts/sync-shared.mjs)
```
Para testar no Android antes das lojas: `eas build -p android --profile preview` gera um APK para instalar direto.

## 3. Itens que as lojas pedem (já prontos)
- Política de Privacidade: https://tesourinhabeauty1.vercel.app/privacidade/
- Termos de Uso: https://tesourinhabeauty1.vercel.app/termos/
- Exclusão de conta dentro do app (cliente: Perfil › Notificações › Excluir minha conta; Pro: Perfil › Excluir minha conta)
- Ícones, splash e textos de permissão (fotos, câmera, notificações)

## 4. Itens a preparar na ficha da loja
- Nome, subtítulo, descrição curta e longa, palavras-chave, categoria (Estilo de vida / Beleza)
- Screenshots (iPhone 6,7" e 6,5"; Android telefone), ícone 1024×1024
- E-mail e telefone de suporte, URL de suporte (pode ser o site)
- **Conta de teste para a Apple** (cliente e profissional aprovado), informada em "App Review Information"
- Questionário de privacidade (App Store) e "Segurança dos dados" (Google Play): coletamos nome, e-mail, telefone,
  foto (profissional), histórico de agendamentos e token de push; nada é vendido nem usado para anúncios.
