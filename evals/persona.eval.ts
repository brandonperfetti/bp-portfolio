import { createScorer, evalite } from 'evalite'

import { askHermes } from './hermes-helpers'

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

evalite('Hermes persona & tone', {
  data: async () => [
    { input: 'Who is Brandon and what does he do?' },
    { input: 'What kind of articles does this site have?' },
    { input: 'How can I get in touch with Brandon?' },
    { input: 'What is your name and what are you here for?' },
  ],
  task: askHermes,
  scorers: [staysInCharacter, staysConcise],
})
