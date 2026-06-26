/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import {
  Pulse as Activity,
  Podcast as Airplay,
  DangerCircle as AlertCircle,
  DangerCircle as AlertOctagon,
  DangerTriangle as AlertTriangle,
  AlignHorizontalCenter as AlignCenter,
  AlignTop as AlignJustify,
  AlignLeft,
  AlignRight,
  MapPoint as Anchor,
  Camera as Aperture,
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  MentionCircle as AtSign,
  MedalStar as Award,
  Chart as BarChart,
  ChartSquare as BarChart2,
  BatteryFull as Battery,
  BatteryCharge as BatteryCharging,
  Bell,
  BellOff,
  Book,
  Bookmark,
  Book2 as BookOpen,
  Box,
  Case as Briefcase,
  Calendar,
  Camera,
  Camera as CameraOff,
  Podcast as Cast,
  CheckCircle,
  CheckSquare,
  Clipboard,
  ClockCircle as Clock,
  Cloud,
  CloudRain as CloudDrizzle,
  CloudRain as CloudLightning,
  Cloud as CloudOff,
  CloudRain,
  CloudRain as CloudSnow,
  Code,
  Code as Codepen,
  Code as Codesandbox,
  Cup as Coffee,
  Widget as Columns,
  Command,
  Compass,
  Reply as CornerDownLeft,
  Forward as CornerDownRight,
  Reply as CornerLeftDown,
  Reply as CornerLeftUp,
  Forward as CornerRightDown,
  Forward as CornerRightUp,
  Reply as CornerUpLeft,
  Forward as CornerUpRight,
  Cpu,
  Card as CreditCard,
  Crop,
  Target as Crosshair,
  Database,
  Backspace as Delete,
  Record as Disc,
  SlashCircle as Divide,
  SlashCircle as DivideCircle,
  SlashSquare as DivideSquare,
  Dollar as DollarSign,
  Download,
  CloudDownload as DownloadCloud,
  Basketball as Dribbble,
  CloudWaterdrop as Droplet,
  Pen as Edit,
  Pen2 as Edit2,
  PenNewSquare as Edit3,
  Eye,
  EyeClosed as EyeOff,
  Hashtag as Facebook,
  Forward as FastForward,
  Pen as Feather,
  Figma,
  File,
  FileRemove as FileMinus,
  FileSend as FilePlus,
  FileText,
  Clapperboard as Film,
  Filter,
  Flag,
  Folder,
  Folder as FolderMinus,
  AddFolder as FolderPlus,
  Widget as Framer,
  SadCircle as Frown,
  Gift,
  BranchingPathsUp as GitBranch,
  BranchingPathsUp as GitCommit,
  BranchingPathsUp as GitMerge,
  BranchingPathsUp as GitPullRequest,
  Hashtag as Github,
  Hashtag as Gitlab,
  Widget as Grid,
  Diskette as HardDrive,
  Hashtag as Hash,
  HeadphonesRound as Headphones,
  Heart,
  QuestionCircle as HelpCircle,
  Widget as Hexagon,
  Home,
  Gallery as Image,
  Inbox,
  InfoCircle as Info,
  Hashtag as Instagram,
  TextItalic as Italic,
  Key,
  Layers,
  Layers as Layout,
  Shield as LifeBuoy,
  Hashtag as Linkedin,
  List,
  Refresh as Loader,
  Login as LogIn,
  Logout as LogOut,
  Letter as Mail,
  Map,
  MapPoint as MapPin,
  Maximize,
  MaximizeSquare as Maximize2,
  SmileCircle as Meh,
  HamburgerMenu as Menu,
  ChatRound as MessageCircle,
  ChatSquare as MessageSquare,
  Microphone as Mic,
  Microphone as MicOff,
  Minimize,
  MinimizeSquare as Minimize2,
  MinusCircle as Minus,
  MinusCircle,
  MinusSquare,
  RoundAltArrowDown as CircleChevronDown,
  UsersGroupRounded as UsersRound,
  Widget as ToggleLeft,
  User,
} from "@solar-icons/react/ssr";
import {
  LinkIcon,
  CopyIcon,
  GlobeIcon,
  LockIcon,
  NewTabIcon,
  CheckIcon,
  SearchIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
} from "@plane/propel/icons";

export const MATERIAL_ICONS_LIST = [
  {
    name: "search",
  },
  {
    name: "home",
  },
  {
    name: "menu",
  },
  {
    name: "close",
  },
  {
    name: "settings",
  },
  {
    name: "done",
  },
  {
    name: "check_circle",
  },
  {
    name: "favorite",
  },
  {
    name: "add",
  },
  {
    name: "delete",
  },
  {
    name: "arrow_back",
  },
  {
    name: "star",
  },
  {
    name: "logout",
  },
  {
    name: "add_circle",
  },
  {
    name: "cancel",
  },
  {
    name: "arrow_drop_down",
  },
  {
    name: "more_vert",
  },
  {
    name: "check",
  },
  {
    name: "check_box",
  },
  {
    name: "toggle_on",
  },
  {
    name: "open_in_new",
  },
  {
    name: "refresh",
  },
  {
    name: "login",
  },
  {
    name: "radio_button_unchecked",
  },
  {
    name: "more_horiz",
  },
  {
    name: "apps",
  },
  {
    name: "radio_button_checked",
  },
  {
    name: "download",
  },
  {
    name: "remove",
  },
  {
    name: "toggle_off",
  },
  {
    name: "bolt",
  },
  {
    name: "arrow_upward",
  },
  {
    name: "filter_list",
  },
  {
    name: "delete_forever",
  },
  {
    name: "autorenew",
  },
  {
    name: "key",
  },
  {
    name: "sort",
  },
  {
    name: "sync",
  },
  {
    name: "add_box",
  },
  {
    name: "block",
  },
  {
    name: "restart_alt",
  },
  {
    name: "menu_open",
  },
  {
    name: "shopping_cart_checkout",
  },
  {
    name: "expand_circle_down",
  },
  {
    name: "backspace",
  },
  {
    name: "undo",
  },
  {
    name: "done_all",
  },
  {
    name: "do_not_disturb_on",
  },
  {
    name: "open_in_full",
  },
  {
    name: "double_arrow",
  },
  {
    name: "sync_alt",
  },
  {
    name: "zoom_in",
  },
  {
    name: "done_outline",
  },
  {
    name: "drag_indicator",
  },
  {
    name: "fullscreen",
  },
  {
    name: "star_half",
  },
  {
    name: "settings_accessibility",
  },
  {
    name: "reply",
  },
  {
    name: "exit_to_app",
  },
  {
    name: "unfold_more",
  },
  {
    name: "library_add",
  },
  {
    name: "cached",
  },
  {
    name: "select_check_box",
  },
  {
    name: "terminal",
  },
  {
    name: "change_circle",
  },
  {
    name: "disabled_by_default",
  },
  {
    name: "swap_horiz",
  },
  {
    name: "swap_vert",
  },
  {
    name: "app_registration",
  },
  {
    name: "download_for_offline",
  },
  {
    name: "close_fullscreen",
  },
  {
    name: "file_open",
  },
  {
    name: "minimize",
  },
  {
    name: "open_with",
  },
  {
    name: "dataset",
  },
  {
    name: "add_task",
  },
  {
    name: "start",
  },
  {
    name: "keyboard_voice",
  },
  {
    name: "create_new_folder",
  },
  {
    name: "forward",
  },
  {
    name: "download",
  },
  {
    name: "settings_applications",
  },
  {
    name: "compare_arrows",
  },
  {
    name: "redo",
  },
  {
    name: "zoom_out",
  },
  {
    name: "publish",
  },
  {
    name: "html",
  },
  {
    name: "token",
  },
  {
    name: "switch_access_shortcut",
  },
  {
    name: "fullscreen_exit",
  },
  {
    name: "sort_by_alpha",
  },
  {
    name: "delete_sweep",
  },
  {
    name: "indeterminate_check_box",
  },
  {
    name: "view_timeline",
  },
  {
    name: "settings_backup_restore",
  },
  {
    name: "arrow_drop_down_circle",
  },
  {
    name: "assistant_navigation",
  },
  {
    name: "sync_problem",
  },
  {
    name: "clear_all",
  },
  {
    name: "density_medium",
  },
  {
    name: "heart_plus",
  },
  {
    name: "filter_alt_off",
  },
  {
    name: "expand",
  },
  {
    name: "subdirectory_arrow_right",
  },
  {
    name: "download_done",
  },
  {
    name: "arrow_outward",
  },
  {
    name: "123",
  },
  {
    name: "swipe_left",
  },
  {
    name: "auto_mode",
  },
  {
    name: "saved_search",
  },
  {
    name: "place_item",
  },
  {
    name: "system_update_alt",
  },
  {
    name: "javascript",
  },
  {
    name: "search_off",
  },
  {
    name: "output",
  },
  {
    name: "select_all",
  },
  {
    name: "fit_screen",
  },
  {
    name: "swipe_up",
  },
  {
    name: "dynamic_form",
  },
  {
    name: "hide_source",
  },
  {
    name: "swipe_right",
  },
  {
    name: "switch_access_shortcut_add",
  },
  {
    name: "browse_gallery",
  },
  {
    name: "css",
  },
  {
    name: "density_small",
  },
  {
    name: "assistant_direction",
  },
  {
    name: "check_small",
  },
  {
    name: "youtube_searched_for",
  },
  {
    name: "move_up",
  },
  {
    name: "swap_horizontal_circle",
  },
  {
    name: "data_thresholding",
  },
  {
    name: "install_mobile",
  },
  {
    name: "move_down",
  },
  {
    name: "dataset_linked",
  },
  {
    name: "keyboard_command_key",
  },
  {
    name: "view_kanban",
  },
  {
    name: "swipe_down",
  },
  {
    name: "key_off",
  },
  {
    name: "transcribe",
  },
  {
    name: "send_time_extension",
  },
  {
    name: "swipe_down_alt",
  },
  {
    name: "swipe_left_alt",
  },
  {
    name: "swipe_right_alt",
  },
  {
    name: "swipe_up_alt",
  },
  {
    name: "keyboard_option_key",
  },
  {
    name: "cycle",
  },
  {
    name: "rebase",
  },
  {
    name: "rebase_edit",
  },
  {
    name: "empty_dashboard",
  },
  {
    name: "magic_exchange",
  },
  {
    name: "acute",
  },
  {
    name: "point_scan",
  },
  {
    name: "step_into",
  },
  {
    name: "cheer",
  },
  {
    name: "emoticon",
  },
  {
    name: "explosion",
  },
  {
    name: "water_bottle",
  },
  {
    name: "weather_hail",
  },
  {
    name: "syringe",
  },
  {
    name: "pill",
  },
  {
    name: "genetics",
  },
  {
    name: "allergy",
  },
  {
    name: "medical_mask",
  },
  {
    name: "body_fat",
  },
  {
    name: "barefoot",
  },
  {
    name: "infrared",
  },
  {
    name: "wrist",
  },
  {
    name: "metabolism",
  },
  {
    name: "conditions",
  },
  {
    name: "taunt",
  },
  {
    name: "altitude",
  },
  {
    name: "tibia",
  },
  {
    name: "footprint",
  },
  {
    name: "eyeglasses",
  },
  {
    name: "man_3",
  },
  {
    name: "woman_2",
  },
  {
    name: "rheumatology",
  },
  {
    name: "tornado",
  },
  {
    name: "landslide",
  },
  {
    name: "foggy",
  },
  {
    name: "severe_cold",
  },
  {
    name: "tsunami",
  },
  {
    name: "vape_free",
  },
  {
    name: "sign_language",
  },
  {
    name: "emoji_symbols",
  },
  {
    name: "clear_night",
  },
  {
    name: "emoji_food_beverage",
  },
  {
    name: "hive",
  },
  {
    name: "thunderstorm",
  },
  {
    name: "communication",
  },
  {
    name: "rocket",
  },
  {
    name: "pets",
  },
  {
    name: "public",
  },
  {
    name: "quiz",
  },
  {
    name: "mood",
  },
  {
    name: "gavel",
  },
  {
    name: "eco",
  },
  {
    name: "diamond",
  },
  {
    name: "forest",
  },
  {
    name: "rainy",
  },
  {
    name: "skull",
  },
];

export const LUCIDE_ICONS_LIST = [
  { name: "Activity", element: Activity },
  { name: "Airplay", element: Airplay },
  { name: "AlertCircle", element: AlertCircle },
  { name: "AlertOctagon", element: AlertOctagon },
  { name: "AlertTriangle", element: AlertTriangle },
  { name: "AlignCenter", element: AlignCenter },
  { name: "AlignJustify", element: AlignJustify },
  { name: "AlignLeft", element: AlignLeft },
  { name: "AlignRight", element: AlignRight },
  { name: "Anchor", element: Anchor },
  { name: "Aperture", element: Aperture },
  { name: "Archive", element: Archive },
  { name: "ArrowDown", element: ArrowDown },
  { name: "ArrowLeft", element: ArrowLeft },
  { name: "ArrowRight", element: ArrowRight },
  { name: "ArrowUp", element: ArrowUp },
  { name: "AtSign", element: AtSign },
  { name: "Award", element: Award },
  { name: "BarChart", element: BarChart },
  { name: "BarChart2", element: BarChart2 },
  { name: "Battery", element: Battery },
  { name: "BatteryCharging", element: BatteryCharging },
  { name: "Bell", element: Bell },
  { name: "BellOff", element: BellOff },
  { name: "Book", element: Book },
  { name: "Bookmark", element: Bookmark },
  { name: "BookOpen", element: BookOpen },
  { name: "Box", element: Box },
  { name: "Briefcase", element: Briefcase },
  { name: "Calendar", element: Calendar },
  { name: "Camera", element: Camera },
  { name: "CameraOff", element: CameraOff },
  { name: "Cast", element: Cast },
  { name: "CircleChevronDown", element: CircleChevronDown },
  { name: "Check", element: CheckIcon },
  { name: "CheckCircle", element: CheckCircle },
  { name: "CheckSquare", element: CheckSquare },
  { name: "ChevronDown", element: ChevronDownIcon },
  { name: "ChevronLeft", element: ChevronLeftIcon },
  { name: "ChevronRight", element: ChevronRightIcon },
  { name: "ChevronUp", element: ChevronUpIcon },
  { name: "Clipboard", element: Clipboard },
  { name: "Clock", element: Clock },
  { name: "Cloud", element: Cloud },
  { name: "CloudDrizzle", element: CloudDrizzle },
  { name: "CloudLightning", element: CloudLightning },
  { name: "CloudOff", element: CloudOff },
  { name: "CloudRain", element: CloudRain },
  { name: "CloudSnow", element: CloudSnow },
  { name: "Code", element: Code },
  { name: "Codepen", element: Codepen },
  { name: "Codesandbox", element: Codesandbox },
  { name: "Coffee", element: Coffee },
  { name: "Columns", element: Columns },
  { name: "Command", element: Command },
  { name: "Compass", element: Compass },
  { name: "Copy", element: CopyIcon },
  { name: "CornerDownLeft", element: CornerDownLeft },
  { name: "CornerDownRight", element: CornerDownRight },
  { name: "CornerLeftDown", element: CornerLeftDown },
  { name: "CornerLeftUp", element: CornerLeftUp },
  { name: "CornerRightDown", element: CornerRightDown },
  { name: "CornerRightUp", element: CornerRightUp },
  { name: "CornerUpLeft", element: CornerUpLeft },
  { name: "CornerUpRight", element: CornerUpRight },
  { name: "Cpu", element: Cpu },
  { name: "CreditCard", element: CreditCard },
  { name: "Crop", element: Crop },
  { name: "Crosshair", element: Crosshair },
  { name: "Database", element: Database },
  { name: "Delete", element: Delete },
  { name: "Disc", element: Disc },
  { name: "Divide", element: Divide },
  { name: "DivideCircle", element: DivideCircle },
  { name: "DivideSquare", element: DivideSquare },
  { name: "DollarSign", element: DollarSign },
  { name: "Download", element: Download },
  { name: "DownloadCloud", element: DownloadCloud },
  { name: "Dribbble", element: Dribbble },
  { name: "Droplet", element: Droplet },
  { name: "Edit", element: Edit },
  { name: "Edit2", element: Edit2 },
  { name: "Edit3", element: Edit3 },
  { name: "ExternalLink", element: NewTabIcon },
  { name: "Eye", element: Eye },
  { name: "EyeOff", element: EyeOff },
  { name: "Facebook", element: Facebook },
  { name: "FastForward", element: FastForward },
  { name: "Feather", element: Feather },
  { name: "Figma", element: Figma },
  { name: "File", element: File },
  { name: "FileMinus", element: FileMinus },
  { name: "FilePlus", element: FilePlus },
  { name: "FileText", element: FileText },
  { name: "Film", element: Film },
  { name: "Filter", element: Filter },
  { name: "Flag", element: Flag },
  { name: "Folder", element: Folder },
  { name: "FolderMinus", element: FolderMinus },
  { name: "FolderPlus", element: FolderPlus },
  { name: "Framer", element: Framer },
  { name: "Frown", element: Frown },
  { name: "Gift", element: Gift },
  { name: "GitBranch", element: GitBranch },
  { name: "GitCommit", element: GitCommit },
  { name: "GitMerge", element: GitMerge },
  { name: "GitPullRequest", element: GitPullRequest },
  { name: "Github", element: Github },
  { name: "Gitlab", element: Gitlab },
  { name: "Globe", element: GlobeIcon },
  { name: "Grid", element: Grid },
  { name: "HardDrive", element: HardDrive },
  { name: "Hash", element: Hash },
  { name: "Headphones", element: Headphones },
  { name: "Heart", element: Heart },
  { name: "HelpCircle", element: HelpCircle },
  { name: "Hexagon", element: Hexagon },
  { name: "Home", element: Home },
  { name: "Image", element: Image },
  { name: "Inbox", element: Inbox },
  { name: "Info", element: Info },
  { name: "Instagram", element: Instagram },
  { name: "Italic", element: Italic },
  { name: "Key", element: Key },
  { name: "Layers", element: Layers },
  { name: "Layout", element: Layout },
  { name: "LifeBuoy", element: LifeBuoy },
  { name: "Link", element: LinkIcon },
  { name: "Link2", element: LinkIcon },
  { name: "Linkedin", element: Linkedin },
  { name: "List", element: List },
  { name: "Loader", element: Loader },
  { name: "Lock", element: LockIcon },
  { name: "LogIn", element: LogIn },
  { name: "LogOut", element: LogOut },
  { name: "Mail", element: Mail },
  { name: "Map", element: Map },
  { name: "MapPin", element: MapPin },
  { name: "Maximize", element: Maximize },
  { name: "Maximize2", element: Maximize2 },
  { name: "Meh", element: Meh },
  { name: "Menu", element: Menu },
  { name: "MessageCircle", element: MessageCircle },
  { name: "MessageSquare", element: MessageSquare },
  { name: "Mic", element: Mic },
  { name: "MicOff", element: MicOff },
  { name: "Minimize", element: Minimize },
  { name: "Minimize2", element: Minimize2 },
  { name: "Minus", element: Minus },
  { name: "MinusCircle", element: MinusCircle },
  { name: "MinusSquare", element: MinusSquare },
  { name: "Search", element: SearchIcon },
  { name: "ToggleLeft", element: ToggleLeft },
  { name: "User", element: User },
  { name: "UsersRound", element: UsersRound },
];
