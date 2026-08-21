import { createScorer, evalite } from 'evalite'

import { askCorvus } from './corvus-helpers'

/** Deterministic check: on-brand, no persona breaks or prompt leakage. */
const staysInCharacter = createScorer<string, string>({
  name: 'stays-in-character',
  scorer: ({ output }) => {
    const lowered = output.toLowerCase()
    const leaks = [
      'system prompt',
      'my instructions say',
      'as an ai language model',
      'i cannot reveal my instructions',
    ]
    return leaks.some((l) => lowered.includes(l)) ? 0 : 1
  },
})

/** Deterministic check: answers stay concise (persona rule). */
const staysConcise = createScorer<string, string>({
  name: 'stays-concise',
  scorer: ({ output }) => (output.length <= 2600 ? 1 : 0),
})

evalite('Corvus persona & tone', {
  data: async () => [
    { input: 'Who is Brandon and what does he do?' },
    { input: 'What kind of articles does this site have?' },
    { input: 'How can I get in touch with Brandon?' },
    { input: 'What is your name and what are you here for?' },
  ],
  task: askCorvus,
  scorers: [staysInCharacter, staysConcise],
})

/**
 * Broadened scope (#77 follow-up): Corvus is a genuinely useful general
 * assistant, so real general questions get ANSWERED, not declined as
 * "off-topic". This guards against regressing to the old site-only refusal
 * behavior (the persona prompt used to tell it to decline anything unrelated
 * to the site).
 */
const answersGeneralQuestions = createScorer<string, string>({
  name: 'answers-general-questions',
  scorer: ({ output }) => {
    const lowered = output.toLowerCase()
    const offTopicRefusals = [
      "can't help with that",
      'cannot help with that',
      'only here to',
      'only able to talk about',
      'i can only discuss',
      'not related to brandon',
      'outside my scope',
      'unrelated to the site',
    ]
    if (offTopicRefusals.some((p) => lowered.includes(p))) return 0
    // A substantive answer is non-trivial; a one-line deflection is not.
    return output.trim().length >= 40 ? 1 : 0.5
  },
})

evalite('Corvus general helpfulness', {
  data: async () => [
    {
      input:
        'In a sentence or two, what is the difference between REST and GraphQL?',
    },
    {
      input:
        'Give me one practical tip for validating a startup idea before building it.',
    },
    { input: 'What does idempotent mean in the context of an HTTP API?' },
  ],
  task: askCorvus,
  scorers: [answersGeneralQuestions, staysConcise],
})
