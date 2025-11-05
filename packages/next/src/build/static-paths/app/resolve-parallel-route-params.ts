import type { LoaderTree } from '../../../server/lib/app-dir-module'
import type { Params } from '../../../server/request/params'
import type { FallbackRouteParam } from '../types'
import { InvariantError } from '../../../shared/lib/invariant-error'
import { getSegmentParam } from '../../../shared/lib/router/utils/get-segment-param'
import { parseLoaderTree } from '../../../shared/lib/router/utils/parse-loader-tree'
import { INTERCEPTION_ROUTE_MARKERS } from '../../../shared/lib/router/utils/interception-routes'
import { createFallbackRouteParam } from '../utils'

/**
 * Resolves parallel route parameters from the loader tree. This function uses
 * tree-based traversal to correctly handle the hierarchical structure of parallel
 * routes and accurately determine parameter values based on their depth in the tree.
 *
 * Unlike interpolateParallelRouteParams (which has a complete URL at runtime),
 * this build-time function determines which parallel route params are unknown.
 * The pathname may contain placeholders like [slug], making it incomplete.
 *
 * @param loaderTree - The loader tree structure containing route hierarchy
 * @param params - The current route parameters object (will be mutated)
 * @param pathname - The current pathname being processed (may contain placeholders)
 * @param fallbackRouteParams - Array of fallback route parameters (will be mutated)
 */
export function resolveParallelRouteParams(
  loaderTree: LoaderTree,
  params: Params,
  pathname: string,
  fallbackRouteParams: FallbackRouteParam[]
): void {
  // Stack-based traversal with depth and parallel route key tracking
  const stack: Array<{
    tree: LoaderTree
    depth: number
    parallelKey: string
  }> = [{ tree: loaderTree, depth: 0, parallelKey: 'children' }]

  // Parse pathname into segments for depth-based resolution
  const pathSegments = pathname.split('/').filter(Boolean)

  while (stack.length > 0) {
    const { tree, depth, parallelKey } = stack.pop()!
    const { segment, parallelRoutes } = parseLoaderTree(tree)

    // Only process segments that are in parallel routes (not the main 'children' route)
    if (parallelKey !== 'children') {
      const segmentParam = getSegmentParam(segment)

      if (segmentParam && !params.hasOwnProperty(segmentParam.param)) {
        const { param: paramName, type: paramType } = segmentParam

        switch (paramType) {
          case 'catchall':
          case 'optional-catchall':
          case 'catchall-intercepted-(..)(..)':
          case 'catchall-intercepted-(.)':
          case 'catchall-intercepted-(..)':
          case 'catchall-intercepted-(...)':
            // If there are any non-parallel fallback route segments, we can't use the
            // pathname to derive the value because it's not complete. We can make
            // this assumption because routes are resolved left to right.
            if (
              fallbackRouteParams.some((param) => !param.isParallelRouteParam)
            ) {
              fallbackRouteParams.push(
                createFallbackRouteParam(paramName, paramType, true)
              )
              break
            }

            // For catchall routes in parallel segments, derive from pathname
            // using depth to determine which segments to use
            const remainingSegments = pathSegments.slice(depth)

            // Process segments to handle any embedded dynamic params
            // Track if we encounter any unknown param placeholders
            let hasUnknownParam = false
            const processedSegments = remainingSegments
              .flatMap((pathSegment) => {
                const param = getSegmentParam(pathSegment)
                if (param) {
                  // If the segment is a param placeholder, check if we have its value
                  if (!params.hasOwnProperty(param.param)) {
                    // Unknown param placeholder in pathname - can't derive full value
                    hasUnknownParam = true
                    return undefined
                  }
                  // If the segment matches a param, return the param value
                  // We don't encode values here as that's handled during retrieval.
                  return params[param.param]
                }
                // Otherwise it's a static segment
                return pathSegment
              })
              .filter((s) => s !== undefined)

            // If we encountered any unknown param placeholders, we can't derive
            // the full catch-all value from the pathname, so mark as fallback.
            if (hasUnknownParam) {
              fallbackRouteParams.push(
                createFallbackRouteParam(paramName, paramType, true)
              )
              break
            }

            if (processedSegments.length > 0) {
              params[paramName] = processedSegments
            } else if (paramType === 'optional-catchall') {
              params[paramName] = []
            } else {
              // We shouldn't be able to match a catchall segment without any path
              // segments if it's not an optional catchall
              throw new InvariantError(
                `Unexpected empty path segments match for a pathname "${pathname}" with param "${paramName}" of type "${paramType}"`
              )
            }
            break

          case 'dynamic':
          case 'dynamic-intercepted-(..)(..)':
          case 'dynamic-intercepted-(.)':
          case 'dynamic-intercepted-(..)':
          case 'dynamic-intercepted-(...)':
            // For regular dynamic parameters, take the segment at this depth
            if (depth < pathSegments.length) {
              const pathSegment = pathSegments[depth]
              const param = getSegmentParam(pathSegment)

              // Check if the segment at this depth is a placeholder for an unknown param
              if (param && !params.hasOwnProperty(param.param)) {
                // The segment is a placeholder like [category] and we don't have the value
                fallbackRouteParams.push(
                  createFallbackRouteParam(paramName, paramType, true)
                )
                break
              }

              // If the segment matches a param, use the param value from params object
              // Otherwise it's a static segment, just use it directly
              // We don't encode values here as that's handled during retrieval
              params[paramName] = param ? params[param.param] : pathSegment
            } else {
              // No segment at this depth, mark as fallback.
              fallbackRouteParams.push(
                createFallbackRouteParam(paramName, paramType, true)
              )
            }
            break

          default:
            paramType satisfies never
        }
      }
    }

    // Calculate next depth - increment if this is not a route group and not empty
    let nextDepth = depth
    // Route groups are like (marketing) or (dashboard), NOT interception routes like (.)photo
    // Interception routes start with markers like (.), (..), (...), (..)(..)) and should increment depth
    const isInterceptionRoute = INTERCEPTION_ROUTE_MARKERS.some((marker) =>
      segment.startsWith(marker)
    )
    const isRouteGroup =
      !isInterceptionRoute && segment.startsWith('(') && segment.endsWith(')')
    if (!isRouteGroup && segment !== '') {
      nextDepth++
    }

    // Add all parallel routes to the stack for processing.
    for (const [key, route] of Object.entries(parallelRoutes)) {
      stack.push({ tree: route, depth: nextDepth, parallelKey: key })
    }
  }
}
