/** Everyday settings in one scroll; power-user sections grouped at the bottom. */
export const SETTINGS_UNIFIED_MAIN_SECTION_IDS = [
  "account",
  "profiles",
  "appearance",
  "layout",
  "playback",
  "integration",
  "trakt",
  "about"
];

export const SETTINGS_UNIFIED_EXPERT_SECTION_IDS = [
  "contentDiscovery",
  "plugins",
  "streams",
  "advanced"
];

export function useUnifiedSettingsLayout() {
  return true;
}

export function filterSectionsByIds(sections, ids) {
  const order = new Map(ids.map((id, index) => [id, index]));
  return sections
    .filter((section) => order.has(section.id))
    .sort((left, right) => order.get(left.id) - order.get(right.id));
}

export function getUnifiedMainSections(visibleSections) {
  return filterSectionsByIds(visibleSections, SETTINGS_UNIFIED_MAIN_SECTION_IDS);
}

export function getUnifiedExpertSections(visibleSections) {
  return filterSectionsByIds(visibleSections, SETTINGS_UNIFIED_EXPERT_SECTION_IDS);
}
