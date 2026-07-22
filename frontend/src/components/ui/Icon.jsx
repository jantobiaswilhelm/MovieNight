import {
  Home,
  Film,
  Star,
  List,
  LineChart,
  Trophy,
  Rss,
  FolderOpen,
  User,
  Bookmark,
  Plus,
  Play,
  Pause,
  Check,
  X,
  Search,
  Bell,
  Calendar,
  Megaphone,
  ChevronDown,
  LogOut,
  Terminal,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Settings,
  Heart,
  MessageCircle,
  Share2,
  Trash2,
  Pencil,
  Clock,
  MapPin,
  Users,
  Eye,
  EyeOff,
  MoreHorizontal,
} from 'lucide-react';

const REGISTRY = {
  home:      Home,
  film:      Film,
  star:      Star,
  list:      List,
  chart:     LineChart,
  trophy:    Trophy,
  feed:      Rss,
  folder:    FolderOpen,
  user:      User,
  users:     Users,
  bookmark:  Bookmark,
  plus:      Plus,
  play:      Play,
  pause:     Pause,
  check:     Check,
  close:     X,
  search:    Search,
  bell:      Bell,
  calendar:  Calendar,
  megaphone: Megaphone,
  chevron:   ChevronDown,
  'chevron-up':    ChevronUp,
  'chevron-left':  ChevronLeft,
  'chevron-right': ChevronRight,
  'arrow-left':    ArrowLeft,
  'arrow-right':   ArrowRight,
  logout:    LogOut,
  terminal:  Terminal,
  settings:  Settings,
  heart:     Heart,
  comment:   MessageCircle,
  share:     Share2,
  trash:     Trash2,
  edit:      Pencil,
  clock:     Clock,
  pin:       MapPin,
  eye:       Eye,
  'eye-off': EyeOff,
  more:      MoreHorizontal,
};

export default function Icon({ name, size = 18, stroke = 1.75, className = '', ...rest }) {
  const LucideIcon = REGISTRY[name];
  if (!LucideIcon) {
    if (import.meta.env?.DEV) console.warn(`<Icon name="${name}" /> not registered`);
    return null;
  }
  return (
    <LucideIcon
      className={className}
      size={size}
      strokeWidth={stroke}
      aria-hidden="true"
      {...rest}
    />
  );
}
