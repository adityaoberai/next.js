import {
  getSegmentParam,
  type SegmentParam,
} from '../shared/lib/router/utils/get-segment-param'

/**
 * Validates individual path segments for common errors.
 * Based on validation logic from sorted-routes.ts
 */
function validateSegment(segment: string, fullPath: string) {
  // Check for three-dot character (…) instead of ...
  if (segment.includes('…')) {
    throw new Error(
      `Detected a three-dot character ('…') at ('${segment}') in route "${fullPath}". Did you mean ('...')?`
    )
  }

  const param = getSegmentParam(segment)

  // Only validate dynamic segments.
  if (!param) {
    return null
  }

  // Check for optional non-catch-all segments (not yet supported)
  if (
    param.type !== 'optional-catchall' &&
    param.param.startsWith('[') &&
    param.param.endsWith(']')
  ) {
    throw new Error(
      `Optional route parameters are not yet supported ("${segment}") in route "${fullPath}".`
    )
  }

  // Check for extra brackets
  if (param.param.startsWith('[') || param.param.endsWith(']')) {
    throw new Error(
      `Segment names may not start or end with extra brackets ('${param.param}') in route "${fullPath}".`
    )
  }

  // Check for erroneous periods
  if (param.param.startsWith('.')) {
    throw new Error(
      `Segment names may not start with erroneous periods ('${param.param}') in route "${fullPath}".`
    )
  }

  return param
}

/**
 * Validates a single path for internal consistency.
 */
function validatePath(path: string): SegmentParam[] {
  const segments = path.split('/').filter(Boolean)
  const slugNames = new Set<string>()
  const normalizedSegments = new Set<string>()
  let hasCatchAll = false
  let hasOptionalCatchAllInPath = false
  let catchAllPosition = -1

  const params: SegmentParam[] = []

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]

    // Validate segment syntax
    const param = validateSegment(segment, path)

    // Check if this is a dynamic segment
    if (param) {
      let isOptional = false
      let isCatchAll = false
      switch (param.type) {
        case 'dynamic':
        case 'dynamic-intercepted-(..)(..)':
        case 'dynamic-intercepted-(.)':
        case 'dynamic-intercepted-(..)':
        case 'dynamic-intercepted-(...)':
          break
        case 'catchall':
        case 'catchall-intercepted-(..)(..)':
        case 'catchall-intercepted-(.)':
        case 'catchall-intercepted-(..)':
        case 'catchall-intercepted-(...)':
          isCatchAll = true
          break
        case 'optional-catchall':
          isOptional = true
          isCatchAll = true
          break
        default:
          param.type satisfies never
      }

      if (isCatchAll) {
        if (isOptional) {
          hasOptionalCatchAllInPath = true
        } else {
          hasCatchAll = true
        }

        catchAllPosition = i
      }

      // Check for duplicate slug names
      if (slugNames.has(param.param)) {
        throw new Error(
          `You cannot have the same slug name "${param.param}" repeat within a single dynamic path in route "${path}".`
        )
      }

      // Check for slug names that differ only by non-word symbols
      const normalizedSegment = param.param.replace(/\W/g, '')
      if (normalizedSegments.has(normalizedSegment)) {
        const existing = Array.from(slugNames).find((s) => {
          return s.replace(/\W/g, '') === normalizedSegment
        })
        throw new Error(
          `You cannot have the slug names "${existing}" and "${param.param}" differ only by non-word symbols within a single dynamic path in route "${path}".`
        )
      }

      slugNames.add(param.param)
      normalizedSegments.add(normalizedSegment)
      params.push(param)
    }

    // Check if catch-all is not at the end
    if (hasCatchAll && i > catchAllPosition) {
      throw new Error(
        `Catch-all must be the last part of the URL in route "${path}".`
      )
    }
    if (hasOptionalCatchAllInPath && i > catchAllPosition) {
      throw new Error(
        `Optional catch-all must be the last part of the URL in route "${path}".`
      )
    }
  }

  // Check for both required and optional catch-all
  if (hasCatchAll && hasOptionalCatchAllInPath) {
    throw new Error(
      `You cannot use both a required and optional catch-all route at the same level in route "${path}".`
    )
  }

  return params
}

/**
 * Normalizes a path by replacing dynamic segments with a placeholder.
 * This allows us to compare paths for structural equivalence.
 *
 * Examples:
 * - /blog/[slug] -> /blog/[*]
 * - /blog/[modalSlug] -> /blog/[*]
 * - /blog/[...slug] -> /blog/[...*]
 * - /blog/[[...slug]] -> /blog/[[...*]]
 */
function normalizePathStructure(path: string): string {
  return path
    .replace(/\[\.\.\.[\w-]+\]/g, '[...*]') // Catch-all segments
    .replace(/\[\[\.\.\.[\w-]+\]\]/g, '[[...*]]') // Optional catch-all segments
    .replace(/\[[\w-]+\]/g, '[*]') // Regular dynamic segments
}

/**
 * Gets the prefix path (everything except the last segment) for conflict detection.
 */
function getPathPrefix(path: string): string {
  const lastSlash = path.lastIndexOf('/')
  return lastSlash > 0 ? path.substring(0, lastSlash) : ''
}

/**
 * Validates that app paths don't create ambiguous routes.
 *
 * NOTE: The paths passed to this function should already have been normalized by normalizeAppPath,
 * which means parallel route segments (@modal, @sidebar, etc.) have been removed.
 *
 * This function performs two types of validation:
 * 1. Individual path validation (syntax, slug names, catch-all placement, etc.)
 * 2. Cross-path validation (ambiguous routes, conflicting patterns)
 *
 * @param appPaths - Array of normalized app router paths to validate
 * @throws Error if validation fails
 */
export function validateAppPaths(appPaths: readonly string[]): void {
  // First, validate each path individually
  const paramsByPath = new Map<string, SegmentParam[]>()
  for (const path of appPaths) {
    paramsByPath.set(path, validatePath(path))
  }

  // Group paths by their normalized structure for ambiguity detection
  const structureMap = new Map<string, string[]>()

  for (const [path, params] of paramsByPath) {
    // Check if the last segment is an optional catch-all and check to see if
    // there is a route with the same specificity that conflicts with it.
    const lastParam = params[params.length - 1]
    if (lastParam?.type === 'optional-catchall') {
      const prefix = getPathPrefix(path)
      for (const appPath of appPaths) {
        if (appPath === prefix) {
          throw new Error(
            `You cannot define a route with the same specificity as an optional catch-all route ("${appPath}" and "${prefix}[[...${lastParam.param}]]").`
          )
        }
      }
    }

    // Normalize the path to get its structure
    const structure = normalizePathStructure(path)

    // Track which paths map to this structure
    const existingPaths = structureMap.get(structure) ?? []
    existingPaths.push(path)
    structureMap.set(structure, existingPaths)
  }

  // Check for ambiguous routes (different slug names, same structure)
  const conflicts: Array<{ paths: string[]; normalizedPath: string }> = []

  for (const [structure, paths] of structureMap) {
    if (paths.length > 1) {
      // Multiple paths map to the same structure - this is ambiguous
      conflicts.push({
        paths,
        normalizedPath: structure,
      })
    }
  }

  if (conflicts.length > 0) {
    const errorMessages = conflicts.map(({ paths, normalizedPath }) => {
      const pathsList = paths.map((p) => `  - ${p}`).join('\n')
      return `Ambiguous route pattern "${normalizedPath}" matches multiple routes:\n${pathsList}`
    })

    throw new Error(
      `Ambiguous app routes detected:\n\n${errorMessages.join('\n\n')}\n\n` +
        `These routes cannot be distinguished from each other when matching URLs. ` +
        `Please ensure that dynamic segments have unique patterns or use different static segments.`
    )
  }
}
