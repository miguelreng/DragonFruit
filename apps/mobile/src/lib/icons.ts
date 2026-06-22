import * as Solar from "@solar-icons/react-native/Linear";

/**
 * Solar icon aliases. The app standardizes on Solar icons (`@solar-icons/react-native`,
 * thin "Linear" weight to match the previous HugeIcons stroke). Each constant is
 * re-exported under the HugeIcons name the call sites historically used, so the
 * migration was a one-line import-path swap per file. A namespace import is used so
 * names that collide with Solar's own (Bell, Bookmark) don't clash.
 */
export type AppIconComponent = typeof Solar.AddCircle;

export const Add01Icon = Solar.AddCircle;
export const ArrowDown01Icon = Solar.AltArrowDown;
export const ArrowDownLeft01Icon = Solar.ArrowLeftDown;
export const ArrowLeft01Icon = Solar.AltArrowLeft;
export const ArrowRight01Icon = Solar.AltArrowRight;
export const Bell = Solar.Bell;
export const Bookmark = Solar.Bookmark;
export const Calendar01Icon = Solar.Calendar;
export const Calendar03Icon = Solar.Calendar;
export const CalendarCheckIn01Icon = Solar.CalendarMark;
export const Cancel01Icon = Solar.CloseCircle;
export const CheckmarkCircle02Icon = Solar.CheckCircle;
export const CodeIcon = Solar.Code2;
export const Delete02Icon = Solar.TrashBinMinimalistic;
export const FigmaIcon = Solar.Palette;
export const File01Icon = Solar.File;
export const File02Icon = Solar.File;
export const Folder01Icon = Solar.Folder;
export const Folder02Icon = Solar.Folder;
export const Github01Icon = Solar.Code2;
export const Globe02Icon = Solar.Global;
export const GlobeIcon = Solar.Global;
export const GridViewIcon = Solar.Widget;
export const Home01Icon = Solar.Home;
export const Image02Icon = Solar.Gallery;
export const Location01Icon = Solar.MapPoint;
export const Logout03Icon = Solar.Logout;
export const Mail01Icon = Solar.Letter;
export const MusicNote01Icon = Solar.MusicNote;
export const NewTwitterIcon = Solar.ChatRound;
export const News01Icon = Solar.Notebook;
export const Pdf01Icon = Solar.DocumentText;
export const PlayCircle02Icon = Solar.Play;
export const PlusSignIcon = Solar.AddCircle;
export const RepeatIcon = Solar.Refresh;
export const Search01Icon = Solar.Magnifier;
export const SentIcon = Solar.Plain;
export const ShoppingBag03Icon = Solar.Bag;
export const SidebarLeftIcon = Solar.SidebarMinimalistic;
export const SparklesIcon = Solar.Stars;
export const StickyNote02Icon = Solar.Notes;
export const Task01Icon = Solar.Checklist;
export const UserGroupIcon = Solar.UsersGroupRounded;
export const Video01Icon = Solar.Videocamera;

