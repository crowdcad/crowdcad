/**
 * The app's icons. Same names and props as lucide-react: import from here, not
 * from 'lucide-react' (ESLint flags it).
 *
 * Each icon is Lucide's, plus a sharp compact-mode glyph in the same <svg>.
 * src/styles/ui-style.css shows one or the other from <html data-ui>, so the
 * swap needs no React state and can't mismatch on hydration. The compact
 * glyphs follow the map symbols (components/geo/mapSymbol.tsx): 24px grid,
 * 2px stroke, miter joins, flat ends, square dots, true circles only for round
 * things (wheels, lenses, clock faces, heads, spin arrows).
 */
import React from 'react';
import {
  AlertTriangle as LAlertTriangle,
  Ambulance as LAmbulance,
  ArrowDownWideNarrow as LArrowDownWideNarrow,
  ArrowUp as LArrowUp,
  ArrowRight as LArrowRight,
  Briefcase as LBriefcase,
  BriefcaseMedical as LBriefcaseMedical,
  Building2 as LBuilding2,
  Calendar as LCalendar,
  Check as LCheck,
  CheckCheck as LCheckCheck,
  CheckCircle2 as LCheckCircle2,
  ChevronDown as LChevronDown,
  ChevronLeft as LChevronLeft,
  ChevronRight as LChevronRight,
  ChevronUp as LChevronUp,
  Circle as LCircle,
  CircleHelp as LCircleHelp,
  ClipboardList as LClipboardList,
  Clock as LClock,
  Coffee as LCoffee,
  Copy as LCopy,
  CornerDownLeft as LCornerDownLeft,
  Crosshair as LCrosshair,
  Download as LDownload,
  Edit as LEdit,
  Edit2 as LEdit2,
  ExternalLink as LExternalLink,
  Eye as LEye,
  EyeOff as LEyeOff,
  GraduationCap as LGraduationCap,
  GripVertical as LGripVertical,
  HousePlus as LHousePlus,
  KeyRound as LKeyRound,
  Layers as LLayers,
  Link2Off as LLink2Off,
  ListFilter as LListFilter,
  ListOrdered as LListOrdered,
  Loader2 as LLoader2,
  LocateFixed as LLocateFixed,
  Lock as LLock,
  LockOpen as LLockOpen,
  LogOut as LLogOut,
  Mail as LMail,
  Map as LMap,
  MapPin as LMapPin,
  MapPinned as LMapPinned,
  Maximize2 as LMaximize2,
  Megaphone as LMegaphone,
  Menu as LMenu,
  MessageSquare as LMessageSquare,
  MessageSquareText as LMessageSquareText,
  Minimize2 as LMinimize2,
  Minus as LMinus,
  Moon as LMoon,
  MoreVertical as LMoreVertical,
  MousePointer2 as LMousePointer2,
  MousePointerClick as LMousePointerClick,
  Pencil as LPencil,
  Phone as LPhone,
  Pin as LPin,
  Play as LPlay,
  Plus as LPlus,
  Radio as LRadio,
  Redo2 as LRedo2,
  RefreshCw as LRefreshCw,
  RotateCcw as LRotateCcw,
  RotateCw as LRotateCw,
  Rows2 as LRows2,
  Rows4 as LRows4,
  Search as LSearch,
  Shapes as LShapes,
  Share2 as LShare2,
  ShieldAlert as LShieldAlert,
  ShieldCheck as LShieldCheck,
  Siren as LSiren,
  Smartphone as LSmartphone,
  createLucideIcon,
  SquareArrowOutUpRight as LSquareArrowOutUpRight,
  Sun as LSun,
  Trash2 as LTrash2,
  TriangleAlert as LTriangleAlert,
  Truck as LTruck,
  Undo2 as LUndo2,
  Upload as LUpload,
  UserRound as LUserRound,
  Users as LUsers,
  X as LX,
  ZoomIn as LZoomIn,
  ZoomOut as LZoomOut,
} from 'lucide-react';
import { withCompact } from './compact';

export { Github } from './compact';
export type { LucideIcon, LucideProps } from 'lucide-react';

export const AlertTriangle = withCompact(LAlertTriangle, (
  <>
    <path d="M12 3 L22 20 H2 Z"/>
    <path d="M12 9 V14"/>
    <rect x="11" y="16" width="2" height="2" fill="currentColor" stroke="none"/>
  </>
));
export const Ambulance = withCompact(LAmbulance, (
  <>
    <path d="M4.75 17 H2 V4 H14 V17"/>
    <path d="M8.75 17 H15.75"/>
    <path d="M14 8.5 H18.5 L22 12.5 V17 H19.75"/>
    <path d="M8 7 V13 M5 10 H11"/>
    <circle cx="6.75" cy="17.5" r="2"/>
    <circle cx="17.75" cy="17.5" r="2"/>
  </>
));
export const ArrowDownWideNarrow = withCompact(LArrowDownWideNarrow, (
  <>
    <path d="M7 3 V20"/>
    <path d="M3 16 L7 20 L11 16"/>
    <path d="M14 5 H22 M14 10 H19.5 M14 15 H17"/>
  </>
));
export const ArrowRight = withCompact(LArrowRight, (
  <>
    <path d="M4 12 H19"/>
    <path d="M13 6 L19 12 L13 18"/>
  </>
));
export const ArrowUp = withCompact(LArrowUp, (
  <>
    <path d="M12 20 V5"/>
    <path d="M6 11 L12 5 L18 11"/>
  </>
));
export const Briefcase = withCompact(LBriefcase, (
  <>
    <path d="M2 7 H22 V20 H2 Z"/>
    <path d="M8 7 V4 H16 V7"/>
    <path d="M2 13 H22"/>
  </>
));
export const BriefcaseMedical = withCompact(LBriefcaseMedical, (
  <>
    <path d="M2 7 H22 V20 H2 Z"/>
    <path d="M8 7 V4 H16 V7"/>
    <path d="M12 10 V17 M8.5 13.5 H15.5"/>
  </>
));
export const Building2 = withCompact(LBuilding2, (
  <>
    <path d="M4 22 V2 H14 V22"/>
    <path d="M14 9 H20 V22"/>
    <path d="M2 22 H22"/>
    <rect x="6.5" y="5.5" width="2" height="2" fill="currentColor" stroke="none"/>
    <rect x="9.5" y="5.5" width="2" height="2" fill="currentColor" stroke="none"/>
    <rect x="6.5" y="10" width="2" height="2" fill="currentColor" stroke="none"/>
    <rect x="9.5" y="10" width="2" height="2" fill="currentColor" stroke="none"/>
    <rect x="6.5" y="14.5" width="2" height="2" fill="currentColor" stroke="none"/>
    <rect x="9.5" y="14.5" width="2" height="2" fill="currentColor" stroke="none"/>
    <rect x="16" y="12.5" width="2" height="2" fill="currentColor" stroke="none"/>
    <rect x="16" y="17" width="2" height="2" fill="currentColor" stroke="none"/>
  </>
));
export const Calendar = withCompact(LCalendar, (
  <>
    <path d="M3 5 H21 V21 H3 Z"/>
    <path d="M3 10 H21"/>
    <path d="M8 2 V7 M16 2 V7"/>
  </>
));
export const Check = withCompact(LCheck, (
  <>
    <path d="M4 12.5 L9.5 18 L20 6.5"/>
  </>
));
export const CheckCheck = withCompact(LCheckCheck, (
  <>
    <path d="M2 12 L7 17 L17 6"/>
    <path d="M13 15.5 L15 17.5 L22 10"/>
  </>
));
export const CheckCircle2 = withCompact(LCheckCircle2, (
  <>
    <circle cx="12" cy="12" r="10"/>
    <path d="M7.5 12 L10.5 15 L16.5 9"/>
  </>
));
export const ChevronDown = withCompact(LChevronDown, (
  <>
    <path d="M6 9 L12 15 L18 9"/>
  </>
));
export const ChevronLeft = withCompact(LChevronLeft, (
  <>
    <path d="M15 6 L9 12 L15 18"/>
  </>
));
export const ChevronRight = withCompact(LChevronRight, (
  <>
    <path d="M9 6 L15 12 L9 18"/>
  </>
));
export const ChevronUp = withCompact(LChevronUp, (
  <>
    <path d="M6 15 L12 9 L18 15"/>
  </>
));
export const Circle = withCompact(LCircle, (
  <>
    <circle cx="12" cy="12" r="10"/>
  </>
));
export const CircleHelp = withCompact(LCircleHelp, (
  <>
    <circle cx="12" cy="12" r="10"/>
    <path d="M9 10 V8 L10.5 6.5 H13.5 L15 8 V10 L12 12 V14"/>
    <rect x="11" y="16" width="2" height="2" fill="currentColor" stroke="none"/>
  </>
));
export const ClipboardList = withCompact(LClipboardList, (
  <>
    <path d="M9 4 H5 V22 H19 V4 H15"/>
    <path d="M9 2 H15 V6 H9 Z"/>
    <path d="M12 11 H16 M12 16 H16"/>
    <rect x="8" y="10" width="2" height="2" fill="currentColor" stroke="none"/>
    <rect x="8" y="15" width="2" height="2" fill="currentColor" stroke="none"/>
  </>
));
export const Clock = withCompact(LClock, (
  <>
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 6 V12 H16"/>
  </>
));
export const Coffee = withCompact(LCoffee, (
  <>
    <path d="M4 8 H17 V21 H4 Z"/>
    <path d="M17 10 H21 V16 H17"/>
    <path d="M7.5 2 V5 M10.5 2 V5 M13.5 2 V5"/>
  </>
));
export const Copy = withCompact(LCopy, (
  <>
    <path d="M8 8 H22 V22 H8 Z"/>
    <path d="M16 8 V2 H2 V16 H8"/>
  </>
));
export const CornerDownLeft = withCompact(LCornerDownLeft, (
  <>
    <path d="M20 4 V15 H5"/>
    <path d="M10 10 L5 15 L10 20"/>
  </>
));
export const Crosshair = withCompact(LCrosshair, (
  <>
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 2 V7 M12 17 V22 M2 12 H7 M17 12 H22"/>
  </>
));
export const Download = withCompact(LDownload, (
  <>
    <path d="M12 3 V15"/>
    <path d="M6.5 9.5 L12 15 L17.5 9.5"/>
    <path d="M3 15 V21 H21 V15"/>
  </>
));
export const Edit = withCompact(LEdit, (
  <>
    <path d="M12 3 H3 V21 H21 V12"/>
    <path d="M9 15 V12 L18.5 2.5 L21.5 5.5 L12 15 Z"/>
  </>
));
export const Edit2 = withCompact(LEdit2, (
  <>
    <path d="M3 21 V17 L16 4 L20 8 L7 21 Z"/>
  </>
));
export const ExternalLink = withCompact(LExternalLink, (
  <>
    <path d="M14 3 H21 V10"/>
    <path d="M21 3 L11 13"/>
    <path d="M18 14 V21 H3 V6 H10"/>
  </>
));
export const Eye = withCompact(LEye, (
  <>
    <path d="M2 12 L7 6 H17 L22 12 L17 18 H7 Z"/>
    <circle cx="12" cy="12" r="3"/>
  </>
));
export const EyeOff = withCompact(LEyeOff, (
  <>
    <path d="M10 6 H17 L22 12 L19.5 15"/>
    <path d="M15 18 H7 L2 12 L5 8.5"/>
    <path d="M3 3 L21 21"/>
    <path d="M10.5 9.5 L14.5 13.5"/>
  </>
));
export const GraduationCap = withCompact(LGraduationCap, (
  <>
    <path d="M12 4 L22 9 L12 14 L2 9 Z"/>
    <path d="M6 11 V17 L12 20 L18 17 V11"/>
    <path d="M22 9 V15"/>
  </>
));
export const GripVertical = withCompact(LGripVertical, (
  <>
    <rect x="7.5" y="3.5" width="3" height="3" fill="currentColor" stroke="none"/>
    <rect x="13.5" y="3.5" width="3" height="3" fill="currentColor" stroke="none"/>
    <rect x="7.5" y="10.5" width="3" height="3" fill="currentColor" stroke="none"/>
    <rect x="13.5" y="10.5" width="3" height="3" fill="currentColor" stroke="none"/>
    <rect x="7.5" y="17.5" width="3" height="3" fill="currentColor" stroke="none"/>
    <rect x="13.5" y="17.5" width="3" height="3" fill="currentColor" stroke="none"/>
  </>
));
export const HousePlus = withCompact(LHousePlus, (
  <>
    <path d="M3 10 L12 3 L21 10 V21 H3 Z"/>
    <path d="M12 11 V18 M8.5 14.5 H15.5"/>
  </>
));
export const KeyRound = withCompact(LKeyRound, (
  <>
    <circle cx="15.5" cy="8.5" r="5.5"/>
    <path d="M11.6 12.4 L2.5 21.5"/>
    <path d="M5 19 L7.5 21.5 M7.5 16.5 L9.5 18.5"/>
    <rect x="15.5" y="5.5" width="3" height="3" fill="currentColor" stroke="none"/>
  </>
));
export const Layers = withCompact(LLayers, (
  <>
    <path d="M12 2 L22 7 L12 12 L2 7 Z"/>
    <path d="M2 12 L12 17 L22 12"/>
    <path d="M2 17 L12 22 L22 17"/>
  </>
));
export const Link2Off = withCompact(LLink2Off, (
  <>
    <path d="M9 7 H6 L3 10 V14 L6 17 H9"/>
    <path d="M15 7 H18 L21 10 V14 L19.5 15.5"/>
    <path d="M8 12 H11"/>
    <path d="M2 2 L22 22"/>
  </>
));
export const ListFilter = withCompact(LListFilter, (
  <>
    <path d="M3 6 H21 M7 12 H17 M10 18 H14"/>
  </>
));
export const ListOrdered = withCompact(LListOrdered, (
  <>
    <path d="M10 6 H21 M10 12 H21 M10 18 H21"/>
    <path d="M3 4 H5 V10 M3 10 H7" strokeWidth="1.75"/>
    <path d="M3 13.5 H6.5 V16 H3.5 V18.75 H7" strokeWidth="1.75"/>
  </>
));
export const Loader2 = withCompact(LLoader2, (
  <>
    <path d="M21 12 A9 9 0 1 1 14.78 3.44"/>
  </>
));
export const LocateFixed = withCompact(LLocateFixed, (
  <>
    <circle cx="12" cy="12" r="7"/>
    <rect x="10.5" y="10.5" width="3" height="3" fill="currentColor" stroke="none"/>
    <path d="M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22"/>
  </>
));
export const Lock = withCompact(LLock, (
  <>
    <path d="M4 11 H20 V22 H4 Z"/>
    <path d="M7 11 V5 L9 3 H15 L17 5 V11"/>
  </>
));
export const LockOpen = withCompact(LLockOpen, (
  <>
    <path d="M4 11 H20 V22 H4 Z"/>
    <path d="M7 11 V5 L9 3 H15 L17 5 V7"/>
  </>
));
export const LogOut = withCompact(LLogOut, (
  <>
    <path d="M9 3 H3 V21 H9"/>
    <path d="M16 7 L21 12 L16 17"/>
    <path d="M21 12 H9"/>
  </>
));
export const Mail = withCompact(LMail, (
  <>
    <path d="M2 4 H22 V20 H2 Z"/>
    <path d="M2.5 5 L12 12 L21.5 5"/>
  </>
));
export const Map = withCompact(LMap, (
  <>
    <path d="M2 5 L8 3 L16 6 L22 4 V19 L16 21 L8 18 L2 20 Z"/>
    <path d="M8 3 V18 M16 6 V21"/>
  </>
));
export const MapPin = withCompact(LMapPin, (
  <>
    {/* A half dodecagon over the point: the condensed look's straight lines, still a map pin. */}
    <path d="M5 10 L5.94 6.5 L8.5 3.94 L12 3 L15.5 3.94 L18.06 6.5 L19 10 L12 21 Z"/>
    <rect x="10.5" y="8.5" width="3" height="3" fill="currentColor" stroke="none"/>
  </>
));
export const MapPinned = withCompact(LMapPinned, (
  <>
    <path d="M7 7 L7.67 4.5 L9.5 2.67 L12 2 L14.5 2.67 L16.33 4.5 L17 7 L12 15 Z"/>
    <rect x="11" y="6" width="2" height="2" fill="currentColor" stroke="none"/>
    <path d="M8 17 H4 L2 22 H22 L20 17 H16"/>
  </>
));
export const Maximize2 = withCompact(LMaximize2, (
  <>
    <path d="M15 3 H21 V9"/>
    <path d="M21 3 L14 10"/>
    <path d="M9 21 H3 V15"/>
    <path d="M3 21 L10 14"/>
  </>
));
export const Megaphone = withCompact(LMegaphone, (
  <>
    <path d="M3 8 H9 L20 3 V19 L9 14 H3 Z"/>
    <path d="M9 8 V14"/>
    <path d="M5.5 14 V21 H9 V14"/>
  </>
));
export const Menu = withCompact(LMenu, (
  <>
    <path d="M3 6 H21 M3 12 H21 M3 18 H21"/>
  </>
));
export const MessageSquare = withCompact(LMessageSquare, (
  <>
    <path d="M3 3 H21 V17 H8 L3 21 Z"/>
  </>
));
export const MessageSquareText = withCompact(LMessageSquareText, (
  <>
    <path d="M3 3 H21 V17 H8 L3 21 Z"/>
    <path d="M7 8 H17 M7 12 H13"/>
  </>
));
export const Minimize2 = withCompact(LMinimize2, (
  <>
    <path d="M4 14 H10 V20"/>
    <path d="M10 14 L3 21"/>
    <path d="M20 10 H14 V4"/>
    <path d="M14 10 L21 3"/>
  </>
));
export const Minus = withCompact(LMinus, (
  <>
    <path d="M5 12 H19"/>
  </>
));
export const Moon = withCompact(LMoon, (
  <>
    <path d="M12 3 A6 6 0 0 0 21 12 A9 9 0 1 1 12 3 Z"/>
  </>
));
export const MoreVertical = withCompact(LMoreVertical, (
  <>
    <rect x="10.5" y="3.5" width="3" height="3" fill="currentColor" stroke="none"/>
    <rect x="10.5" y="10.5" width="3" height="3" fill="currentColor" stroke="none"/>
    <rect x="10.5" y="17.5" width="3" height="3" fill="currentColor" stroke="none"/>
  </>
));
export const MousePointer2 = withCompact(LMousePointer2, (
  <>
    <path d="M4 3 L20 10 L13 13 L10 20 Z"/>
  </>
));
export const MousePointerClick = withCompact(LMousePointerClick, (
  <>
    <path d="M9 9 L21 13.5 L15.5 15.5 L13.5 21 Z"/>
    <path d="M7.5 2 V5 M2 7.5 H5 M3.5 3.5 L5.5 5.5 M12.5 3.5 L10.5 5.5 M3.5 12.5 L5.5 10.5"/>
  </>
));
export const Pencil = withCompact(LPencil, (
  <>
    <path d="M3 21 V17 L16 4 L20 8 L7 21 Z"/>
    <path d="M13 7 L17 11"/>
  </>
));
export const Phone = withCompact(LPhone, (
  <>
    <path d="M3 3 H8.5 L10.5 8.5 L8 11 L13 16 L15.5 13.5 L21 15.5 V21 H16 L9.5 18 L6 14.5 L3 8 Z"/>
  </>
));
export const Pin = withCompact(LPin, (
  <>
    <path d="M7 2 H17"/>
    <path d="M9.5 2 V9 L5.5 14 H18.5 L14.5 9 V2"/>
    <path d="M12 14 V22"/>
  </>
));
export const Play = withCompact(LPlay, (
  <>
    <path d="M6 3 L20 12 L6 21 Z"/>
  </>
));
export const Plus = withCompact(LPlus, (
  <>
    <path d="M12 5 V19 M5 12 H19"/>
  </>
));
export const Radio = withCompact(LRadio, (
  <>
    <path d="M8 8 L6 12 L8 16 M16 8 L18 12 L16 16"/>
    <path d="M5 5 L2 12 L5 19 M19 5 L22 12 L19 19"/>
    <rect x="10.5" y="10.5" width="3" height="3" fill="currentColor" stroke="none"/>
  </>
));
export const Redo2 = withCompact(LRedo2, (
  <>
    <path d="M15 14 L20 9 L15 4"/>
    <path d="M20 9 H8 L4 13 V16 L8 20 H13"/>
  </>
));
export const RefreshCw = withCompact(LRefreshCw, (
  <>
    <path d="M3 12 A9 9 0 0 1 18.36 5.64 L21 8.5"/>
    <path d="M21 3 V8.5 H15.5"/>
    <path d="M21 12 A9 9 0 0 1 5.64 18.36 L3 15.5"/>
    <path d="M3 21 V15.5 H8.5"/>
  </>
));
export const RotateCcw = withCompact(LRotateCcw, (
  <>
    <path d="M3 12 A9 9 0 1 0 5.64 5.64 L3 8.5"/>
    <path d="M3 3 V8.5 H8.5"/>
  </>
));
export const RotateCw = withCompact(LRotateCw, (
  <>
    <path d="M21 12 A9 9 0 1 1 18.36 5.64 L21 8.5"/>
    <path d="M21 3 V8.5 H15.5"/>
  </>
));
export const Rows2 = withCompact(LRows2, (
  <>
    <path d="M3 3 H21 V21 H3 Z"/>
    <path d="M3 12 H21"/>
  </>
));
export const Rows4 = withCompact(LRows4, (
  <>
    <path d="M3 3 H21 V21 H3 Z"/>
    <path d="M3 7.5 H21 M3 12 H21 M3 16.5 H21"/>
  </>
));
export const Search = withCompact(LSearch, (
  <>
    <circle cx="10.5" cy="10.5" r="7"/>
    <path d="M15.45 15.45 L21 21"/>
  </>
));
export const Shapes = withCompact(LShapes, (
  <>
    <path d="M12 2 L17 10 H7 Z"/>
    <path d="M3 14 H10 V21 H3 Z"/>
    <circle cx="17.5" cy="17.5" r="3.5"/>
  </>
));
export const Share2 = withCompact(LShare2, (
  <>
    <path d="M15 2 H21 V8 H15 Z"/>
    <path d="M3 9 H9 V15 H3 Z"/>
    <path d="M15 16 H21 V22 H15 Z"/>
    <path d="M9 10 L15 6.5 M9 14 L15 17.5"/>
  </>
));
export const ShieldAlert = withCompact(LShieldAlert, (
  <>
    <path d="M12 2 L20 5 V12 L17 18 L12 22 L7 18 L4 12 V5 Z"/>
    <path d="M12 7.5 V13"/>
    <rect x="11" y="15" width="2" height="2" fill="currentColor" stroke="none"/>
  </>
));
export const ShieldCheck = withCompact(LShieldCheck, (
  <>
    <path d="M12 2 L20 5 V12 L17 18 L12 22 L7 18 L4 12 V5 Z"/>
    <path d="M8.5 12 L11 14.5 L15.5 10"/>
  </>
));
export const Siren = withCompact(LSiren, (
  <>
    <path d="M7 18 V11 L9 8 H15 L17 11 V18"/>
    <path d="M4 18 H20 V21 H4 Z"/>
    <path d="M12 12 V18"/>
    <path d="M12 2 V4.5 M2 12 H4.5 M19.5 12 H22 M4.5 4.5 L6.25 6.25 M19.5 4.5 L17.75 6.25"/>
  </>
));
export const Smartphone = withCompact(LSmartphone, (
  <>
    <path d="M6 2 H18 V22 H6 Z"/>
    <rect x="11" y="17.5" width="2" height="2" fill="currentColor" stroke="none"/>
  </>
));
/**
 * Lucide has no smartphone-off: its smartphone with a slash through it, the outline broken where the slash crosses.
 * The two breaks mirror each other (a half-turn about the center), so neither corner carries more of the outline.
 */
const LSmartphoneOff = createLucideIcon('smartphone-off', [
  ['path', { d: 'M7 2h10a2 2 0 0 1 2 2v12', key: 'top' }],
  ['path', { d: 'M17 22H7a2 2 0 0 1-2-2V8', key: 'bottom' }],
  ['path', { d: 'M12 18h.01', key: 'dot' }],
  ['path', { d: 'm2 2 20 20', key: 'slash' }],
]);
/* Compact: the outline as two filled shapes (the 2px stroke around x 6-18, y 2-22), each cut along a line parallel
   to the slash, so the breaks are sharp diagonals, the same width on both sides. */
export const SmartphoneOff = withCompact(LSmartphoneOff, (
  <>
    <path d="M5 1 H19 V16 L17 14 V3 H7 V4 L5 2 Z" fill="currentColor" stroke="none"/>
    <path d="M5 8 L7 10 V21 H17 V20 L19 22 V23 H5 Z" fill="currentColor" stroke="none"/>
    <rect x="11" y="17.5" width="2" height="2" fill="currentColor" stroke="none"/>
    <path d="M2 2 L22 22"/>
  </>
));
export const SquareArrowOutUpRight = withCompact(LSquareArrowOutUpRight, (
  <>
    <path d="M21 13 V21 H3 V3 H11"/>
    <path d="M15 3 H21 V9"/>
    <path d="M21 3 L12 12"/>
  </>
));
export const Sun = withCompact(LSun, (
  <>
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22 M4.9 4.9 L7 7 M17 17 L19.1 19.1 M4.9 19.1 L7 17 M17 7 L19.1 4.9"/>
  </>
));
export const Trash2 = withCompact(LTrash2, (
  <>
    <path d="M3 6 H21"/>
    <path d="M9 6 V3 H15 V6"/>
    <path d="M5 6 V21 H19 V6"/>
    <path d="M10 10.5 V17 M14 10.5 V17"/>
  </>
));
export const TriangleAlert = withCompact(LTriangleAlert, (
  <>
    <path d="M12 3 L22 20 H2 Z"/>
    <path d="M12 9 V14"/>
    <rect x="11" y="16" width="2" height="2" fill="currentColor" stroke="none"/>
  </>
));
export const Truck = withCompact(LTruck, (
  <>
    <path d="M4.75 17 H2 V5 H15 V17"/>
    <path d="M8.75 17 H15.75"/>
    <path d="M15 9 H19 L22 12.5 V17 H19.75"/>
    <circle cx="6.75" cy="17.5" r="2"/>
    <circle cx="17.75" cy="17.5" r="2"/>
  </>
));
export const Undo2 = withCompact(LUndo2, (
  <>
    <path d="M9 14 L4 9 L9 4"/>
    <path d="M4 9 H16 L20 13 V16 L16 20 H11"/>
  </>
));
export const Upload = withCompact(LUpload, (
  <>
    <path d="M12 15 V3"/>
    <path d="M6.5 8.5 L12 3 L17.5 8.5"/>
    <path d="M3 15 V21 H21 V15"/>
  </>
));
export const UserRound = withCompact(LUserRound, (
  <>
    <circle cx="12" cy="8" r="5"/>
    <path d="M4 22 V19 L7 16 H17 L20 19 V22"/>
  </>
));
export const Users = withCompact(LUsers, (
  <>
    <circle cx="9" cy="7.5" r="4.25"/>
    <path d="M2 21 V18.5 L4.5 15 H13.5 L16 18.5 V21"/>
    <path d="M16 3.25 A4.25 4.25 0 0 1 16 11.75"/>
    <path d="M18.5 15 L22 18.5 V21"/>
  </>
));
export const X = withCompact(LX, (
  <>
    <path d="M5 5 L19 19 M19 5 L5 19"/>
  </>
));
export const ZoomIn = withCompact(LZoomIn, (
  <>
    <circle cx="10.5" cy="10.5" r="7"/>
    <path d="M15.45 15.45 L21 21"/>
    <path d="M7.5 10.5 H13.5 M10.5 7.5 V13.5"/>
  </>
));
export const ZoomOut = withCompact(LZoomOut, (
  <>
    <circle cx="10.5" cy="10.5" r="7"/>
    <path d="M15.45 15.45 L21 21"/>
    <path d="M7.5 10.5 H13.5"/>
  </>
));
