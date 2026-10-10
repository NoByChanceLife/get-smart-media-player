import type { XtreamCategory } from '../types/xtream';

/**
 * Discreet discovery is unconditional. It is NOT an access-control decision:
 * unlocked adults may still deliberately browse a provider category.
 * Restrict only automatic Home/recommendation/history/search exposure.
 *
 * We use explicit adult markers and source category labels rather than guessing
 * from ratings, actors or ordinary words such as "mature"/"romance".
 * Provider metadata is not always reliable; a later metadata/manual-hide system
 * will cover uncategorized listings.
 */
const ADULT_MARKER = /(?:^|[\s\-_/|()[\].,:])(?:adult(?:s)?|xxx|porn(?:ography)?|erotic(?:a)?|hardcore|18\s*\+|18plus|nsfw|x[\s-]?rated|explicit\s+adult)(?=$|[\s\-_/|()[\].,:])/i;

export const hasExplicitAdultMarker = (value?: string | null): boolean => {
  if (!value) return false;
  // This TV brand is not itself an adult-content channel.
  if (/^adult\s+swim$/i.test(value.trim())) return false;
  return ADULT_MARKER.test(value);
};

export const adultDiscoveryCategoryIds = (categories: XtreamCategory[]): Set<string> =>
  new Set(
    categories
      .filter((category) => hasExplicitAdultMarker(category.category_name))
      .map((category) => String(category.category_id))
  );

export const isPrivateDiscoveryContent = (
  item: { name: string; category_id?: string },
  adultCategoryIds: ReadonlySet<string>
): boolean =>
  hasExplicitAdultMarker(item.name) ||
  (item.category_id !== undefined && adultCategoryIds.has(String(item.category_id)));

export const isPrivateHistoryTitle = (item: { title: string; subtitle?: string }): boolean =>
  hasExplicitAdultMarker(item.title) || hasExplicitAdultMarker(item.subtitle);
