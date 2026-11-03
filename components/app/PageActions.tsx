"use client";

import * as React from "react";
import { createPortal } from "react-dom";

// A tab's buttons belong in the page's toolbar, next to the tabs, while their state stays inside the tab.
const Slot = React.createContext<HTMLElement | null>(null);

export const PageActionsSlot = Slot.Provider;

/** Each tab's main button has the same width, so switching tabs leaves the toolbar's right edge where it was. */
export const PAGE_ACTION = "min-w-32";

/** Renders into the toolbar of the surrounding page; renders nothing outside one. */
export function PageActions({ children }: { children: React.ReactNode }) {
  const slot = React.useContext(Slot);
  return slot ? createPortal(children, slot) : null;
}
