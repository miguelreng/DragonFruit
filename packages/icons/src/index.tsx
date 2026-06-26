/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Lucide-named MingCute shim.
 *
 * Codebases across the monorepo (apps/web, packages/editor) import icons by
 * Lucide names; this package re-exports each name as a thin wrapper around a
 * matching MingCute icon, so call sites don't have to change when the icon
 * library evolves. If a name is missing here, add it: find the closest match
 * at https://www.mingcute.com/icons and alias it below.
 */

import * as React from "react";
import {
  DangerCircle as AlertCircleIcon,
  DangerSquare as AlertSquareIcon,
  DangerTriangle as AlertTriangleSvg,
  TransferHorizontal as ArrowDataTransferHorizontalIcon,
  ArrowDown as ArrowDown01Icon,
  ArrowLeftDown as ArrowDownLeft01Icon,
  Maximize as ArrowExpand01Icon,
  Maximize as ArrowExpandIcon,
  ArrowLeft as ArrowLeft01Icon,
  TransferHorizontal as ArrowLeftRightIcon,
  RoundTransferHorizontal as ArrowReloadHorizontalIcon,
  ArrowRight as ArrowRight01Icon,
  Minimize as ArrowShrink01Icon,
  Minimize as ArrowShrinkIcon,
  ArrowUp as ArrowUp01Icon,
  ArrowToTopRight as ArrowUp02Icon,
  ArrowRightUp as ArrowUpRight01Icon,
  MentionCircle as AtIcon,
  Paperclip as Attachment01Icon,
  Chart2 as BarChartIcon,
  Bell as BellSvg,
  BellOff as NotificationOffLine,
  Case as BriefcaseIcon,
  ChatRound as BubbleChatIcon,
  Lightbulb as BulbIcon,
  Buildings2 as BuildingIcon,
  Calendar as Calendar01Icon,
  CloseCircle as CancelCircleIcon,
  Chart2 as ChartBarLineIcon,
  Graph as ChartLineData01Icon,
  Checklist as CheckListIcon,
  CheckCircle as CheckmarkCircle01Icon,
  CheckSquare as CheckmarkSquare01Icon,
  Record as CircleSvg,
  ArrowUp as CircleArrowUp01Icon,
  Clipboard as ClipboardIcon,
  ClockCircle as Clock01Icon,
  Cloud,
  CloudUpload as CloudUploadIcon,
  Code as HugeCodeIcon,
  ChatLine as Comment01Icon,
  Copy as Copy01Icon,
  Card as CreditCardIcon,
  CrownLine as CrownIcon,
  TrashBinTrash as Delete02Icon,
  Download as Download01Icon,
  CodeFile as FileCodeLine,
  MoveToFolder as Drag04Icon,
  Lightning as EnergyIcon,
  Eraser as EraserIcon,
  Eye as EyeIconSvg,
  EyeClosed as ViewOffIcon,
  Document as File02Icon,
  Filter as FilterIcon,
  Folder as Folder01Icon,
  FolderOpen as Folder02Icon,
  AddFolder as FolderAddIcon,
  Structure as FolderTreeIconSvg,
  BranchingPathsUp as GitBranchIcon,
  Code as GithubIconSvg,
  Global as GlobalIcon,
  Widget as GridIcon,
  Hashtag,
  TextField as Heading01Icon,
  TextField as Heading02Icon,
  TextField as Heading03Icon,
  TextField as Heading04Icon,
  TextField as Heading05Icon,
  TextField as Heading06Icon,
  QuestionCircle as HelpCircleIcon,
  Home as Home01Icon,
  Buildings as HotelIcon,
  Gallery as Image01Icon,
  Inbox as InboxIcon,
  InfoCircle as InformationCircleIcon,
  Key as Key01Icon,
  Layers as Layers01Icon,
  Sidebar as Layout01Icon,
  Link as Link01Icon,
  LinkSquare as LinkSquare01Icon,
  List as ListViewIcon,
  Refresh as Loading01Icon,
  Lock as LockIconSvg,
  MagicStick as MagicWand01Icon,
  Letter as Mail01Icon,
  Maximize as MaximizeIcon,
  Maximize as Maximize02Icon,
  HamburgerMenu as Menu01Icon,
  TestTube as MicroscopeIcon,
  MinusCircle as MinusSignIcon,
  MenuDots as MoreHorizontalIcon,
  MenuDotsCircle as MoreVerticalIconSvg,
  Palette as PaintBoardIcon,
  Pen as PencilSvg,
  Pen2 as PencilEdit02Icon,
  Pen as Pen01Icon,
  Pin as PinIcon,
  AddCircle as PlusSignIcon,
  AddCircle as PlusSignCircleIcon,
  AddSquare as PlusSignSquareIcon,
  QuestionCircle as QuestionIcon,
  ChatLine as QuoteDownIcon,
  MinusCircle as RemoveCircleIcon,
  Rocket as Rocket01Icon,
  History as Rotate01Icon,
  Refresh as RotateClockwiseIcon,
  Magnifer as Search01Icon,
  SendSquare as Sent02Icon,
  Settings as Settings01Icon,
  Settings as Settings02Icon,
  Share as Share01Icon,
  Forward as Share08Icon,
  Widget5 as ShapesIcon,
  Sidebar as SidebarLeft01Icon,
  SidebarMinimalistic as SidebarRight01Icon,
  RoundTransferVertical as SignalIcon,
  Filter as SlidersHorizontalIcon,
  SmileCircle as SmileIcon,
  SortVertical as SortByDown01Icon,
  SortHorizontal as SortByUp01Icon,
  MagicStick as SparklesSvg,
  MagicStick as SparklesIcon,
  Widget as Square01Icon,
  Star as StarIcon,
  Notebook as StickyNote01Icon,
  Tag as Tag01Icon,
  Notes as HugeTableIcon,
  AlignHorizontalCenter as TextAlignCenterIcon,
  AlignLeft as TextAlignLeftIcon,
  AlignRight as TextAlignRightIcon,
  TextBold as TextBoldIcon,
  Text as TextFontIcon,
  TextItalic as TextItalicIcon,
  TextCross as TextStrikethroughIcon,
  TextUnderline as TextUnderlineIcon,
  Cursor as HugeTextSelectIcon,
  Text as TextIcon,
  Ticket as Ticket01Icon,
  CheckCircle as Tick02Icon,
  CheckRead as TickDouble01Icon,
  Stopwatch as Timer01Icon,
  ListCross as ToggleOffIcon,
  Checklist as ToggleOnIcon,
  Translation as TranslateIcon,
  DangerTriangle as TriangleIcon,
  UserPlus as UserAdd01Icon,
  UserCircle as UserCircleIcon,
  User as UserIcon,
  UserMinus as UserMinus01Icon,
  UsersGroupRounded as UserMultipleIcon,
  RoundTransferVertical as WebhookIcon,
  Notebook as WhiteboardIcon,
  Bolt as ZapIcon,
  Bookmark as BookmarkLine,
  Minimize as FullscreenExitLine,
} from "@solar-icons/react/ssr";

type LucideShimProps = React.SVGAttributes<SVGSVGElement> & {
  size?: number | string;
  color?: string;
  strokeWidth?: number | string;
};

/**
 * Wraps a MingCute icon definition as a component that accepts the same prop
 * shape our Lucide-style exports used (className, color, etc.), so call-sites
 * importing icons from "@plane/icons" keep working unchanged after the swap.
 */
function huge(Icon: React.ComponentType<LucideShimProps>) {
  return function HugeShim({ color = "currentColor", size, width, height, ...rest }: LucideShimProps) {
    const resolvedSize = (size ?? width ?? height) as number | string | undefined;
    return <Icon {...rest} color={color} size={resolvedSize ?? "1em"} />;
  };
}

function spinner({ color = "currentColor", strokeWidth, size, width, height, ...rest }: LucideShimProps) {
  const resolvedSize = (size ?? width ?? height) as number | string | undefined;
  const parsedStrokeWidth = typeof strokeWidth === "number" ? strokeWidth : Number(strokeWidth);
  const resolvedStrokeWidth = Number.isFinite(parsedStrokeWidth) ? parsedStrokeWidth : 1.75;

  return (
    <svg
      {...rest}
      width={resolvedSize ?? "1em"}
      height={resolvedSize ?? "1em"}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth={resolvedStrokeWidth} opacity="0.18" />
      <path d="M12 3.5A8.5 8.5 0 0 1 20.5 12" stroke={color} strokeWidth={resolvedStrokeWidth} strokeLinecap="round" />
      <path
        d="M18.6 6.15A8.44 8.44 0 0 1 20.5 12"
        stroke={color}
        strokeWidth={resolvedStrokeWidth}
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

export type LucideIcon = ReturnType<typeof huge>;
export type LucideProps = LucideShimProps;

// ── identity / common ─────────────────────────────────────────────────
export const AlignLeft = huge(TextAlignLeftIcon);
export const AlignRight = huge(TextAlignRightIcon);
export const Archive = huge(Folder02Icon /* placeholder until Archive02 */);
export const ArchiveIcon = Archive;
export const Bookmark = huge(BookmarkLine);
export const Attachment = huge(Attachment01Icon);
export const ArchiveRestore = huge(ArrowReloadHorizontalIcon);
export const ArchiveRestoreIcon = ArchiveRestore;
export const ArchiveX = huge(CancelCircleIcon);
export const ArrowDown = huge(ArrowDown01Icon);
export const ArrowLeft = huge(ArrowLeft01Icon);
export const ArrowRight = huge(ArrowRight01Icon);
export const ArrowUp = huge(ArrowUp01Icon);
export const ArrowDownWideNarrow = huge(SortByDown01Icon);
export const ArrowRightCircle = huge(ArrowUpRight01Icon);
export const ArrowRightLeft = huge(ArrowLeftRightIcon);
export const ArrowUpNarrowWide = huge(SortByUp01Icon);
export const ArrowUpToLine = huge(ArrowUp02Icon);
export const ArrowUpWideNarrow = huge(SortByUp01Icon);
export const AtSign = huge(AtIcon);
export const Ban = huge(AlertSquareIcon);
export const BarChart2 = huge(ChartBarLineIcon);
export const BarChart4 = huge(ChartBarLineIcon);
export const ChartNoAxesColumn = huge(ChartBarLineIcon);
export const BellIcon = huge(BellSvg);
export const BellOff = huge(CancelCircleIcon);
export const Box = huge(Square01Icon);
export const Boxes = huge(Square01Icon);
export const Briefcase = huge(BriefcaseIcon);
export const Building = huge(BuildingIcon);
export const Calendar = huge(Calendar01Icon);
export const CalendarCheck = huge(Calendar01Icon);
export const CalendarDays = huge(Calendar01Icon);
export const Check = huge(Tick02Icon);
export const CheckCheck = huge(TickDouble01Icon);
export const CheckCircle = huge(CheckmarkCircle01Icon);
export const CheckCircle2 = huge(CheckmarkCircle01Icon);
export const CheckIcon = Check;
export const CheckSquare = huge(CheckmarkSquare01Icon);
export const ChartLineUp = huge(ChartLineData01Icon);
export const Activity = ChartLineUp;
export const CircleAlert = huge(AlertCircleIcon);
export const CircleArrowUp = huge(CircleArrowUp01Icon);
export const CircleCheck = huge(CheckmarkCircle01Icon);
export const CircleDashed = huge(CircleSvg);
export const CircleDot = huge(CircleSvg);
export const CircleDotDashed = huge(CircleSvg);
export const CircleHalfTiltLucide = huge(CircleSvg);
export const CircleMinus = huge(RemoveCircleIcon);
export const CircleNotch = huge(Loading01Icon);
export const CirclePlus = huge(PlusSignCircleIcon);
export const CircleUser = huge(UserCircleIcon);
export const CircleUserRound = huge(UserCircleIcon);
export const CircleX = huge(CancelCircleIcon);
export const Clipboard = huge(ClipboardIcon);
export const Clock = huge(Clock01Icon);
export const ClockCounterClockwise = huge(Rotate01Icon);
export const CloudArrowUp = huge(CloudUploadIcon);
export const CloudOff = huge(Cloud);
export const CloudSlash = huge(Cloud);
export const Code = huge(HugeCodeIcon);
export const Code2 = Code;
export const CodeIcon = Code;
export const CornerDownRight = huge(ArrowDownLeft01Icon);
export const CreditCard = huge(CreditCardIcon);
export const Crown = huge(CrownIcon);
export const Dot = huge(MoreHorizontalIcon);
export const Download = huge(Download01Icon);
export const Earth = huge(GlobalIcon);
export const Edit = huge(PencilEdit02Icon);
export const Ellipsis = huge(MoreHorizontalIcon);
export const EllipsisVertical = huge(MoreVerticalIconSvg);
export const Eraser = huge(EraserIcon);
export const Expand = huge(Maximize02Icon);
export const Collapse = huge(FullscreenExitLine);
export const ExternalLink = huge(LinkSquare01Icon);
export const Eye = huge(EyeIconSvg);
export const EyeClosed = huge(ViewOffIcon);
export const EyeIcon2 = Eye;
export const EyeOff = huge(ViewOffIcon);
export const File = huge(File02Icon);
export const FileArrowUp = huge(File02Icon);
export const FileIcon = File;
export const FileOutput = huge(File02Icon);
export const Files = huge(File02Icon);
export const FileStack = Files;
export const FileText = huge(File02Icon);
export const Folder = huge(Folder01Icon);
export const FolderOpen = huge(Folder02Icon);
export const FolderPlus = huge(FolderAddIcon);
export const Funnel = huge(FilterIcon);
export const ListFilter = Funnel;
export const ListFilterPlus = huge(FilterIcon);
export const Gear = huge(Settings01Icon);
export const GitBranch = huge(GitBranchIcon);
export const GithubLogo = huge(GithubIconSvg);
export const GithubLogoIcon = GithubLogo;
export const GridFour = huge(GridIcon);
export const GridIconShim = huge(GridIcon);
export const DotsThree = huge(MoreHorizontalIcon);
export const DotsThreeVertical = huge(MoreVerticalIconSvg);
export const DotsSixVertical = huge(Drag04Icon);
export const Hash = huge(Hashtag);
export const House = huge(Home01Icon);
export const Buildings = huge(HotelIcon);
export const Image = huge(Image01Icon);
export const ImageIcon = Image;
export const Info = huge(InformationCircleIcon);
export const InfoIcon = Info;
export const TextSelect = huge(HugeTextSelectIcon);
export const TextSelectIcon = TextSelect;
export const InboxIconShim = huge(InboxIcon);
export const KeyRound = huge(Key01Icon);
export const Lightbulb = huge(BulbIcon);
export const Lightning = huge(EnergyIcon);
export const Link = huge(Link01Icon);
export const LinkBreak = huge(Link01Icon);
export const Link2Off = LinkBreak;
export const Link2Icon = Link;
export const List = huge(ListViewIcon);
export const ListIcon = List;
export const ListChecks = huge(CheckListIcon);
export const ListTodo = ListChecks;
export const ListNumbers = huge(ListViewIcon);
export const ListOrdered = ListNumbers;
export const ListOrderedIcon = ListOrdered;
export const Loader = spinner;
export const Loader2 = spinner;
export const Lock = huge(LockIconSvg);
export const LockIconShim = Lock;
export const LockKeyOpen = huge(LockIconSvg);
export const LockKeyhole = Lock;
export const LockKeyholeOpen = LockKeyOpen;
export const SignOut = huge(ArrowDownLeft01Icon);
export const LogOut = SignOut;
export const Envelope = huge(Mail01Icon);
export const Mail = Envelope;
export const EnvelopeSimple = huge(Mail01Icon);
export const Mails = EnvelopeSimple;
export const ArrowsOutSimple = huge(MaximizeIcon);
export const Maximize = ArrowsOutSimple;
export const Maximize2 = ArrowsOutSimple;
export const Microscope = huge(MicroscopeIcon);
export const ArrowsInSimple = huge(ArrowShrink01Icon);
export const Minimize2 = ArrowsInSimple;
export const Minus = huge(MinusSignIcon);
export const MinusCircle = huge(RemoveCircleIcon);
export const MinusSquare = Minus;
export const Monitor = huge(Layout01Icon);
export const MoreHorizontal = huge(MoreHorizontalIcon);
export const MoreVertical = huge(MoreVerticalIconSvg);
export const MoreVerticalIconShim = MoreVertical;
export const ArrowsOutCardinal = huge(ArrowExpandIcon);
export const ArrowsLeftRight = huge(ArrowLeftRightIcon);
export const MoveDiagonal = huge(ArrowExpandIcon);
export const MoveHorizontal = huge(ArrowLeftRightIcon);
export const MoveLeft = huge(ArrowLeft01Icon);
export const MoveRight = huge(ArrowRight01Icon);
export const Network = huge(FolderTreeIconSvg);
export const Palette = huge(PaintBoardIcon);
export const Paperclip = huge(Attachment01Icon);
export const PaperclipIcon = Paperclip;
export const Sidebar = huge(SidebarLeft01Icon);
export const SidebarSimple = huge(SidebarRight01Icon);
export const PanelLeft = Sidebar;
export const PanelRight = SidebarSimple;
export const PanelRightOpen = PanelRight;
export const Pencil = huge(PencilSvg);
export const PencilLine = huge(Pen01Icon);
export const PenSquare = PencilLine;
export const PenNib = huge(Pen01Icon);
export const PenTool = PenNib;
export const Plus = huge(PlusSignIcon);
export const PlusCircle = huge(PlusSignCircleIcon);
export const PlusSquare = huge(PlusSignSquareIcon);
export const PushPin = huge(PinIcon);
export const PushPinSlash = huge(PinIcon);
export const Pin = PushPin;
export const PinOff = PushPinSlash;
export const Prohibit = huge(CancelCircleIcon);
export const Question = huge(QuestionIcon);
export const HelpCircle = huge(HelpCircleIcon);
export const History = huge(Rotate01Icon);
export const ArrowsCounterClockwise = huge(ArrowReloadHorizontalIcon);
export const ArrowsClockwise = huge(ArrowReloadHorizontalIcon);
export const ArrowCounterClockwise = huge(RotateClockwiseIcon);
export const ArrowCircleRight = huge(LinkSquare01Icon);
export const ArrowCircleUp = huge(CircleArrowUp01Icon);
export const ArrowBendDownRight = huge(ArrowDownLeft01Icon);
export const ArrowLineUp = huge(ArrowUp02Icon);
export const RefreshCcw = ArrowsCounterClockwise;
export const RefreshCw = ArrowsClockwise;
export const RotateCcw = huge(RotateClockwiseIcon);
export const MagnifyingGlass = huge(Search01Icon);
export const Search = MagnifyingGlass;
// Paper-plane-style send icon. Used in chat composers — distinct from
// the generic `ArrowUp` so a send affordance reads as "submit message"
// rather than "scroll up". See agent-chat drawer.
export const Send = huge(Sent02Icon);
export const Settings = huge(Settings01Icon);
export const SettingsIcon = Settings;
export const Settings2 = huge(Settings02Icon);
export const Shapes = huge(ShapesIcon);
export const Share = huge(Share01Icon);
export const ShareNetwork = huge(Share08Icon);
export const Share2 = ShareNetwork;
export const ArrowsIn = huge(ArrowShrinkIcon);
export const Shrink = ArrowsIn;
export const CellSignalFull = huge(SignalIcon);
export const CellSignalHigh = huge(SignalIcon);
export const CellSignalLow = huge(SignalIcon);
export const CellSignalMedium = huge(SignalIcon);
export const Signal = CellSignalFull;
export const SignalHigh = CellSignalHigh;
export const SignalLow = CellSignalLow;
export const SignalMedium = CellSignalMedium;
export const SignalMediumIcon = SignalMedium;
export const Sliders = huge(SlidersHorizontalIcon);
export const SlidersHorizontal = Sliders;
export const SmileyWink = huge(SmileIcon);
export const Smile = SmileyWink;
export const SmilePlus = SmileyWink;
export const Sparkle = huge(SparklesIcon);
export const SparkleSingle = huge(SparklesSvg);
export const SparkleAlias = Sparkle;
export const Star = huge(StarIcon);
export const StarHalf = Star;
export const StarOff = Star;
export const Stack = huge(Layers01Icon);
export const SquareStackIcon = Stack;
export const Layers = Stack;
export const Layers2 = Stack;
export const LayersIcon = Stack;
export const SquaresFour = huge(GridIcon);
export const LayoutGrid = SquaresFour;
export const LayoutGridIcon = SquaresFour;
export const Note = huge(StickyNote01Icon);
export const StickyIcon = Note;
export const StickyNote = Note;
export const Triangle = huge(TriangleIcon);
export const TriangleIconShim = Triangle;
export const ToggleRight = huge(ToggleOnIcon);
export const ToggleLeft = huge(ToggleOffIcon);
export const Translate = huge(TranslateIcon);
export const Languages = Translate;
export const Trash = huge(Delete02Icon);
export const Trash2 = Trash;
export const TrendDown = huge(BarChartIcon);
export const TrendingDown = TrendDown;
export const TrendUp = huge(ChartLineData01Icon);
export const TrendingUp = TrendUp;
export const TextT = huge(TextFontIcon);
export const Type = TextT;
export const TextAa = huge(TextIcon);
export const ALargeSmall = TextAa;
export const CaseSensitive = TextAa;
export const TextB = huge(TextBoldIcon);
export const Bold = TextB;
export const BoldIcon = Bold;
export const TextItalic = huge(TextItalicIcon);
export const Italic = TextItalic;
export const ItalicIcon = Italic;
export const TextUnderline = huge(TextUnderlineIcon);
export const Underline = TextUnderline;
export const UnderlineIcon = Underline;
export const TextStrikethrough = huge(TextStrikethroughIcon);
export const Strikethrough = TextStrikethrough;
export const StrikethroughIcon = Strikethrough;
export const TextAlignCenter = huge(TextAlignCenterIcon);
export const TextAlignLeft = huge(TextAlignLeftIcon);
export const AlignLeftIcon = TextAlignLeft;
export const TextAlignRight = huge(TextAlignRightIcon);
export const AlignRightIcon = TextAlignRight;
export const AlignCenter = TextAlignCenter;
export const Quotes = huge(QuoteDownIcon);
export const TextQuote = Quotes;
export const TextHOne = huge(Heading01Icon);
export const TextHTwo = huge(Heading02Icon);
export const TextHThree = huge(Heading03Icon);
export const TextHFour = huge(Heading04Icon);
export const TextHFive = huge(Heading05Icon);
export const TextHSix = huge(Heading06Icon);
export const Heading1 = TextHOne;
export const Heading2 = TextHTwo;
export const Heading3 = TextHThree;
export const Heading4 = TextHFour;
export const Heading5 = TextHFive;
export const Heading6 = TextHSix;
export const Table = huge(HugeTableIcon);
export const TableIcon = Table;
export const Tag = huge(Tag01Icon);
export const TagIcon = Tag;
export const Timer = huge(Timer01Icon);
export const Tray = huge(InboxIcon);
export const Inbox = Tray;
export const PencilSimple = huge(PencilSvg);
export const Copy = huge(Copy01Icon);
export const CopySimple = Copy;
export const CopyPlus = Copy;
export const Csv = huge(FileCodeLine);
export const Cube = huge(Square01Icon);
export const Component = Cube;
export const Globe = huge(GlobalIcon);
export const ArrowSquareOut = huge(LinkSquare01Icon);
export const ArrowsOut = huge(ArrowExpand01Icon);
export const Image1Icon = Image;
export const FolderTreeIcon = huge(FolderTreeIconSvg);
export const ListTree = FolderTreeIcon;
export const Menu = huge(Menu01Icon);
export const Chat = huge(BubbleChatIcon);
export const ChatCircle = huge(Comment01Icon);
export const MessageCircle = ChatCircle;
export const MessageSquare = Chat;
export const MessageSquareIcon = MessageSquare;
export const MessageSquareText = MessageSquare;
export const Notification = huge(BellSvg);
export const BellSlash = huge(NotificationOffLine);
export const User = huge(UserIcon);
export const User2 = User;
export const UserRound = User;
export const Users = huge(UserMultipleIcon);
export const Users2Icon = Users;
export const UsersIcon = Users;
export const UserPlus = huge(UserAdd01Icon);
export const UserPlus2 = UserPlus;
export const UserMinus = huge(UserMinus01Icon);
export const UserMinus2 = UserMinus;
export const UserCircle = huge(UserCircleIcon);
export const UserCirclePlus = huge(UserAdd01Icon);
export const IdentificationBadge = huge(UserIcon);
export const SquareUser = IdentificationBadge;
export const MagicWand = huge(MagicWand01Icon);
export const Wand2 = MagicWand;
export const Sparkles2 = Sparkle;
export const WebhooksLogo = huge(WebhookIcon);
export const Webhook = WebhooksLogo;
export const X = huge(CancelCircleIcon);
export const XCircle = huge(CancelCircleIcon);
export const CancelCircle = huge(CancelCircleIcon);
export const XIcon = X;
export const Zap = huge(ZapIcon);

// ── Phosphor-named aliases still used in code ─────────────────────────
export const Swap = huge(ArrowDataTransferHorizontalIcon);
export const SortAscending = huge(SortByUp01Icon);
export const SortDescending = huge(SortByDown01Icon);
export const At = huge(AtIcon);
export const Warning = huge(AlertTriangleSvg);
export const WarningCircle = huge(AlertCircleIcon);
export const WarningOctagon = huge(AlertSquareIcon);
export const AlertCircle = WarningCircle;
export const AlertOctagon = WarningOctagon;
export const AlertTriangleIcon = Warning;
export const TriangleAlert = Warning;
export const OctagonAlert = WarningOctagon;
export const Ticket = huge(Ticket01Icon);
export const TicketCheck = Ticket;

// ── added on iteration: more aliases that downstream code expects ────
export const AlertTriangle = Warning;
export const BellAlias = BellIcon;
export const Bell = BellIcon;
export const ChevronDown = huge(ArrowDown01Icon);
export const ChevronDownIcon = ChevronDown;
export const ChevronLeft = huge(ArrowLeft01Icon);
export const ChevronRight = huge(ArrowRight01Icon);
export const ChevronUp = huge(ArrowUp01Icon);
export const ChevronUpIcon = ChevronUp;
export const ChevronsUpDown = huge(ArrowExpandIcon);
export const Circle = huge(CircleSvg);
export const EyeIcon = Eye;
export const GithubIcon = GithubLogo;
export const GripVertical = huge(Drag04Icon);
export const HardDrive = huge(Folder02Icon);
export const Home = House;
export const Hotel = Buildings;
export const LockIcon = Lock;
export const MoreVerticalIcon = MoreVertical;
export const Rocket = huge(Rocket01Icon);
export const Sparkles = Sparkle;
export const SquarePlus = PlusSquare;
export const UploadCloud = huge(CloudUploadIcon);

// ── domain icons matched to sidebar entries ───────────────────────────
export const PaintBoard = huge(PaintBoardIcon);
export const Whiteboard = huge(WhiteboardIcon);
