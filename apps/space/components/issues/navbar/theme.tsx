/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { IconButton } from "@dragonfruit/propel/icon-button";
import { observer } from "mobx-react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "@solar-icons/react/ssr";

export const NavbarTheme = observer(function NavbarTheme() {
  // states
  const [appTheme, setAppTheme] = useState("light");
  // theme
  const { setTheme, theme } = useTheme();

  const handleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  useEffect(() => {
    if (!theme) return;
    setAppTheme(theme);
  }, [theme]);

  return (
    <IconButton
      variant="ghost"
      size="lg"
      icon={appTheme === "light" ? Moon : Sun}
      aria-label={appTheme === "light" ? "Switch to dark theme" : "Switch to light theme"}
      className="relative"
      onClick={handleTheme}
    />
  );
});
