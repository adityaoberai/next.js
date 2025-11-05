import type { Params } from '../../../server/request/params'
import type { WorkStore } from '../../../server/app-render/work-async-storage.external'
import type { AppSegment } from '../../segment-config/app/app-segments'
import { throwEmptyGenerateStaticParamsError } from '../../../shared/lib/errors/empty-generate-static-params-error'

/**
 * Processes app directory segments to build route parameters from generateStaticParams functions.
 * This function walks through the segments array and calls generateStaticParams for each segment that has it,
 * combining parent parameters with child parameters to build the complete parameter combinations.
 * Uses iterative processing instead of recursion for better performance.
 *
 * @param segments - Array of app directory segments to process
 * @param store - Work store for tracking fetch cache configuration
 * @returns Promise that resolves to an array of all parameter combinations
 */
export async function generateRouteStaticParams(
  segments: ReadonlyArray<
    Readonly<Pick<AppSegment, 'config' | 'generateStaticParams'>>
  >,
  store: Pick<WorkStore, 'fetchCache'>,
  isRoutePPREnabled: boolean
): Promise<Params[]> {
  // Early return if no segments to process
  if (segments.length === 0) return []

  // Use iterative processing with a work queue to avoid recursion overhead
  interface WorkItem {
    segmentIndex: number
    params: Params[]
  }

  const queue: WorkItem[] = [{ segmentIndex: 0, params: [] }]
  let currentParams: Params[] = []

  while (queue.length > 0) {
    const { segmentIndex, params } = queue.shift()!

    // If we've processed all segments, this is our final result
    if (segmentIndex >= segments.length) {
      currentParams = params
      break
    }

    const current = segments[segmentIndex]

    // Skip segments without generateStaticParams and continue to next
    if (typeof current.generateStaticParams !== 'function') {
      queue.push({ segmentIndex: segmentIndex + 1, params })
      continue
    }

    // Configure fetchCache if specified
    if (current.config?.fetchCache !== undefined) {
      store.fetchCache = current.config.fetchCache
    }

    const nextParams: Params[] = []

    // If there are parent params, we need to process them.
    if (params.length > 0) {
      // Process each parent parameter combination
      for (const parentParams of params) {
        const result = await current.generateStaticParams({
          params: parentParams,
        })

        if (result.length > 0) {
          // Merge parent params with each result item
          for (const item of result) {
            nextParams.push({ ...parentParams, ...item })
          }
        } else if (isRoutePPREnabled) {
          throwEmptyGenerateStaticParamsError()
        } else {
          // No results, just pass through parent params
          nextParams.push(parentParams)
        }
      }
    } else {
      // No parent params, call generateStaticParams with empty object
      const result = await current.generateStaticParams({ params: {} })
      if (result.length === 0 && isRoutePPREnabled) {
        throwEmptyGenerateStaticParamsError()
      }

      nextParams.push(...result)
    }

    // Add next segment to work queue
    queue.push({ segmentIndex: segmentIndex + 1, params: nextParams })
  }

  return currentParams
}
