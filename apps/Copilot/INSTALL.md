# Installing DragonFruit Atlas (Beta)

Atlas is in early beta. This build is signed but **not yet notarized by Apple**, so
the first time you open it macOS shows an extra security prompt. It's a one-time
step — here's how to get past it.

## 1. Install

1. Open `DragonFruit Atlas.dmg`.
2. Drag **DragonFruit Atlas** onto the **Applications** folder.
3. Eject the disk image.

## 2. First launch (one time only)

When you open Atlas the first time, macOS says it _"cannot verify the developer."_
That's expected for a beta — do this once:

1. Open Atlas from Applications (it gets blocked — that's fine, close the dialog).
2. Go to → **System Settings → Privacy & Security**.
3. Scroll down to the message about _DragonFruit Atlas_ and click **Open Anyway**.
4. Confirm with Touch ID or your password.

Atlas opens normally from then on.

> **Prefer the terminal?** One command does the same thing:
>
> ```sh
> xattr -dr com.apple.quarantine "/Applications/DragonFruit Atlas.app"
> ```

## 3. Grant permissions

Atlas lives in your menu bar (look for the icon at the top-right). The first time
you use each feature it asks for a macOS permission — approve them so it works:

- **Accessibility** — for global hotkeys and dictation into the focused app.
- **Microphone** + **Speech Recognition** — for voice capture and dictation.
- **System Audio Recording Only** — only for Meeting Notes (capturing call audio).

You can re-check any of these from the panel (**Reset Accessibility access**) or in
**System Settings → Privacy & Security**.

## Updates

Atlas updates itself automatically — you'll get a prompt when a new build is out.
You can also trigger a check from the panel via **Check for Updates…**.

---

Hitting a snag? Ping the team and we'll sort it out.
