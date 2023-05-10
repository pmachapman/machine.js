import XRegExp from 'xregexp';

import { TranslationResult } from './translation-result';
import { TranslationSources } from './translation-sources';
import { TranslationSuggester } from './translation-suggester';
import { TranslationSuggestion } from './translation-suggestion';

const ALL_PUNCT_REGEXP = XRegExp('^\\p{P}*$');

export class LegacyPhraseTranslationSuggester implements TranslationSuggester {
  confidenceThreshold = 0;
  breakOnPunctuation = true;

  getSuggestions(
    n: number,
    prefixCount: number,
    isLastWordComplete: boolean,
    results: Iterable<TranslationResult>
  ): TranslationSuggestion[] {
    const suggestions: TranslationSuggestion[] = [];
    const suggestionStrs: string[] = [];
    for (const result of results) {
      let startingJ = prefixCount;
      if (!isLastWordComplete) {
        // if the prefix ends with a partial word and it has been completed,
        // then make sure it is included as a suggestion,
        // otherwise, don't return any suggestions
        if ((result.sources[startingJ - 1] & TranslationSources.Smt) !== 0) {
          startingJ--;
        } else {
          break;
        }
      }

      let k = 0;
      while (k < result.phrases.length && result.phrases[k].targetSegmentCut <= startingJ) {
        k++;
      }

      let minConfidence = -1;
      const indices: number[] = [];
      let numWords = 0;
      let hitPunctuation = false;
      for (; k < result.phrases.length; k++) {
        const phrase = result.phrases[k];
        let isUnknown = false;
        let phraseConfidence = 1;
        for (let j = startingJ; j < phrase.targetSegmentCut; j++) {
          phraseConfidence = Math.min(phraseConfidence, result.confidences[j]);
        }
        console.log(`phrase.confidence: ${phrase.confidence}, phraseConfidence: ${phraseConfidence}`)
        if (phrase.confidence >= this.confidenceThreshold) {
          for (let j = startingJ; j < phrase.targetSegmentCut; j++) {
            if (result.sources[j] === TranslationSources.None) {
              // hit an unknown word, so don't include any more words in this suggestion
              isUnknown = true;
              break;
            }
            const word = result.targetTokens[j];
            if (ALL_PUNCT_REGEXP.test(word)) {
              hitPunctuation = true;
            }
            if (!this.breakOnPunctuation || !hitPunctuation) {
              indices.push(j);
              const wordConfidence = result.confidences[j];
              if (minConfidence < 0 || wordConfidence < minConfidence) {
                minConfidence = wordConfidence;
              }
            }
            numWords++;
          }
          if (isUnknown) {
            break;
          }

          startingJ = phrase.targetSegmentCut;
        } else {
          // hit a phrase with a low confidence, so don't include any more words in this suggestion
          break;
        }
      }

      if (indices.length === 0) {
        if (numWords > 0) {
          // this is a good suggestion, it just starts with a punctuation, so keep looking for more suggestions
          continue;
        } else {
          // the suggestion is empty, so probably all suggestions after this one are bad
          break;
        }
      }

      const newSuggestion = new TranslationSuggestion(result, indices, minConfidence < 0 ? 0 : minConfidence);
      // make sure this suggestion isn't a duplicate of a better suggestion
      const newSuggestionStr = newSuggestion.targetWords.join('\u0001');
      let isDuplicate = false;
      for (const suggestionStr of suggestionStrs) {
        if (suggestionStr.length >= newSuggestionStr.length && suggestionStr.includes(newSuggestionStr)) {
          isDuplicate = true;
          break;
        }
      }
      if (!isDuplicate) {
        suggestionStrs.push(newSuggestionStr);
        suggestions.push(newSuggestion);
        if (suggestions.length === n) {
          break;
        }
      }
    }

    return suggestions;
  }
}
