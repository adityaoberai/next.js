import { FallbackMode } from '../../../lib/fallback'

/**
 * Calculates the fallback mode based on the given parameters.
 *
 * @param dynamicParams - Whether dynamic params are enabled.
 * @param fallbackRootParams - The root params that are part of the fallback.
 * @param baseFallbackMode - The base fallback mode to use.
 * @returns The calculated fallback mode.
 */
export function calculateFallbackMode(
  dynamicParams: boolean,
  fallbackRootParams: readonly string[],
  baseFallbackMode: FallbackMode | undefined
): FallbackMode {
  return dynamicParams
    ? // If the fallback params includes any root params, then we need to
      // perform a blocking static render.
      fallbackRootParams.length > 0
      ? FallbackMode.BLOCKING_STATIC_RENDER
      : (baseFallbackMode ?? FallbackMode.NOT_FOUND)
    : FallbackMode.NOT_FOUND
}
