import type { Params } from '../../../server/request/params'

/**
 * Filters out duplicate parameters from a list of parameters.
 * This function uses a Map to efficiently store and retrieve unique parameter combinations.
 *
 * @param childrenRouteParams - The keys of the parameters. These should be sorted to ensure consistent key generation.
 * @param routeParams - The list of parameter objects to filter.
 * @returns A new array containing only the unique parameter combinations.
 */
export function filterUniqueParams(
  childrenRouteParams: readonly { paramName: string }[],
  routeParams: readonly Params[]
): Params[] {
  // A Map is used to store unique parameter combinations. The key of the Map
  // is a string representation of the parameter combination, and the value
  // is the actual `Params` object.
  const unique = new Map<string, Params>()

  // Iterate over each parameter object in the input array.
  for (const params of routeParams) {
    let key = '' // Initialize an empty string to build the unique key for the current `params` object.

    // Iterate through the `routeParamKeys` (which are assumed to be sorted).
    // This consistent order is crucial for generating a stable and unique key
    // for each parameter combination.
    for (const { paramName: paramKey } of childrenRouteParams) {
      const value = params[paramKey]

      // Construct a part of the key using the parameter key and its value.
      // A type prefix (`A:` for Array, `S:` for String, `U:` for undefined) is added to the value
      // to prevent collisions. For example, `['a', 'b']` and `'a,b'` would
      // otherwise generate the same string representation, leading to incorrect
      // deduplication. This ensures that different types with the same string
      // representation are treated as distinct.
      let valuePart: string
      if (Array.isArray(value)) {
        valuePart = `A:${value.join(',')}`
      } else if (value === undefined) {
        valuePart = `U:undefined`
      } else {
        valuePart = `S:${value}`
      }
      key += `${paramKey}:${valuePart}|`
    }

    // If the generated key is not already in the `unique` Map, it means this
    // parameter combination is unique so far. Add it to the Map.
    if (!unique.has(key)) {
      unique.set(key, params)
    }
  }

  // Convert the Map's values (the unique `Params` objects) back into an array
  // and return it.
  return Array.from(unique.values())
}
