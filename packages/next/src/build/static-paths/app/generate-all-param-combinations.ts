import type { Params } from '../../../server/request/params'

/**
 * Generates all unique sub-combinations of Route Parameters from a list of Static Parameters.
 * This function creates all possible prefixes of the Route Parameters, which is
 * useful for generating Static Shells that can serve as Fallback Shells for more specific Route Shells.
 *
 * When Root Parameters are provided, the function ensures that Static Shells only
 * include complete sets of Root Parameters. This prevents generating invalid Static Shells
 * that are missing required Root Parameters.
 *
 * Example with Root Parameters ('lang', 'region') and Route Parameters ('lang', 'region', 'slug'):
 *
 * Given the following Static Parameters:
 * ```
 * [
 *   { lang: 'en', region: 'US', slug: ['home'] },
 *   { lang: 'en', region: 'US', slug: ['about'] },
 *   { lang: 'fr', region: 'CA', slug: ['about'] },
 * ]
 * ```
 *
 * The result will be:
 * ```
 * [
 *   { lang: 'en', region: 'US' },  // Complete Root Parameters
 *   { lang: 'en', region: 'US', slug: ['home'] },
 *   { lang: 'en', region: 'US', slug: ['about'] },
 *   { lang: 'fr', region: 'CA' },  // Complete Root Parameters
 *   { lang: 'fr', region: 'CA', slug: ['about'] },
 * ]
 * ```
 *
 * Note that partial combinations like `{ lang: 'en' }` are NOT generated because
 * they don't include the complete set of Root Parameters.
 *
 * For routes without Root Parameters (e.g., `/[slug]`), all sub-combinations are generated
 * as before.
 *
 * @param childrenRouteParams - The children route params. These should be sorted
 *   to ensure consistent key generation for the internal Map.
 * @param routeParams - The list of Static Parameters to filter.
 * @param rootParamKeys - The keys of the Root Parameters. When provided, ensures Static Shells
 *   include all Root Parameters.
 * @returns A new array containing all unique sub-combinations of Route Parameters.
 */
export function generateAllParamCombinations(
  childrenRouteParams: ReadonlyArray<{
    readonly paramName: string
  }>,
  routeParams: readonly Params[],
  rootParamKeys: readonly string[]
): Params[] {
  // A Map is used to store unique combinations of Route Parameters.
  // The key of the Map is a string representation of the Route Parameter
  // combination, and the value is the `Params` object containing only
  // the Route Parameters.
  const combinations = new Map<string, Params>()

  // Determine the minimum index where all Root Parameters are included.
  // This optimization ensures we only generate combinations that include
  // a complete set of Root Parameters, preventing invalid Static Shells.
  //
  // For example, if rootParamKeys = ['lang', 'region'] and routeParamKeys = ['lang', 'region', 'slug']:
  // - 'lang' is at index 0, 'region' is at index 1
  // - minIndexForCompleteRootParams = max(0, 1) = 1
  // - We'll only generate combinations starting from index 1 (which includes both lang and region)
  let minIndexForCompleteRootParams = -1
  if (rootParamKeys.length > 0) {
    // Find the index of the last Root Parameter in routeParamKeys.
    // This tells us the minimum combination length needed to include all Root Parameters.
    for (const rootParamKey of rootParamKeys) {
      const index = childrenRouteParams.findIndex(
        (param) => param.paramName === rootParamKey
      )
      if (index === -1) {
        // Root Parameter not found in Route Parameters - this shouldn't happen in normal cases
        // but we handle it gracefully by treating it as if there are no Root Parameters.
        // This allows the function to fall back to generating all sub-combinations.
        minIndexForCompleteRootParams = -1
        break
      }
      // Track the highest index among all Root Parameters.
      // This ensures all Root Parameters are included in any generated combination.
      minIndexForCompleteRootParams = Math.max(
        minIndexForCompleteRootParams,
        index
      )
    }
  }

  // Iterate over each Static Parameter object in the input array.
  // Each params object represents one potential route combination (e.g., { lang: 'en', region: 'US', slug: 'home' })
  for (const params of routeParams) {
    // Generate all possible prefix combinations for this Static Parameter set.
    // For routeParamKeys = ['lang', 'region', 'slug'], we'll generate combinations at:
    // - i=0: { lang: 'en' }
    // - i=1: { lang: 'en', region: 'US' }
    // - i=2: { lang: 'en', region: 'US', slug: 'home' }
    //
    // The iteration order is crucial for generating stable and unique keys
    // for each Route Parameter combination.
    for (let i = 0; i < childrenRouteParams.length; i++) {
      // Skip generating combinations that don't include all Root Parameters.
      // This prevents creating invalid Static Shells that are missing required Root Parameters.
      //
      // For example, if Root Parameters are ['lang', 'region'] and minIndexForCompleteRootParams = 1:
      // - Skip i=0 (would only include 'lang', missing 'region')
      // - Process i=1 and higher (includes both 'lang' and 'region')
      if (
        minIndexForCompleteRootParams >= 0 &&
        i < minIndexForCompleteRootParams
      ) {
        continue
      }

      // Initialize data structures for building this specific combination
      const combination: Params = {}
      const keyParts: string[] = []
      let hasAllRootParams = true

      // Build the sub-combination with parameters from index 0 to i (inclusive).
      // This creates a prefix of the full parameter set, building up combinations incrementally.
      //
      // For example, if routeParamKeys = ['lang', 'region', 'slug'] and i = 1:
      // - j=0: Add 'lang' parameter
      // - j=1: Add 'region' parameter
      // Result: { lang: 'en', region: 'US' }
      for (let j = 0; j <= i; j++) {
        const { paramName: routeKey } = childrenRouteParams[j]

        // Check if the parameter exists in the original params object and has a defined value.
        // This handles cases where generateStaticParams doesn't provide all possible parameters,
        // or where some parameters are optional/undefined.
        if (
          !params.hasOwnProperty(routeKey) ||
          params[routeKey] === undefined
        ) {
          // If this missing parameter is a Root Parameter, mark the combination as invalid.
          // Root Parameters are required for Static Shells, so we can't generate partial combinations without them.
          if (rootParamKeys.includes(routeKey)) {
            hasAllRootParams = false
          }
          // Stop building this combination since we've hit a missing parameter.
          // This ensures we only generate valid prefix combinations with consecutive parameters.
          break
        }

        const value = params[routeKey]
        combination[routeKey] = value

        // Construct a unique key part for this parameter to enable deduplication.
        // We use type prefixes to prevent collisions between different value types
        // that might have the same string representation.
        //
        // Examples:
        // - Array ['foo', 'bar'] becomes "A:foo,bar"
        // - String "foo,bar" becomes "S:foo,bar"
        // - This prevents collisions between ['foo', 'bar'] and "foo,bar"
        let valuePart: string
        if (Array.isArray(value)) {
          valuePart = `A:${value.join(',')}`
        } else {
          valuePart = `S:${value}`
        }
        keyParts.push(`${routeKey}:${valuePart}`)
      }

      // Build the final unique key by joining all parameter parts.
      // This key is used for deduplication in the combinations Map.
      // Format: "lang:S:en|region:S:US|slug:A:home,about"
      const currentKey = keyParts.join('|')

      // Only add the combination if it meets our criteria:
      // 1. hasAllRootParams: Contains all required Root Parameters
      // 2. !combinations.has(currentKey): Is not a duplicate of an existing combination
      //
      // This ensures we only generate valid, unique parameter combinations for Static Shells.
      if (hasAllRootParams && !combinations.has(currentKey)) {
        combinations.set(currentKey, combination)
      }
    }
  }

  // Convert the Map's values back into an array and return the final result.
  // The Map ensures all combinations are unique, and we return only the
  // parameter objects themselves, discarding the internal deduplication keys.
  return Array.from(combinations.values())
}
