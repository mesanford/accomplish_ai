/** Every feature category on the features page, in order. */
import { ADVANCEMENT_CATEGORIES, type FeatureCategory } from './featuresAdvancement';
import { TROOP_CATEGORIES } from './featuresTroop';

export type { Feature, FeatureCategory } from './featuresAdvancement';
export const FEATURE_CATEGORIES: FeatureCategory[] = [
  ...ADVANCEMENT_CATEGORIES,
  ...TROOP_CATEGORIES,
];
