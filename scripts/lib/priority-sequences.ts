export const BASE_SEQUENCE_ORDER = ["video", "boek", "pdf", "lees", "dutch", "short", "short-dutch"] as const;
export type PrioritySequenceV2 = (typeof BASE_SEQUENCE_ORDER)[number];

const EXTENDED_SEQUENCES = ["luchtig", "luchtig-nederlands", "scrum", "software-development", "front-end-development", "social-studies", "adhd"] as const;
export const SEQUENCE_ORDER = [...BASE_SEQUENCE_ORDER, ...EXTENDED_SEQUENCES] as const;
export type PrioritySequence = (typeof SEQUENCE_ORDER)[number];

/** Sequences whose ranking is driven by topic relevance rather than global relevance. */
export const TOPIC_SEQUENCE_ORDER = [
  "scrum",
  "software-development",
  "front-end-development",
  "social-studies",
  "adhd",
] as const;
export type TopicSequence = (typeof TOPIC_SEQUENCE_ORDER)[number];
