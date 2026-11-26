/** The widget's entries in the command palette. */
import type { PaletteItem } from "../palette";
import type { WidgetSettings } from "./config";

export function widgetPaletteItems(settings: WidgetSettings, act: { show: () => void; customize: () => void }): PaletteItem[] {
  const keywords = "usage widget tokens limits cost";
  const items: PaletteItem[] = [{ id: "widget-customize", label: "Customize the usage widget", group: "App", keywords, run: act.customize }];
  if (settings.position === "hidden") items.unshift({ id: "widget-show", label: "Show the usage widget", group: "App", keywords, run: act.show });
  return items;
}
