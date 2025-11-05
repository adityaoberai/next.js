import { FallbackMode } from '../../../lib/fallback'
import type { PrerenderedRoute } from '../types'
import { assignErrorIfEmpty } from './assign-error-if-empty'

describe('assignErrorIfEmpty', () => {
  it('should assign throwOnEmptyStaticShell true for a static route with no children', () => {
    const prerenderedRoutes: PrerenderedRoute[] = [
      {
        params: {},
        pathname: '/',
        encodedPathname: '/',
        fallbackRouteParams: [],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
    ]

    assignErrorIfEmpty(prerenderedRoutes, [])

    expect(prerenderedRoutes[0].throwOnEmptyStaticShell).toBe(true)
  })

  it('should assign throwOnEmptyStaticShell based on route hierarchy', () => {
    const prerenderedRoutes: PrerenderedRoute[] = [
      {
        params: {},
        pathname: '/[id]',
        encodedPathname: '/[id]',
        fallbackRouteParams: [
          {
            paramName: 'id',
            paramType: 'dynamic',
            isParallelRouteParam: false,
          },
        ],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { id: '1' },
        pathname: '/1',
        encodedPathname: '/1',
        fallbackRouteParams: [],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
    ]

    assignErrorIfEmpty(prerenderedRoutes, [{ paramName: 'id' }])

    expect(prerenderedRoutes[0].throwOnEmptyStaticShell).toBe(false)
    expect(prerenderedRoutes[1].throwOnEmptyStaticShell).toBe(true)
  })

  it('should handle more complex routes', () => {
    const prerenderedRoutes: PrerenderedRoute[] = [
      {
        params: {},
        pathname: '/[id]/[name]',
        encodedPathname: '/[id]/[name]',
        fallbackRouteParams: [
          {
            paramName: 'id',
            paramType: 'dynamic',
            isParallelRouteParam: false,
          },
          {
            paramName: 'name',
            paramType: 'dynamic',
            isParallelRouteParam: false,
          },
        ],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { id: '1' },
        pathname: '/1/[name]',
        encodedPathname: '/1/[name]',
        fallbackRouteParams: [
          {
            paramName: 'name',
            paramType: 'dynamic',
            isParallelRouteParam: false,
          },
        ],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { id: '1', name: 'test' },
        pathname: '/1/test',
        encodedPathname: '/1/test',
        fallbackRouteParams: [],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { id: '2', name: 'test' },
        pathname: '/2/test',
        encodedPathname: '/2/test',
        fallbackRouteParams: [],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { id: '2' },
        pathname: '/2/[name]',
        encodedPathname: '/2/[name]',
        fallbackRouteParams: [
          {
            paramName: 'name',
            paramType: 'dynamic',
            isParallelRouteParam: false,
          },
        ],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
    ]

    assignErrorIfEmpty(prerenderedRoutes, [
      { paramName: 'id' },
      { paramName: 'name' },
    ])

    expect(prerenderedRoutes[0].throwOnEmptyStaticShell).toBe(false)
    expect(prerenderedRoutes[1].throwOnEmptyStaticShell).toBe(false)
    expect(prerenderedRoutes[2].throwOnEmptyStaticShell).toBe(true)
    expect(prerenderedRoutes[3].throwOnEmptyStaticShell).toBe(true)
    expect(prerenderedRoutes[4].throwOnEmptyStaticShell).toBe(false)
  })

  it('should handle multiple routes at the same trie node', () => {
    const prerenderedRoutes: PrerenderedRoute[] = [
      {
        params: { id: '1' },
        pathname: '/1/[name]',
        encodedPathname: '/1/[name]',
        fallbackRouteParams: [
          {
            paramName: 'name',
            paramType: 'dynamic',
            isParallelRouteParam: false,
          },
        ],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { id: '1' },
        pathname: '/1/[name]/[extra]',
        encodedPathname: '/1/[name]/[extra]',
        fallbackRouteParams: [
          {
            paramName: 'name',
            paramType: 'dynamic',
            isParallelRouteParam: false,
          },
          {
            paramName: 'extra',
            paramType: 'catchall',
            isParallelRouteParam: false,
          },
        ],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { id: '1', name: 'test' },
        pathname: '/1/test',
        encodedPathname: '/1/test',
        fallbackRouteParams: [],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
    ]

    assignErrorIfEmpty(prerenderedRoutes, [
      { paramName: 'id' },
      { paramName: 'name' },
      { paramName: 'extra' },
    ])

    expect(prerenderedRoutes[0].throwOnEmptyStaticShell).toBe(false)
    expect(prerenderedRoutes[1].throwOnEmptyStaticShell).toBe(false)
    expect(prerenderedRoutes[2].throwOnEmptyStaticShell).toBe(true)
  })

  it('should handle empty input', () => {
    const prerenderedRoutes: PrerenderedRoute[] = []
    assignErrorIfEmpty(prerenderedRoutes, [])
    expect(prerenderedRoutes).toEqual([])
  })

  it('should handle blog/[slug] not throwing when concrete routes exist (from docs example)', () => {
    const prerenderedRoutes: PrerenderedRoute[] = [
      {
        params: {},
        pathname: '/blog/[slug]',
        encodedPathname: '/blog/[slug]',
        fallbackRouteParams: [
          {
            paramName: 'slug',
            paramType: 'dynamic',
            isParallelRouteParam: false,
          },
        ],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { slug: 'first-post' },
        pathname: '/blog/first-post',
        encodedPathname: '/blog/first-post',
        fallbackRouteParams: [],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { slug: 'second-post' },
        pathname: '/blog/second-post',
        encodedPathname: '/blog/second-post',
        fallbackRouteParams: [],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
    ]

    assignErrorIfEmpty(prerenderedRoutes, [{ paramName: 'slug' }])

    expect(prerenderedRoutes[0].throwOnEmptyStaticShell).toBe(false) // Should not throw - has concrete children
    expect(prerenderedRoutes[1].throwOnEmptyStaticShell).toBe(true) // Should throw - concrete route
    expect(prerenderedRoutes[2].throwOnEmptyStaticShell).toBe(true) // Should throw - concrete route
  })

  it('should handle catch-all routes with different fallback parameter counts (from docs example)', () => {
    const prerenderedRoutes: PrerenderedRoute[] = [
      {
        params: {},
        pathname: '/[id]/[...slug]',
        encodedPathname: '/[id]/[...slug]',
        fallbackRouteParams: [
          {
            paramName: 'id',
            paramType: 'dynamic',
            isParallelRouteParam: false,
          },
          {
            paramName: 'slug',
            paramType: 'catchall',
            isParallelRouteParam: false,
          },
        ],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { id: '1234' },
        pathname: '/1234/[...slug]',
        encodedPathname: '/1234/[...slug]',
        fallbackRouteParams: [
          {
            paramName: 'slug',
            paramType: 'catchall',
            isParallelRouteParam: false,
          },
        ],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { id: '1234', slug: ['about', 'us'] },
        pathname: '/1234/about/us',
        encodedPathname: '/1234/about/us',
        fallbackRouteParams: [],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
    ]

    assignErrorIfEmpty(prerenderedRoutes, [
      { paramName: 'id' },
      { paramName: 'slug' },
    ])

    expect(prerenderedRoutes[0].throwOnEmptyStaticShell).toBe(false) // Should not throw - has children
    expect(prerenderedRoutes[1].throwOnEmptyStaticShell).toBe(false) // Should not throw - has children
    expect(prerenderedRoutes[2].throwOnEmptyStaticShell).toBe(true) // Should throw - concrete route
  })

  it('should handle nested routes with multiple parameter depths', () => {
    const prerenderedRoutes: PrerenderedRoute[] = [
      {
        params: {},
        pathname: '/[category]/[subcategory]/[item]',
        encodedPathname: '/[category]/[subcategory]/[item]',
        fallbackRouteParams: [
          {
            paramName: 'category',
            paramType: 'dynamic',
            isParallelRouteParam: false,
          },
          {
            paramName: 'subcategory',
            paramType: 'dynamic',
            isParallelRouteParam: false,
          },
          {
            paramName: 'item',
            paramType: 'dynamic',
            isParallelRouteParam: false,
          },
        ],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { category: 'electronics' },
        pathname: '/electronics/[subcategory]/[item]',
        encodedPathname: '/electronics/[subcategory]/[item]',
        fallbackRouteParams: [
          {
            paramName: 'subcategory',
            paramType: 'dynamic',
            isParallelRouteParam: false,
          },
          {
            paramName: 'item',
            paramType: 'dynamic',
            isParallelRouteParam: false,
          },
        ],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { category: 'electronics', subcategory: 'phones' },
        pathname: '/electronics/phones/[item]',
        encodedPathname: '/electronics/phones/[item]',
        fallbackRouteParams: [
          {
            paramName: 'item',
            paramType: 'dynamic',
            isParallelRouteParam: false,
          },
        ],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: {
          category: 'electronics',
          subcategory: 'phones',
          item: 'iphone',
        },
        pathname: '/electronics/phones/iphone',
        encodedPathname: '/electronics/phones/iphone',
        fallbackRouteParams: [],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
    ]

    assignErrorIfEmpty(prerenderedRoutes, [
      { paramName: 'category' },
      { paramName: 'subcategory' },
      { paramName: 'item' },
    ])

    // All except the last one should not throw on empty static shell
    expect(prerenderedRoutes[0].throwOnEmptyStaticShell).toBe(false)
    expect(prerenderedRoutes[1].throwOnEmptyStaticShell).toBe(false)
    expect(prerenderedRoutes[2].throwOnEmptyStaticShell).toBe(false)
    expect(prerenderedRoutes[3].throwOnEmptyStaticShell).toBe(true)
  })

  it('should handle routes at same trie node with different fallback parameter lengths', () => {
    const prerenderedRoutes: PrerenderedRoute[] = [
      {
        params: { locale: 'en' },
        pathname: '/en/[...segments]',
        encodedPathname: '/en/[...segments]',
        fallbackRouteParams: [
          {
            paramName: 'segments',
            paramType: 'catchall',
            isParallelRouteParam: false,
          },
        ],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
      {
        params: { locale: 'en' },
        pathname: '/en',
        encodedPathname: '/en',
        fallbackRouteParams: [],
        fallbackMode: FallbackMode.NOT_FOUND,
        fallbackRootParams: [],
        throwOnEmptyStaticShell: true,
      },
    ]

    assignErrorIfEmpty(prerenderedRoutes, [
      { paramName: 'locale' },
      { paramName: 'segments' },
    ])

    // The route with more fallback params should not throw on empty static shell
    expect(prerenderedRoutes[0].throwOnEmptyStaticShell).toBe(false)
    expect(prerenderedRoutes[1].throwOnEmptyStaticShell).toBe(true)
  })
})
