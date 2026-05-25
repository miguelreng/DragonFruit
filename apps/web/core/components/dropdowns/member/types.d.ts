import type { TDropdownProps } from "../types";

export type MemberDropdownProps = TDropdownProps & {
  avatarSize?: "sm" | "md" | "base" | "lg" | number;
  button?: React.ReactNode;
  dropdownArrow?: boolean;
  dropdownArrowClassName?: string;
  iconClassName?: string;
  placeholder?: string;
  tooltipContent?: string;
  onClose?: () => void;
  showUserDetails?: boolean;
  /**
   * When true, enabled workspace agents are listed alongside human members
   * — both in the trigger avatar group and in the options dropdown. Only
   * enable for issue-assignee pickers; module/project leads, draft issue
   * properties, and other human-only fields should leave this off.
   */
  includeAgents?: boolean;
} & (
    | {
        multiple: false;
        onChange: (val: string | null) => void;
        value: string | null;
      }
    | {
        multiple: true;
        onChange: (val: string[]) => void;
        value: string[];
      }
  );
