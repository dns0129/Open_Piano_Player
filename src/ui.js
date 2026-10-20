import {
  createIcons,
  Music2,
  BookOpen,
  SlidersHorizontal,
  Upload,
  Sparkles,
  Play,
  Pause,
  RotateCcw,
  SkipBack,
  Volume2,
  ChevronDown,
  ArrowUpRight,
  Plus,
  X,
  Check,
  Search,
  Download,
  Repeat2,
  LoaderCircle,
  Headphones,
  Piano,
  Guitar,
  ArrowLeft,
  ExternalLink,
  Trash2,
  FileMusic,
  CheckCircle2,
  CircleHelp,
  PanelLeftClose,
  PanelTop,
  PanelLeft,
  Maximize2,
  Minimize2,
  AudioLines,
  FileAudio,
  Printer,
} from "lucide";
const icons = {
  Music2,
  BookOpen,
  SlidersHorizontal,
  Upload,
  Sparkles,
  Play,
  Pause,
  RotateCcw,
  SkipBack,
  Volume2,
  ChevronDown,
  ArrowUpRight,
  Plus,
  X,
  Check,
  Search,
  Download,
  Repeat2,
  LoaderCircle,
  Headphones,
  Piano,
  Guitar,
  ArrowLeft,
  ExternalLink,
  Trash2,
  FileMusic,
  CheckCircle2,
  CircleHelp,
  PanelLeftClose,
  PanelTop,
  PanelLeft,
  Maximize2,
  Minimize2,
  AudioLines,
  FileAudio,
  Printer,
};
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [
  ...root.querySelectorAll(selector),
];
export const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const icon = (name, cls = "") =>
  '<i data-lucide="' + name + '" class="' + cls + '"></i>';
export const refreshIcons = () =>
  createIcons({ icons, attrs: { "stroke-width": 1.7 } });
export const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
