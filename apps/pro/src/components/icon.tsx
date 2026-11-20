import { Ionicons } from '@expo/vector-icons';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import {
  AlarmClock,
  Award,
  Banknote,
  Bell,
  BriefcaseBusiness,
  Calendar,
  CalendarClock,
  CalendarDays,
  Camera,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  CirclePlus,
  CircleQuestionMark,
  CircleX,
  Clock,
  CloudOff,
  Droplet,
  Eye,
  FileText,
  Flame,
  FlaskConical,
  Gift,
  GraduationCap,
  Hand,
  Heart,
  Hourglass,
  House,
  Inbox,
  Info,
  Leaf,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Moon,
  Navigation,
  Paintbrush,
  Palette,
  PersonStanding,
  Phone,
  Plus,
  Repeat,
  Scissors,
  Search,
  Settings,
  ShieldCheck,
  Smile,
  Sparkles,
  SquarePen,
  Star,
  Tag,
  Trash2,
  TrendingUp,
  Undo2,
  User,
  UserMinus,
  Users,
  Wallet,
  X,
  ArrowRight,
  Send,
  Coffee,
  Pencil,
  Smartphone,
  Minus,
  ScanQrCode,
  CirclePlay,
  Link,
  ExternalLink,
  BookOpen,
  Trophy,
  Keyboard,
  type LucideIcon,
} from 'lucide-react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Platform, View } from 'react-native';

import type { IconName } from '@/data/icons';

export type { IconName };

/**
 * Ícones da plataforma no padrão Apple.
 * - iPhone: SF Symbols (os ícones nativos do iOS), via expo-symbols.
 * - Android e web: Lucide, traço fino e cantos arredondados, no mesmo espírito do SF Symbols.
 * Os nomes seguem os antigos (ex.: 'cut-outline') porque também estão gravados no banco
 * (categorias, serviços, cursos e vagas). "-outline" = contorno; sem sufixo = preenchido.
 */
/** Logotipos de marca continuam com o desenho oficial de cada marca. */
const BRANDS = ['logo-whatsapp', 'logo-apple', 'logo-google', 'logo-instagram'] as const;

type Def = { sf: SFSymbol; lucide: LucideIcon; fill?: boolean };

const def = (sf: string, lucide: LucideIcon, fill = false): Def => ({ sf: sf as SFSymbol, lucide, fill });

const MAP = {
  // navegação e ações
  'chevron-forward': def('chevron.right', ChevronRight),
  'chevron-back': def('chevron.left', ChevronLeft),
  'chevron-up': def('chevron.up', ChevronUp),
  'chevron-down': def('chevron.down', ChevronDown),
  close: def('xmark', X),
  'close-circle': def('xmark.circle.fill', CircleX),
  'close-circle-outline': def('xmark.circle', CircleX),
  checkmark: def('checkmark', Check),
  'checkmark-circle': def('checkmark.circle.fill', CircleCheck),
  'checkmark-done': def('checkmark.circle', CheckCheck),
  add: def('plus', Plus),
  'add-circle-outline': def('plus.circle', CirclePlus),
  'create-outline': def('square.and.pencil', SquarePen),
  'trash-outline': def('trash', Trash2),
  'arrow-undo-outline': def('arrow.uturn.backward', Undo2),
  'repeat-outline': def('arrow.triangle.2.circlepath', Repeat),
  search: def('magnifyingglass', Search),
  'search-outline': def('magnifyingglass', Search),
  'log-out-outline': def('rectangle.portrait.and.arrow.right', LogOut),
  'settings-outline': def('gearshape', Settings),
  'navigate-outline': def('location.north', Navigation),

  // abas
  home: def('house.fill', House, true),
  'home-outline': def('house', House),
  person: def('person.fill', User, true),
  'person-outline': def('person', User),
  'person-remove': def('person.badge.minus', UserMinus),
  people: def('person.2.fill', Users, true),
  'people-outline': def('person.2', Users),
  heart: def('heart.fill', Heart, true),
  'heart-outline': def('heart', Heart),
  star: def('star.fill', Star, true),
  'star-outline': def('star', Star),
  calendar: def('calendar', Calendar),
  'calendar-outline': def('calendar', Calendar),
  'calendar-clear-outline': def('calendar', CalendarDays),
  today: def('calendar.badge.clock', CalendarClock),
  'today-outline': def('calendar.badge.clock', CalendarClock),
  cash: def('banknote.fill', Banknote),
  'cash-outline': def('banknote', Banknote),
  wallet: def('wallet.pass.fill', Wallet),
  'wallet-outline': def('wallet.pass', Wallet),
  cut: def('scissors', Scissors),
  'cut-outline': def('scissors', Scissors),
  school: def('graduationcap.fill', GraduationCap),
  'school-outline': def('graduationcap', GraduationCap),
  briefcase: def('briefcase.fill', BriefcaseBusiness),
  'briefcase-outline': def('briefcase', BriefcaseBusiness),

  // conteúdo
  sparkles: def('sparkles', Sparkles),
  'sparkles-outline': def('sparkles', Sparkles),
  notifications: def('bell.fill', Bell, true),
  'notifications-outline': def('bell', Bell),
  'mail-outline': def('envelope', Mail),
  'mail-unread-outline': def('envelope.badge', Inbox),
  call: def('phone.fill', Phone, true),
  'call-outline': def('phone', Phone),
  location: def('mappin.and.ellipse', MapPin),
  'location-outline': def('mappin', MapPin),
  time: def('clock.fill', Clock),
  'time-outline': def('clock', Clock),
  alarm: def('alarm.fill', AlarmClock),
  'alarm-outline': def('alarm', AlarmClock),
  'hourglass-outline': def('hourglass', Hourglass),
  ribbon: def('rosette', Award),
  'ribbon-outline': def('rosette', Award),
  'document-text-outline': def('doc.text', FileText),
  'alert-circle': def('exclamationmark.circle.fill', CircleAlert),
  'alert-circle-outline': def('exclamationmark.circle', CircleAlert),
  'information-circle-outline': def('info.circle', Info),
  'help-circle-outline': def('questionmark.circle', CircleQuestionMark),
  'shield-checkmark-outline': def('checkmark.shield', ShieldCheck),
  'lock-closed-outline': def('lock', Lock),
  eye: def('eye.fill', Eye),
  'eye-outline': def('eye', Eye),
  pricetag: def('tag.fill', Tag),
  'pricetag-outline': def('tag', Tag),
  gift: def('gift.fill', Gift),
  'gift-outline': def('gift', Gift),
  camera: def('camera.fill', Camera),
  'camera-outline': def('camera', Camera),
  'trending-up': def('chart.line.uptrend.xyaxis', TrendingUp),
  'cloud-offline-outline': def('icloud.slash', CloudOff),
  moon: def('moon.fill', Moon, true),
  'moon-outline': def('moon', Moon),

  // categorias de serviço (também gravadas no banco)
  'man-outline': def('mustache', PersonStanding),
  'hand-left-outline': def('hand.raised', Hand),
  'leaf-outline': def('leaf', Leaf),
  'water-outline': def('drop', Droplet),
  'color-palette-outline': def('paintpalette', Palette),
  'color-fill-outline': def('paintbrush', Paintbrush),
  'happy-outline': def('face.smiling', Smile),
  'flask-outline': def('flask', FlaskConical),
  'flame-outline': def('flame', Flame),
  'arrow-forward': def('arrow.right', ArrowRight),
  'paper-plane': def('paperplane.fill', Send),
  cafe: def('cup.and.saucer', Coffee),
  create: def('pencil', Pencil),
  'phone-portrait': def('iphone', Smartphone),
  remove: def('minus', Minus),
  'qr-code': def('qrcode.viewfinder', ScanQrCode),
  'play-circle': def('play.circle.fill', CirclePlay),
  link: def('link', Link),
  'open-outline': def('arrow.up.right.square', ExternalLink),
  'book-outline': def('book', BookOpen),
  trophy: def('trophy.fill', Trophy),
  'keypad-outline': def('keyboard', Keyboard),
} satisfies Record<Exclude<IconName, (typeof BRANDS)[number]>, Def>;


const FALLBACK = MAP.sparkles;

export function Icon({
  name,
  size = 24,
  color = '#000',
  weight = 'regular',
  style,
}: {
  name: IconName | (string & {});
  size?: number;
  color?: string;
  /** Peso do traço, como no SF Symbols. */
  weight?: 'light' | 'regular' | 'medium' | 'semibold' | 'bold';
  style?: StyleProp<ViewStyle>;
}) {
  if ((BRANDS as readonly string[]).includes(name)) {
    return <Ionicons name={name as (typeof BRANDS)[number]} size={size} color={color} style={style as never} />;
  }
  const d: Def = (MAP as Record<string, Def>)[name] ?? FALLBACK;

  if (Platform.OS === 'ios') {
    return <SymbolView name={d.sf} size={size} tintColor={color} weight={weight} resizeMode="scaleAspectFit" style={[{ width: size, height: size }, style]} />;
  }
  const L = d.lucide;
  const stroke = { light: 1.5, regular: 1.75, medium: 2, semibold: 2.25, bold: 2.5 }[weight];
  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]} pointerEvents="none">
      <L size={size * 0.92} color={color} strokeWidth={stroke} fill={d.fill ? color : 'none'} absoluteStrokeWidth={false} />
    </View>
  );
}
