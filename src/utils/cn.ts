import clsx, { type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const COLORS = ["neutral", "primary", "secondary", "accent", "info", "success", "warning", "error"];
const SIZES = ["xs", "sm", "md", "lg", "xl"];
const STYLES = ["outline", "dash", "soft", "ghost", "link"];

const CLASS_GROUPS = {
  "daisy-base": ["btn", "input", "select", "textarea", "badge", "table", "menu", "card", "alert", "modal-box"],
  "daisy-btn-color": [{ btn: COLORS }],
  "daisy-btn-style": [{ btn: STYLES }],
  "daisy-btn-size": [{ btn: SIZES }],
  "daisy-btn-shape": [{ btn: ["square", "circle", "wide", "block"] }],
  "daisy-input-color": [{ input: COLORS }],
  "daisy-input-size": [{ input: SIZES }],
  "daisy-select-color": [{ select: COLORS }],
  "daisy-select-size": [{ select: SIZES }],
  "daisy-textarea-color": [{ textarea: COLORS }],
  "daisy-textarea-size": [{ textarea: SIZES }],
  "daisy-checkbox-color": [{ checkbox: COLORS }],
  "daisy-checkbox-size": [{ checkbox: SIZES }],
  "daisy-radio-color": [{ radio: COLORS }],
  "daisy-radio-size": [{ radio: SIZES }],
  "daisy-toggle-color": [{ toggle: COLORS }],
  "daisy-toggle-size": [{ toggle: SIZES }],
  "daisy-badge-color": [{ badge: COLORS }],
  "daisy-badge-style": [{ badge: STYLES }],
  "daisy-badge-size": [{ badge: SIZES }],
  "daisy-table-size": [{ table: SIZES }],
  "daisy-alert-color": [{ alert: COLORS }],
  "daisy-alert-style": [{ alert: STYLES }],
  "daisy-loading-type": [{ loading: ["spinner", "dots", "ring", "ball", "bars", "infinity"] }],
  "daisy-loading-size": [{ loading: SIZES }],
  "daisy-menu-size": [{ menu: SIZES }],
  "daisy-menu-direction": [{ menu: ["horizontal", "vertical"] }],
  "daisy-modal-placement": [{ modal: ["top", "middle", "bottom", "start", "end"] }],
};

const twMerge = extendTailwindMerge<keyof typeof CLASS_GROUPS>({
  extend: { classGroups: CLASS_GROUPS },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function omitClass(attrs: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...attrs };
  delete rest.class;

  return rest;
}
