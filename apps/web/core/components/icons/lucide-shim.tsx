/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Solar icon shim. Historically this re-exported `@plane/icons` (lucide-named
 * HugeIcons). The app now standardizes on Solar icons, so every name used
 * across the codebase is mapped to its nearest Solar equivalent below.
 *
 * `export * from "@plane/icons"` is kept as a fallback: per the ES module
 * spec, the explicit named exports below shadow any same-named star export,
 * so remapped names resolve to Solar while any not-yet-remapped name still
 * resolves to the original icon instead of breaking the build.
 */
import type { ComponentType, SVGProps } from "react";
import type { IconWeight } from "@solar-icons/react";
import * as Solar from "@solar-icons/react/ssr";

export * from "@plane/icons";

type SolarIconProps = SVGProps<SVGSVGElement> & { weight?: IconWeight; size?: string | number };
type SolarIconComponent = ComponentType<SolarIconProps>;

// Linear is the thin, single-stroke Solar style that most closely matches the
// lucide icons these names used to resolve to.
const DEFAULT_WEIGHT: IconWeight = "Linear";

// Wrap each Solar icon so it defaults to the Linear weight. Kept as a plain
// function component (like the lucide icons it replaces) so it stays assignable
// to the LucideIcon/LucideProps signatures consumers type their icon fields as.
const shim =
  (Icon: SolarIconComponent) =>
  ({ weight, ...props }: SolarIconProps) =>
    <Icon weight={weight ?? DEFAULT_WEIGHT} {...props} />;


export const Activity = shim(Solar.Pulse);
export const ALargeSmall = shim(Solar.Text);
export const AlertCircle = shim(Solar.DangerCircle);
export const AlertOctagon = shim(Solar.Danger);
export const AlertTriangle = shim(Solar.DangerTriangle);
export const AlertTriangleIcon = shim(Solar.DangerTriangle);
export const AlignLeft = shim(Solar.AlignLeft);
export const Archive = shim(Solar.Archive);
export const ArchiveIcon = shim(Solar.Archive);
export const ArchiveRestore = shim(Solar.ArchiveUp);
export const ArchiveRestoreIcon = shim(Solar.ArchiveUp);
export const ArchiveX = shim(Solar.ArchiveDown);
export const ArrowDown = shim(Solar.ArrowDown);
export const ArrowDownWideNarrow = shim(Solar.SortFromTopToBottom);
export const ArrowLeft = shim(Solar.ArrowLeft);
export const ArrowRight = shim(Solar.ArrowRight);
export const ArrowRightCircle = shim(Solar.RoundAltArrowRight);
export const ArrowRightLeft = shim(Solar.RoundTransferHorizontal);
export const ArrowUp = shim(Solar.ArrowUp);
export const ArrowUpToLine = shim(Solar.ArrowUp);
export const ArrowUpWideNarrow = shim(Solar.SortFromBottomToTop);
export const AtSign = shim(Solar.Hashtag);
export const Attachment = shim(Solar.Paperclip);
export const Ban = shim(Solar.Forbidden);
export const BarChart4 = shim(Solar.Chart);
export const Bell = shim(Solar.Bell);
export const BellOff = shim(Solar.BellOff);
export const Bookmark = shim(Solar.Bookmark);
export const Box = shim(Solar.Box);
export const Boxes = shim(Solar.Box);
export const Briefcase = shim(Solar.Case);
export const Calendar = shim(Solar.Calendar);
export const CalendarCheck = shim(Solar.CalendarMark);
export const CalendarDays = shim(Solar.Calendar);
export const CancelCircle = shim(Solar.CloseCircle);
export const CaseSensitive = shim(Solar.Text);
export const ChartNoAxesColumn = shim(Solar.Chart);
// Bare checkmark glyph (no enclosing circle). Solar only ships CheckCircle/
// CheckSquare, so this is a hand-rolled stroke icon matching the original
// lucide `Check` — the generic tick used inside dropdowns, toggles, and the
// todo-complete button (which supplies its own background color).
export const Check = ({ strokeWidth = 2, ...props }: SVGProps<SVGSVGElement> & { strokeWidth?: number }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    width="1em"
    height="1em"
    {...props}
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
export const CheckCheck = shim(Solar.CheckRead);
export const CheckCircle = shim(Solar.CheckCircle);
export const CheckCircle2 = shim(Solar.CheckCircle);
export const CheckSquare = shim(Solar.CheckSquare);
export const ChevronDown = shim(Solar.AltArrowDown);
export const ChevronRight = shim(Solar.AltArrowRight);
export const ChevronUp = shim(Solar.AltArrowUp);
export const Circle = shim(Solar.RecordCircle);
export const CircleAlert = shim(Solar.DangerCircle);
export const CircleArrowUp = shim(Solar.RoundAltArrowUp);
export const CircleCheck = shim(Solar.CheckCircle);
export const CircleDashed = shim(Solar.RecordCircle);
export const CircleDot = shim(Solar.RecordCircle);
export const CircleMinus = shim(Solar.MinusCircle);
export const CirclePlus = shim(Solar.AddCircle);
export const CircleX = shim(Solar.CloseCircle);
export const Clipboard = shim(Solar.Clipboard);
export const Clock = shim(Solar.ClockCircle);
export const CloudOff = shim(Solar.CloudCross);
export const Collapse = shim(Solar.Minimize);
export const Component = shim(Solar.Widget);
export const Copy = shim(Solar.Copy);
export const CopyPlus = shim(Solar.Copy);
export const CornerDownRight = shim(Solar.ArrowRightDown);
export const UndoLeft = shim(Solar.UndoLeft);
export const Crown = shim(Solar.Crown);
export const Dialog = shim(Solar.Dialog);
export const Eraser = shim(Solar.Eraser);
export const Csv = shim(Solar.DocumentText);
export const Dot = shim(Solar.Record);
export const Download = shim(Solar.Download);
export const Earth = shim(Solar.Earth);
export const Edit = shim(Solar.Pen);
export const Ellipsis = shim(Solar.MenuDots);
export const Expand = shim(Solar.Maximize);
export const ExternalLink = shim(Solar.ArrowRightUp);
export const Eye = shim(Solar.Eye);
export const EyeIcon = shim(Solar.Eye);
export const EyeOff = shim(Solar.EyeClosed);
export const File = shim(Solar.File);
export const FileOutput = shim(Solar.FileRight);
export const FileStack = shim(Solar.Documents);
export const FileText = shim(Solar.DocumentText);
export const Folder = shim(Solar.Folder);
export const FolderPlus = shim(Solar.AddFolder);
export const GitBranch = shim(Solar.Routing2);
export const GithubIcon = shim(Solar.Code2);
export const GridIconShim = shim(Solar.Widget);
export const GripVertical = shim(Solar.MenuDots);
export const HardDrive = shim(Solar.Diskette);
export const Hash = shim(Solar.Hashtag);
export const HelpCircle = shim(Solar.QuestionCircle);
export const History = shim(Solar.History);
export const Hotel = shim(Solar.Buildings);
export const Image = shim(Solar.Gallery);
export const ImageIcon = shim(Solar.Gallery);
export const Inbox = shim(Solar.Inbox);
export const Info = shim(Solar.InfoCircle);
export const Layers = shim(Solar.Layers);
export const LayersIcon = shim(Solar.Layers);
export const LayoutGrid = shim(Solar.Widget);
export const Lightbulb = shim(Solar.Lightbulb);
export const Link = shim(Solar.Link);
export const List = shim(Solar.List);
export const ListChecks = shim(Solar.Checklist);
export const ListFilter = shim(Solar.Filter);
export const ListFilterPlus = shim(Solar.Filters);
export const Loader = shim(Solar.Refresh);
export const Loader2 = shim(Solar.Refresh);
export const LockKeyhole = shim(Solar.LockKeyhole);
export const LockKeyholeOpen = shim(Solar.LockKeyholeUnlocked);
export const LogOut = shim(Solar.Logout);
export const LogOut2 = shim(Solar.Logout2);
export const Mail = shim(Solar.Letter);
export const Mails = shim(Solar.Letter);
export const Maximize2 = shim(Solar.Maximize);
export const Menu = shim(Solar.HamburgerMenu);
export const MessageCircle = shim(Solar.ChatRound);
export const MessageSquare = shim(Solar.ChatSquare);
export const Microscope = shim(Solar.TestTube);
export const Minimize2 = shim(Solar.Minimize);
export const Minus = shim(Solar.MinusCircle);
export const MinusCircle = shim(Solar.MinusCircle);
export const Monitor = shim(Solar.Monitor);
export const MoreHorizontal = shim(Solar.MenuDots);
export const MoreVertical = shim(Solar.MenuDots);
export const MoreVerticalIcon = shim(Solar.MenuDots);
export const MoveDiagonal = shim(Solar.Maximize);
export const MoveLeft = shim(Solar.ArrowLeft);
export const MoveRight = shim(Solar.ArrowRight);
export const Network = shim(Solar.Routing);
export const OctagonAlert = shim(Solar.Danger);
export const Palette = shim(Solar.Palette);
export const PanelLeft = shim(Solar.SidebarMinimalistic);
export const PanelRight = shim(Solar.SidebarMinimalistic);
export const Paperclip = shim(Solar.Paperclip);
export const Pencil = shim(Solar.Pen);
export const PenTool = shim(Solar.Pen2);
export const Pin = shim(Solar.Pin);
export const PinOff = shim(Solar.Pin);
// Bare plus glyph (no enclosing circle). Solar only ships AddCircle/AddSquare,
// so this is a hand-rolled stroke icon matching the original lucide `Plus`.
export const Plus = ({ strokeWidth = 2, ...props }: SVGProps<SVGSVGElement> & { strokeWidth?: number }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    width="1em"
    height="1em"
    {...props}
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const RefreshCcw = shim(Solar.Refresh);
export const RefreshCw = shim(Solar.Refresh);
export const Rocket = shim(Solar.Rocket);
export const RotateCcw = shim(Solar.Restart);
export const Search = shim(Solar.Magnifer);
export const Settings = shim(Solar.Settings);
export const Settings2 = shim(Solar.SettingsMinimalistic);
export const Share2 = shim(Solar.Share);
export const Shrink = shim(Solar.Minimize);
export const SlidersHorizontal = shim(Solar.Tuning);
export const SmilePlus = shim(Solar.SmileCircle);
export const Sparkle = shim(Solar.StarShine);
export const Sparkles = shim(Solar.Stars);
export const SquareStackIcon = shim(Solar.Layers);
export const SquareUser = shim(Solar.UserCircle);
export const Star = shim(Solar.Star);
export const StarOff = shim(Solar.Star);
export const StickyNote = shim(Solar.Notes);
export const Tag = shim(Solar.Tag);
export const TagIcon = shim(Solar.Tag);
export const Trash = shim(Solar.TrashBinMinimalistic);
export const Trash2 = shim(Solar.TrashBin2);
export const TrendingDown = shim(Solar.GraphDown);
export const TrendingUp = shim(Solar.GraphUp);
export const Triangle = shim(Solar.DangerTriangle);
export const TriangleAlert = shim(Solar.DangerTriangle);
export const Type = shim(Solar.Text);
export const UploadCloud = shim(Solar.CloudUpload);
export const User = shim(Solar.User);
export const User2 = shim(Solar.User);
export const UserPlus = shim(Solar.UserPlus);
export const UserRound = shim(Solar.UserCircle);
export const Users = shim(Solar.UsersGroupRounded);
export const Wand2 = shim(Solar.MagicStick);
export const WarningOctagon = shim(Solar.Danger);
export const Whiteboard = shim(Solar.RulerCrossPen);
export const X = shim(Solar.CloseCircle);
export const XCircle = shim(Solar.CloseCircle);
export const XIcon = shim(Solar.CloseCircle);
