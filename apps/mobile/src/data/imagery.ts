/**
 * Fotos dos apps (Unsplash, licença gratuita para uso comercial, sem necessidade de crédito).
 * São usadas quando o item não tem foto própria: categorias, serviços, capas de cursos,
 * banners e telas de boas-vindas. Foto enviada pelo painel sempre tem prioridade.
 * Profissionais nunca recebem foto de banco de imagens (seria outra pessoa): ficam com iniciais.
 */
const U = (id: string) => (w = 800, h?: number) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&q=75&w=${w}${h ? `&h=${h}` : ''}`;

export const photos = {
  // salão e cabelo
  wash: U('photo-1634449571010-02389ed0f9b0'),
  blowdry: U('photo-1580618672591-eb180b1a973f'),
  styling: U('photo-1774660810725-fb04e002003d'),
  dryer: U('photo-1562322140-8baeececf3df'),
  classBw: U('photo-1647462741268-e5724e5886c0'),
  tools: U('photo-1595475884562-073c30d45670'),
  salonDark: U('photo-1600948836101-f9ffda59d250'),
  salonBright: U('photo-1633681926022-84c23e8cb2d6'),
  // barbearia
  barber: U('photo-1605497788044-5a32c7078486'),
  barberChair: U('photo-1503951914875-452162b0f3f1'),
  barberTools: U('photo-1621605815971-fbc98d665033'),
  // unhas
  manicure: U('photo-1632345031435-8727f6897d53'),
  nailsPink: U('photo-1519014816548-bf5fe059798b'),
  nailPolish: U('photo-1522337660859-02fbefca4702'),
  polishBottles: U('photo-1636019411401-82485711b6ba'),
  // estética e spa
  faceMask: U('photo-1616394584738-fc6e612e71b9'),
  facialSpa: U('photo-1570172619644-dfd03ed5d881'),
  facial: U('photo-1552693673-1bf958298935'),
  faceMassage: U('photo-1741934023052-26baf5535088'),
  stones: U('photo-1600334089648-b0d9d3028eb2'),
  // maquiagem e produtos
  brushes: U('photo-1516975080664-ed2fc6a32937'),
  products: U('photo-1760895535234-2c39c57cf187'),
  productsRed: U('photo-1786737554096-4b22c03ad991'),
};

type Pic = (w?: number, h?: number) => string;

const BY_CATEGORY: Record<string, Pic> = {
  cabelo: photos.blowdry,
  barba: photos.barber,
  estetica: photos.facial,
  unhas: photos.manicure,
  depilacao: photos.facialSpa,
  spa: photos.stones,
  maquiagem: photos.brushes,
  gestao: photos.salonBright,
};

const BY_SERVICE: Record<string, Pic> = {
  's-corte-fem': photos.wash,
  's-corte-masc': photos.barberChair,
  's-coloracao': photos.styling,
  's-escova': photos.dryer,
  's-tratamento': photos.products,
  's-barba': photos.barberTools,
  's-manicure': photos.nailsPink,
  's-facial': photos.faceMask,
  's-sobrancelha': photos.faceMassage,
  's-depilacao': photos.facialSpa,
  's-spa': photos.stones,
  's-make': photos.brushes,
};

const COURSE_BY_CATEGORY: Record<string, Pic> = {
  cabelo: photos.classBw,
  barba: photos.barberChair,
  estetica: photos.facial,
  unhas: photos.nailPolish,
  depilacao: photos.facialSpa,
  spa: photos.faceMassage,
  maquiagem: photos.brushes,
  gestao: photos.salonBright,
};

const PRODUCT_BY_CATEGORY: Record<string, Pic> = {
  cabelo: photos.products,
  unhas: photos.polishBottles,
  pele: photos.productsRed,
  ferramentas: photos.tools,
  maquiagem: photos.brushes,
};

const norm = (s?: string) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const categoryPhoto = (categoryId: string, w = 300) => (BY_CATEGORY[categoryId] ?? photos.salonBright)(w, w);

export const servicePhoto = (s: { id?: string; slug?: string; categoryId: string }, w = 600, h?: number) =>
  (BY_SERVICE[s.slug ?? ''] ?? BY_SERVICE[s.id ?? ''] ?? BY_CATEGORY[s.categoryId] ?? photos.salonBright)(w, h);

export const courseCover = (c: { coverUrl?: string; categoryId: string }, w = 800, h?: number) =>
  c.coverUrl ?? (COURSE_BY_CATEGORY[c.categoryId] ?? photos.salonBright)(w, h);

export const productPhoto = (p: { imageUrl?: string; category: string }, w = 500) =>
  p.imageUrl ?? PRODUCT_BY_CATEGORY[norm(p.category)]?.(w, w);

/** Capa do perfil do profissional: tema da especialidade principal. */
export const professionalCover = (categoryIds: string[], w = 1000, h = 520) => (BY_CATEGORY[categoryIds[0] ?? ''] ?? photos.salonDark)(w, h);

export const heroPhotos = {
  welcomeClient: photos.blowdry,
  welcomePro: photos.barber,
  homeBanner: photos.salonDark,
  shop: photos.products,
  association: photos.classBw,
  jobs: photos.salonBright,
};
