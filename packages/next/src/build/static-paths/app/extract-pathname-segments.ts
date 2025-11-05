import type { LoaderTree } from '../../../server/lib/app-dir-module'
import type { DynamicParamTypes } from '../../../shared/lib/app-router-types'
import { getSegmentParam } from '../../../shared/lib/router/utils/get-segment-param'
import { parseLoaderTree } from '../../../shared/lib/router/utils/parse-loader-tree'
import { INTERCEPTION_ROUTE_MARKERS } from '../../../shared/lib/router/utils/interception-routes'

/**
 * Validates that the static segments in currentPath match the corresponding
 * segments in targetSegments. This ensures we only extract dynamic parameters
 * that are part of the target pathname structure.
 *
 * Segments are compared literally - interception markers like "(.)photo" are
 * part of the pathname and must match exactly.
 *
 * @example
 * // Matching paths
 * currentPath: ['blog', '(.)photo']
 * targetSegments: ['blog', '(.)photo', '[id]']
 * → Returns true (both static segments match exactly)
 *
 * @example
 * // Non-matching paths
 * currentPath: ['blog', '(.)photo']
 * targetSegments: ['blog', 'photo', '[id]']
 * → Returns false (segments don't match - marker is part of pathname)
 *
 * @param currentPath - The accumulated path segments from the loader tree
 * @param targetSegments - The target pathname split into segments
 * @returns true if all static segments match, false otherwise
 */
function validatePrefixMatch(
  currentPath: string[],
  targetSegments: string[]
): boolean {
  for (let i = 0; i < currentPath.length; i++) {
    const pathSegment = currentPath[i]
    const targetPathSegment = targetSegments[i]

    // Both segments must be either dynamic or match exactly (literal comparison)
    const pathParam = getSegmentParam(pathSegment)
    const targetParam = getSegmentParam(targetPathSegment)

    if (!pathParam && !targetParam && pathSegment !== targetPathSegment) {
      // Both are static segments but don't match literally
      return false
    }
  }

  return true
}

/**
 * Extracts segments that contribute to the pathname by traversing the loader tree.
 * This function identifies ALL segments (including those in parallel routes) that
 * match the target pathname using normalized prefix matching.
 *
 * Unlike the previous "children-only" approach, this handles interception routes
 * where parallel route segments (e.g., @modal/(.)photo/[photoId]) actually contribute
 * to the pathname construction.
 *
 * ALGORITHM:
 * 1. Use BFS to traverse all routes (children + parallel) in the loader tree
 * 2. Track "depth" (position in pathname) and "currentPath" (static segment history)
 * 3. For each dynamic segment found:
 *    a. Check if it's at the correct depth in target pathname
 *    b. Validate that all static segments before it match the target (prefix check)
 *    c. If both conditions pass, include it in results
 *
 * DEPTH CALCULATION:
 * - Route groups (e.g., "(marketing)") → DON'T increment depth (not in URL)
 * - Parallel route markers (e.g., "@modal") → DON'T increment depth (not in URL)
 * - Interception markers (e.g., "(.)photo") → DO increment depth (part of URL)
 * - Regular segments → DO increment depth
 *
 * @example
 * Tree: /(marketing)/[lang]/@modal/(.)photo/[id]
 * Depth tracking:
 * - (marketing): depth stays 0, not added to path (route group)
 * - [lang]: depth 0 → 1, added to path
 * - @modal: depth stays 1, not added to path (parallel marker)
 * - (.)photo: depth 1 → 2, added to path (interception route)
 * - [id]: depth 2 → 3, added to path
 *
 * @param loaderTree - The loader tree structure containing route hierarchy
 * @param targetPathname - The target pathname to match against, INCLUDING interception
 *                         markers (e.g., "/blog/[slug]", "/(.)photo/[id]")
 * @returns Array of segments with param info that contribute to the pathname
 */
export function extractPathnameSegments(
  loaderTree: LoaderTree,
  targetPathname: string
): Array<{
  readonly name: string
  readonly paramName: string
  readonly paramType: DynamicParamTypes
}> {
  const result: Array<{
    readonly name: string
    readonly paramName: string
    readonly paramType: DynamicParamTypes
  }> = []

  // Normalize the target pathname for comparison
  const targetSegments = targetPathname.split('/').filter(Boolean)

  // BFS traversal with depth and path tracking
  const queue: Array<{
    tree: LoaderTree
    depth: number
    currentPath: string[]
  }> = [{ tree: loaderTree, depth: 0, currentPath: [] }]

  while (queue.length > 0) {
    const { tree, depth, currentPath } = queue.shift()!
    const { segment, parallelRoutes } = parseLoaderTree(tree)

    // Build the path for the current node
    let updatedPath = currentPath
    let nextDepth = depth

    // Classify the segment type to determine depth/path behavior
    // Interception routes (e.g., "(.)photo") DO contribute to pathname depth
    // because they represent actual URL segments. The marker is stripped during
    // routing but the static part (e.g., "photo") remains in the URL.
    const isInterceptionRoute = INTERCEPTION_ROUTE_MARKERS.some((marker) =>
      segment.startsWith(marker)
    )
    // Route groups (e.g., "(marketing)") are purely organizational and must NOT
    // start with an interception marker to avoid misclassification
    const isRouteGroup =
      !isInterceptionRoute && segment.startsWith('(') && segment.endsWith(')')
    const isParallelRoute = segment.startsWith('@')

    // Only add to path if it's a real segment that appears in the URL
    // Route groups and parallel markers don't contribute to URL pathname
    if (!isRouteGroup && !isParallelRoute && segment !== '') {
      updatedPath = [...currentPath, segment]
      nextDepth = depth + 1
    }

    // Check if this segment has a param and matches the target pathname at this depth
    const segmentParam = getSegmentParam(segment)
    if (segmentParam && !isRouteGroup && !isParallelRoute) {
      const { param: paramName, type: paramType } = segmentParam

      // Note: paramType already includes -intercepted- suffix if the segment itself
      // has an interception marker (e.g., "(.)[id]" → "dynamic-intercepted-(.)")
      // This is handled by getSegmentParam, not here.

      // Check if this segment is at the correct depth in the target pathname
      // A segment matches if:
      // 1. There's a dynamic segment at this depth in the pathname
      // 2. The parameter names match (e.g., [id] matches [id], not [category])
      // 3. The static segments leading up to this point match (prefix check)
      if (depth < targetSegments.length) {
        const targetSegment = targetSegments[depth]
        const targetSegmentParam = getSegmentParam(targetSegment)

        // Match if the target pathname has a dynamic segment at this depth
        if (targetSegmentParam) {
          // Check that parameter names match exactly
          // This prevents [category] from matching against /[id]
          if (paramName !== targetSegmentParam.param) {
            continue // Different param names, skip this segment
          }

          // Validate that the path leading up to this dynamic segment matches
          // the target pathname. This prevents false matches like extracting
          // [slug] from "/news/[slug]" when the tree has "/blog/[slug]"
          if (validatePrefixMatch(currentPath, targetSegments)) {
            result.push({
              name: segment,
              paramName,
              paramType,
            })
          }
        }
      }
    }

    // Continue traversing all parallel routes to find matching segments
    for (const parallelRoute of Object.values(parallelRoutes)) {
      queue.push({
        tree: parallelRoute,
        depth: nextDepth,
        currentPath: updatedPath,
      })
    }
  }

  return result
}
