// Handmatig beheerde scoreconfiguratie. Dit bestand wordt nooit door de build
// overschreven. Gebruik een document-ID uit data/data.js als sleutel.
//
// Voorbeeld:
// "01abc": {
//   "algemeen:top-100": { adjustment: 15 },
//   consensus: { adjustment: 20 },
//   nieuw: { exclude: true },
// }
export const SCORE_CONFIG = {
  defaults: {
    existing: {
      // Een plaats hoger in de oorspronkelijke Readwise-volgorde is één punt waard.
      positionWeight: 1,
    },
    derived: {
      consensusTop10Bonus: 100,
      consensusFamilyWeight: 10,
    },
  },
  overrides: {},
};

if (typeof window !== "undefined") {
  window.TOP_ARTICLE_SCORING = SCORE_CONFIG;
}
