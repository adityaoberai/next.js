import type { Params } from '../../../server/request/params'
import type { WorkStore } from '../../../server/app-render/work-async-storage.external'
import type { AppSegment } from '../../segment-config/app/app-segments'

/**
 * Test helper type for creating LoaderTree structures in tests.
 * This is a simplified type that includes only the essential LoaderTree structure.
 */
export type TestLoaderTree = [
  segment: string,
  parallelRoutes: { [key: string]: TestLoaderTree },
  modules: Record<string, unknown>,
]

/**
 * Creates a LoaderTree structure for testing.
 *
 * @param segment - The segment name (e.g., '[slug]', 'blog', '(.)photo')
 * @param parallelRoutes - Parallel route slots (e.g., { modal: ..., sidebar: ... })
 * @param children - Optional children route
 * @returns A LoaderTree structure for testing
 */
export function createLoaderTree(
  segment: string,
  parallelRoutes: { [key: string]: TestLoaderTree } = {},
  children?: TestLoaderTree
): TestLoaderTree {
  const routes = children ? { ...parallelRoutes, children } : parallelRoutes
  return [segment, routes, {}]
}

/**
 * Type for mock AppSegment used in tests.
 */
export type TestAppSegment = Pick<AppSegment, 'config' | 'generateStaticParams'>

/**
 * Creates a mock WorkStore for testing.
 *
 * @param fetchCache - Optional fetchCache configuration
 * @returns A mock WorkStore object
 */
export function createMockWorkStore(
  fetchCache?: WorkStore['fetchCache']
): Pick<WorkStore, 'fetchCache'> {
  return { fetchCache }
}

/**
 * Creates a mock AppSegment for testing.
 *
 * @param generateStaticParams - Optional generateStaticParams function
 * @param config - Optional segment configuration
 * @returns A mock AppSegment object
 */
export function createMockSegment(
  generateStaticParams?: (options: { params?: Params }) => Promise<Params[]>,
  config?: TestAppSegment['config']
): TestAppSegment {
  return {
    config,
    generateStaticParams,
  }
}
