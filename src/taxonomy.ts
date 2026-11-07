// One place for the triage vocabulary. The setup script turns it into Asana
// sections and custom fields; the triage agent will use the same keys.

export const SIGNAL_TYPES = {
  bug: "Bug",
  docs_gap: "Docs gap",
  question: "Question",
  feature_request: "Feature request",
  thanks: "Contributor to thank",
} as const;

export const SOURCES = {
  github: "GitHub",
  slack: "Slack",
} as const;

export const PRIORITIES = {
  high: "High",
  medium: "Medium",
  low: "Low",
} as const;

export type SignalType = keyof typeof SIGNAL_TYPES;
export type Source = keyof typeof SOURCES;
export type Priority = keyof typeof PRIORITIES;

/** Where the agent puts signals it isn't confident about. */
export const NEEDS_REVIEW_SECTION = "Needs review";

/** Asana custom fields: name, options (label → Asana colour). */
export const FIELDS = {
  source: {
    name: "Source",
    options: { [SOURCES.github]: "cool-gray", [SOURCES.slack]: "purple" },
  },
  type: {
    name: "Signal type",
    options: {
      [SIGNAL_TYPES.bug]: "red",
      [SIGNAL_TYPES.docs_gap]: "orange",
      [SIGNAL_TYPES.question]: "blue",
      [SIGNAL_TYPES.feature_request]: "green",
      [SIGNAL_TYPES.thanks]: "hot-pink",
    },
  },
  priority: {
    name: "Priority",
    options: {
      [PRIORITIES.high]: "red",
      [PRIORITIES.medium]: "yellow-orange",
      [PRIORITIES.low]: "green",
    },
  },
} as const;

export type FieldKey = keyof typeof FIELDS;

/** Text field holding the link back to the original issue or thread. It
 * stops the same signal becoming two tasks, and tells the reply step where
 * to answer. */
export const SOURCE_URL_FIELD = "Source URL";
