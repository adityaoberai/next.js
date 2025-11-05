import type { Params } from '../../server/request/params'
import type { AppPageModule } from '../../server/route-modules/app-page/module'
import type { AppSegment } from '../segment-config/app/app-segments'
import type {
  FallbackRouteParam,
  PrerenderedRoute,
  StaticPathsResult,
} from './types'

import path from 'node:path'
import { AfterRunner } from '../../server/after/run-with-after'
import { createWorkStore } from '../../server/async-storage/work-store'
import { FallbackMode } from '../../lib/fallback'
import type { IncrementalCache } from '../../server/lib/incremental-cache'
import {
  normalizePathname,
  encodeParam,
  createFallbackRouteParam,
} from './utils'
import escapePathDelimiters from '../../shared/lib/router/utils/escape-path-delimiters'
import { createIncrementalCache } from '../../export/helpers/create-incremental-cache'
import type { NextConfigComplete } from '../../server/config-shared'
import type { DynamicParamTypes } from '../../shared/lib/app-router-types'
import { InvariantError } from '../../shared/lib/invariant-error'
import { getParamProperties } from '../../shared/lib/router/utils/get-segment-param'
import type { AppRouteModule } from '../../server/route-modules/app-route/module.compiled'
import { filterUniqueParams } from './app/filter-unique-params'
import { generateAllParamCombinations } from './app/generate-all-param-combinations'
import { calculateFallbackMode } from './app/calculate-fallback-mode'
import { assignErrorIfEmpty } from './app/assign-error-if-empty'
import { resolveParallelRouteParams } from './app/resolve-parallel-route-params'
import { generateRouteStaticParams } from './app/generate-route-static-params'

/**
 * Validates the parameters to ensure they're accessible and have the correct
 * types.
 *
 * @param page - The page to validate.
 * @param regex - The route regex.
 * @param isRoutePPREnabled - Whether the route has partial prerendering enabled.
 * @param childrenRouteParamSegments - The keys of the parameters.
 * @param rootParamKeys - The keys of the root params.
 * @param routeParams - The list of parameters to validate.
 * @returns The list of validated parameters.
 */
function validateParams(
  page: string,
  isRoutePPREnabled: boolean,
  childrenRouteParamSegments: ReadonlyArray<{
    readonly paramName: string
    readonly paramType: DynamicParamTypes
  }>,
  rootParamKeys: readonly string[],
  routeParams: readonly Params[]
): Params[] {
  const valid: Params[] = []

  // Validate that if there are any root params, that the user has provided at
  // least one value for them only if we're using partial prerendering.
  if (isRoutePPREnabled && rootParamKeys.length > 0) {
    if (
      routeParams.length === 0 ||
      rootParamKeys.some((key) =>
        routeParams.some((params) => !(key in params))
      )
    ) {
      if (rootParamKeys.length === 1) {
        throw new Error(
          `A required root parameter (${rootParamKeys[0]}) was not provided in generateStaticParams for ${page}, please provide at least one value.`
        )
      }

      throw new Error(
        `Required root params (${rootParamKeys.join(', ')}) were not provided in generateStaticParams for ${page}, please provide at least one value for each.`
      )
    }
  }

  for (const params of routeParams) {
    const item: Params = {}

    for (const { paramName: key, paramType } of childrenRouteParamSegments) {
      const { repeat, optional } = getParamProperties(paramType)

      let paramValue = params[key]

      if (
        optional &&
        params.hasOwnProperty(key) &&
        (paramValue === null ||
          paramValue === undefined ||
          (paramValue as any) === false)
      ) {
        paramValue = []
      }

      // A parameter is missing, so the rest of the params are not accessible.
      // We only support this when the route has partial prerendering enabled.
      // This will make it so that the remaining params are marked as missing so
      // we can generate a fallback route for them.
      if (!paramValue && isRoutePPREnabled) {
        break
      }

      // Perform validation for the parameter based on whether it's a repeat
      // parameter or not.
      if (repeat) {
        if (!Array.isArray(paramValue)) {
          throw new Error(
            `A required parameter (${key}) was not provided as an array received ${typeof paramValue} in generateStaticParams for ${page}`
          )
        }
      } else {
        if (typeof paramValue !== 'string') {
          throw new Error(
            `A required parameter (${key}) was not provided as a string received ${typeof paramValue} in generateStaticParams for ${page}`
          )
        }
      }

      item[key] = paramValue
    }

    valid.push(item)
  }

  return valid
}

/**
 * Builds the static paths for an app using `generateStaticParams`.
 *
 * @param params - The parameters for the build.
 * @returns The static paths.
 */
export async function buildAppStaticPaths({
  dir,
  page,
  distDir,
  cacheComponents,
  authInterrupts,
  segments,
  isrFlushToDisk,
  cacheHandler,
  cacheLifeProfiles,
  requestHeaders,
  cacheHandlers,
  cacheMaxMemorySize,
  fetchCacheKeyPrefix,
  nextConfigOutput,
  ComponentMod,
  isRoutePPREnabled = false,
  buildId,
  rootParamKeys,
}: {
  dir: string
  page: string
  cacheComponents: boolean
  authInterrupts: boolean
  segments: readonly Readonly<AppSegment>[]
  distDir: string
  isrFlushToDisk?: boolean
  fetchCacheKeyPrefix?: string
  cacheHandler?: string
  cacheHandlers?: NextConfigComplete['cacheHandlers']
  cacheLifeProfiles?: {
    [profile: string]: import('../../server/use-cache/cache-life').CacheLife
  }
  cacheMaxMemorySize: number
  requestHeaders: IncrementalCache['requestHeaders']
  nextConfigOutput: 'standalone' | 'export' | undefined
  ComponentMod: AppPageModule | AppRouteModule
  isRoutePPREnabled: boolean
  buildId: string
  rootParamKeys: readonly string[]
}): Promise<StaticPathsResult> {
  if (
    segments.some((generate) => generate.config?.dynamicParams === true) &&
    nextConfigOutput === 'export'
  ) {
    throw new Error(
      '"dynamicParams: true" cannot be used with "output: export". See more info here: https://nextjs.org/docs/app/building-your-application/deploying/static-exports'
    )
  }

  ComponentMod.patchFetch()

  const incrementalCache = await createIncrementalCache({
    dir,
    distDir,
    cacheHandler,
    cacheHandlers,
    requestHeaders,
    fetchCacheKeyPrefix,
    flushToDisk: isrFlushToDisk,
    cacheMaxMemorySize,
  })

  const childrenRouteParamSegments: Array<{
    readonly name: string
    readonly paramName: string
    readonly paramType: DynamicParamTypes
  }> = []

  // These are all the parallel fallback route params that will be included when
  // we're emitting the route for the base route.
  const parallelFallbackRouteParams: FallbackRouteParam[] = []

  // First pass: collect all non-parallel route param names.
  // This allows us to filter out parallel route params that duplicate non-parallel ones.
  const nonParallelParamNames = new Set<string>()
  for (const segment of segments) {
    if (!segment.paramName || !segment.paramType) continue
    if (!segment.isParallelRouteSegment) {
      nonParallelParamNames.add(segment.paramName)
    }
  }

  // Second pass: collect segments, ensuring non-parallel route params take precedence.
  for (const segment of segments) {
    // If this segment doesn't have a param name then it's not param that we
    // need to resolve.
    if (!segment.paramName || !segment.paramType) continue

    if (segment.isParallelRouteSegment) {
      // Skip parallel route params that are already defined as non-parallel route params.
      // Non-parallel route params take precedence because they appear in the URL pathname.
      if (nonParallelParamNames.has(segment.paramName)) {
        continue
      }

      // Collect parallel fallback route params for the base route.
      // The actual parallel route param resolution is now handled by
      // resolveParallelRouteParams using the loader tree.
      parallelFallbackRouteParams.push(
        createFallbackRouteParam(segment.paramName, segment.paramType, true)
      )
    } else {
      // Collect all the route param keys that are not parallel route params.
      // These are the ones that will be included in the request pathname.
      childrenRouteParamSegments.push({
        name: segment.name,
        paramName: segment.paramName,
        paramType: segment.paramType,
      })
    }
  }

  const afterRunner = new AfterRunner()

  const store = createWorkStore({
    page,
    renderOpts: {
      incrementalCache,
      cacheLifeProfiles,
      supportsDynamicResponse: true,
      cacheComponents,
      experimental: {
        authInterrupts,
      },
      waitUntil: afterRunner.context.waitUntil,
      onClose: afterRunner.context.onClose,
      onAfterTaskError: afterRunner.context.onTaskError,
    },
    buildId,
    previouslyRevalidatedTags: [],
  })

  const routeParams = await ComponentMod.workAsyncStorage.run(
    store,
    generateRouteStaticParams,
    segments,
    store,
    isRoutePPREnabled
  )

  await afterRunner.executeAfter()

  let lastDynamicSegmentHadGenerateStaticParams = false
  for (const segment of segments) {
    // Check to see if there are any missing params for segments that have
    // dynamicParams set to false.
    if (
      segment.paramName &&
      segment.isDynamicSegment &&
      segment.config?.dynamicParams === false
    ) {
      for (const params of routeParams) {
        if (segment.paramName in params) continue

        const relative = segment.filePath
          ? path.relative(dir, segment.filePath)
          : undefined

        throw new Error(
          `Segment "${relative}" exports "dynamicParams: false" but the param "${segment.paramName}" is missing from the generated route params.`
        )
      }
    }

    if (
      segment.isDynamicSegment &&
      typeof segment.generateStaticParams !== 'function'
    ) {
      lastDynamicSegmentHadGenerateStaticParams = false
    } else if (typeof segment.generateStaticParams === 'function') {
      lastDynamicSegmentHadGenerateStaticParams = true
    }
  }

  // Determine if all the segments have had their parameters provided.
  const hadAllParamsGenerated =
    childrenRouteParamSegments.length === 0 ||
    (routeParams.length > 0 &&
      routeParams.every((params) => {
        for (const { paramName } of childrenRouteParamSegments) {
          if (paramName in params) continue
          return false
        }
        return true
      }))

  // TODO: dynamic params should be allowed to be granular per segment but
  // we need additional information stored/leveraged in the prerender
  // manifest to allow this behavior.
  const dynamicParams = segments.every(
    (segment) => segment.config?.dynamicParams !== false
  )

  const supportsRoutePreGeneration =
    hadAllParamsGenerated || process.env.NODE_ENV === 'production'

  const fallbackMode = dynamicParams
    ? supportsRoutePreGeneration
      ? isRoutePPREnabled
        ? FallbackMode.PRERENDER
        : FallbackMode.BLOCKING_STATIC_RENDER
      : undefined
    : FallbackMode.NOT_FOUND

  const prerenderedRoutesByPathname = new Map<string, PrerenderedRoute>()

  // Convert rootParamKeys to Set for O(1) lookup.
  const rootParamSet = new Set(rootParamKeys)

  if (hadAllParamsGenerated || isRoutePPREnabled) {
    let paramsToProcess = routeParams

    if (isRoutePPREnabled) {
      // Discover all unique combinations of the routeParams so we can generate
      // routes that won't throw on empty static shell for each of them if
      // they're available.
      paramsToProcess = generateAllParamCombinations(
        childrenRouteParamSegments,
        routeParams,
        rootParamKeys
      )

      // The fallback route params for this route is a combination of the
      // parallel route params and the non-parallel route params.
      const fallbackRouteParams: readonly FallbackRouteParam[] = [
        ...childrenRouteParamSegments.map(({ paramName, paramType: type }) =>
          createFallbackRouteParam(paramName, type, false)
        ),
        ...parallelFallbackRouteParams,
      ]

      // Add the base route, this is the route with all the placeholders as it's
      // derived from the `page` string.
      prerenderedRoutesByPathname.set(page, {
        params: {},
        pathname: page,
        encodedPathname: page,
        fallbackRouteParams,
        fallbackMode: calculateFallbackMode(
          dynamicParams,
          rootParamKeys,
          fallbackMode
        ),
        fallbackRootParams: rootParamKeys,
        throwOnEmptyStaticShell: true,
      })
    }

    filterUniqueParams(
      childrenRouteParamSegments,
      validateParams(
        page,
        isRoutePPREnabled,
        childrenRouteParamSegments,
        rootParamKeys,
        paramsToProcess
      )
    ).forEach((params) => {
      let pathname = page
      let encodedPathname = page

      const fallbackRouteParams: FallbackRouteParam[] = []

      for (const {
        paramName: key,
        paramType: type,
      } of childrenRouteParamSegments) {
        const paramValue = params[key]

        if (!paramValue) {
          if (isRoutePPREnabled) {
            // Mark remaining params as fallback params.
            fallbackRouteParams.push(createFallbackRouteParam(key, type, false))
            for (
              let i =
                childrenRouteParamSegments.findIndex(
                  (param) => param.paramName === key
                ) + 1;
              i < childrenRouteParamSegments.length;
              i++
            ) {
              fallbackRouteParams.push(
                createFallbackRouteParam(
                  childrenRouteParamSegments[i].paramName,
                  childrenRouteParamSegments[i].paramType,
                  false
                )
              )
            }
            break
          } else {
            // This route is not complete, and we aren't performing a partial
            // prerender, so we should return, skipping this route.
            return
          }
        }

        const segment = childrenRouteParamSegments.find(
          ({ paramName }) => paramName === key
        )
        if (!segment) {
          throw new InvariantError(
            `Param ${key} not found in childrenRouteParamSegments ${childrenRouteParamSegments.map(({ paramName }) => paramName).join(', ')}`
          )
        }

        pathname = pathname.replace(
          segment.name,
          encodeParam(paramValue, (value) => escapePathDelimiters(value, true))
        )
        encodedPathname = encodedPathname.replace(
          segment.name,
          encodeParam(paramValue, encodeURIComponent)
        )
      }

      // Resolve parallel route params from the loader tree if this is from an
      // app page.
      if (
        'loaderTree' in ComponentMod.routeModule.userland &&
        Array.isArray(ComponentMod.routeModule.userland.loaderTree)
      ) {
        resolveParallelRouteParams(
          ComponentMod.routeModule.userland.loaderTree,
          params,
          pathname,
          fallbackRouteParams
        )
      }

      const fallbackRootParams: string[] = []
      for (const { paramName, isParallelRouteParam } of fallbackRouteParams) {
        // Only add the param to the fallback root params if it's not a
        // parallel route param. They won't contribute to the request pathname.
        if (isParallelRouteParam) continue

        // If the param is a root param then we can add it to the fallback
        // root params.
        if (rootParamSet.has(paramName)) {
          fallbackRootParams.push(paramName)
        }
      }

      pathname = normalizePathname(pathname)

      prerenderedRoutesByPathname.set(pathname, {
        params,
        pathname,
        encodedPathname: normalizePathname(encodedPathname),
        fallbackRouteParams,
        fallbackMode: calculateFallbackMode(
          dynamicParams,
          fallbackRootParams,
          fallbackMode
        ),
        fallbackRootParams,
        throwOnEmptyStaticShell: true,
      })
    })
  }

  const prerenderedRoutes =
    prerenderedRoutesByPathname.size > 0 ||
    lastDynamicSegmentHadGenerateStaticParams
      ? [...prerenderedRoutesByPathname.values()]
      : undefined

  // Now we have to set the throwOnEmptyStaticShell for each of the routes.
  if (prerenderedRoutes && cacheComponents) {
    assignErrorIfEmpty(prerenderedRoutes, childrenRouteParamSegments)
  }

  return { fallbackMode, prerenderedRoutes }
}
