import { generateRouteStaticParams } from './generate-route-static-params'
import type { TestAppSegment } from './test-helpers'
import { createMockWorkStore, createMockSegment } from './test-helpers'

describe('generateRouteStaticParams', () => {
  describe('Basic functionality', () => {
    it('should return empty array for empty segments', async () => {
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams([], store, false)
      expect(result).toEqual([])
    })

    it('should return empty array for segments without generateStaticParams', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(),
        createMockSegment(),
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toEqual([])
    })

    it('should process single segment with generateStaticParams', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [{ id: '1' }, { id: '2' }]),
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toEqual([{ id: '1' }, { id: '2' }])
    })

    it('should process multiple segments with generateStaticParams', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [
          { category: 'tech' },
          { category: 'sports' },
        ]),
        createMockSegment(async ({ params }) => [
          { slug: `${params?.category}-post-1` },
          { slug: `${params?.category}-post-2` },
        ]),
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toEqual([
        { category: 'tech', slug: 'tech-post-1' },
        { category: 'tech', slug: 'tech-post-2' },
        { category: 'sports', slug: 'sports-post-1' },
        { category: 'sports', slug: 'sports-post-2' },
      ])
    })
  })

  describe('Parameter inheritance', () => {
    it('should inherit parent parameters', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [{ lang: 'en' }, { lang: 'fr' }]),
        createMockSegment(async ({ params }) => [
          { category: `${params?.lang}-tech` },
        ]),
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toEqual([
        { lang: 'en', category: 'en-tech' },
        { lang: 'fr', category: 'fr-tech' },
      ])
    })

    it('should handle mixed segments (some with generateStaticParams, some without)', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [{ lang: 'en' }]),
        createMockSegment(), // No generateStaticParams
        createMockSegment(async ({ params }) => [
          { slug: `${params?.lang}-slug` },
        ]),
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toEqual([{ lang: 'en', slug: 'en-slug' }])
    })
  })

  describe('Empty and undefined handling', () => {
    it('should handle empty generateStaticParams results', async () => {
      const segments: TestAppSegment[] = [createMockSegment(async () => [])]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toEqual([])
    })

    it('should handle generateStaticParams returning empty array with parent params', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [{ lang: 'en' }]),
        createMockSegment(async () => []), // Empty result
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toEqual([{ lang: 'en' }])
    })

    it('should handle missing parameters in parent params', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [{ lang: 'en' }, {}]),
        createMockSegment(async ({ params }) => [
          { category: `${params?.lang || 'default'}-tech` },
        ]),
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toEqual([
        { lang: 'en', category: 'en-tech' },
        { category: 'default-tech' },
      ])
    })
  })

  describe('FetchCache configuration', () => {
    it('should set fetchCache on store when segment has fetchCache config', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [{ id: '1' }], {
          fetchCache: 'force-cache',
        }),
      ]
      const store = createMockWorkStore()
      await generateRouteStaticParams(segments, store, false)
      expect(store.fetchCache).toBe('force-cache')
    })

    it('should not modify fetchCache when segment has no fetchCache config', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [{ id: '1' }]),
      ]
      const store = createMockWorkStore('force-cache')
      await generateRouteStaticParams(segments, store, false)
      expect(store.fetchCache).toBe('force-cache')
    })

    it('should update fetchCache for multiple segments', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [{ category: 'tech' }], {
          fetchCache: 'force-cache',
        }),
        createMockSegment(async () => [{ slug: 'post' }], {
          fetchCache: 'default-cache',
        }),
      ]
      const store = createMockWorkStore()
      await generateRouteStaticParams(segments, store, false)
      // Should have the last fetchCache value
      expect(store.fetchCache).toBe('default-cache')
    })
  })

  describe('Array parameter values', () => {
    it('should handle array parameter values', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [
          { slug: ['a', 'b'] },
          { slug: ['c', 'd', 'e'] },
        ]),
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toEqual([{ slug: ['a', 'b'] }, { slug: ['c', 'd', 'e'] }])
    })

    it('should handle mixed array and string parameters', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [{ lang: 'en' }]),
        createMockSegment(async ({ params }) => [
          { slug: [`${params?.lang}`, 'post'] },
        ]),
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toEqual([{ lang: 'en', slug: ['en', 'post'] }])
    })
  })

  describe('Deep nesting scenarios', () => {
    it('should handle deeply nested segments', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [{ a: '1' }]),
        createMockSegment(async ({ params }) => [{ b: `${params?.a}-2` }]),
        createMockSegment(async ({ params }) => [{ c: `${params?.b}-3` }]),
        createMockSegment(async ({ params }) => [{ d: `${params?.c}-4` }]),
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toEqual([{ a: '1', b: '1-2', c: '1-2-3', d: '1-2-3-4' }])
    })

    it('should handle many parameter combinations', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [{ x: '1' }, { x: '2' }]),
        createMockSegment(async () => [{ y: 'a' }, { y: 'b' }]),
        createMockSegment(async () => [{ z: 'i' }, { z: 'ii' }]),
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toEqual([
        { x: '1', y: 'a', z: 'i' },
        { x: '1', y: 'a', z: 'ii' },
        { x: '1', y: 'b', z: 'i' },
        { x: '1', y: 'b', z: 'ii' },
        { x: '2', y: 'a', z: 'i' },
        { x: '2', y: 'a', z: 'ii' },
        { x: '2', y: 'b', z: 'i' },
        { x: '2', y: 'b', z: 'ii' },
      ])
    })
  })

  describe('Error handling', () => {
    it('should handle generateStaticParams throwing an error', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => {
          throw new Error('Test error')
        }),
      ]
      const store = createMockWorkStore()
      await expect(
        generateRouteStaticParams(segments, store, false)
      ).rejects.toThrow('Test error')
    })

    it('should handle generateStaticParams returning a rejected promise', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => {
          return Promise.reject(new Error('Async error'))
        }),
      ]
      const store = createMockWorkStore()
      await expect(
        generateRouteStaticParams(segments, store, false)
      ).rejects.toThrow('Async error')
    })

    it('should handle partially failing generateStaticParams', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [{ category: 'tech' }]),
        createMockSegment(async ({ params }) => {
          if (params?.category === 'tech') {
            throw new Error('Tech not allowed')
          }
          return [{ slug: 'post' }]
        }),
      ]
      const store = createMockWorkStore()
      await expect(
        generateRouteStaticParams(segments, store, false)
      ).rejects.toThrow('Tech not allowed')
    })

    it('should throw error when generateStaticParams returns empty array with isRoutePPREnabled=true', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [{ lang: 'en' }]),
        createMockSegment(async () => []), // Empty result
      ]
      const store = createMockWorkStore()
      await expect(
        generateRouteStaticParams(segments, store, true)
      ).rejects.toThrow(
        'When using Cache Components, all `generateStaticParams` functions must return at least one result'
      )
    })

    it('should throw error when first segment returns empty array with isRoutePPREnabled=true', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => []), // Empty result at root level
      ]
      const store = createMockWorkStore()
      await expect(
        generateRouteStaticParams(segments, store, true)
      ).rejects.toThrow(
        'When using Cache Components, all `generateStaticParams` functions must return at least one result'
      )
    })

    it('should NOT throw error when generateStaticParams returns empty array with isRoutePPREnabled=false', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [{ lang: 'en' }]),
        createMockSegment(async () => []), // Empty result
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toEqual([{ lang: 'en' }])
    })

    it('should NOT throw error when first segment returns empty array with isRoutePPREnabled=false', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => []), // Empty result at root level
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toEqual([])
    })
  })

  describe('Complex real-world scenarios', () => {
    it('should handle i18n routing pattern', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(async () => [
          { lang: 'en' },
          { lang: 'fr' },
          { lang: 'es' },
        ]),
        createMockSegment(async ({ params: _params }) => [
          { category: 'tech' },
          { category: 'sports' },
        ]),
        createMockSegment(async ({ params }) => [
          { slug: `${params?.lang}-${params?.category}-post-1` },
          { slug: `${params?.lang}-${params?.category}-post-2` },
        ]),
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toHaveLength(12) // 3 langs × 2 categories × 2 slugs
      expect(result).toContainEqual({
        lang: 'en',
        category: 'tech',
        slug: 'en-tech-post-1',
      })
      expect(result).toContainEqual({
        lang: 'fr',
        category: 'sports',
        slug: 'fr-sports-post-2',
      })
    })

    it('should handle e-commerce routing pattern', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(), // Static segment
        createMockSegment(async () => [
          { category: 'electronics' },
          { category: 'clothing' },
        ]),
        createMockSegment(async ({ params }) => {
          if (params?.category === 'electronics') {
            return [{ subcategory: 'phones' }, { subcategory: 'laptops' }]
          }
          return [{ subcategory: 'shirts' }, { subcategory: 'pants' }]
        }),
        createMockSegment(async ({ params }) => [
          { product: `${params?.subcategory}-item-1` },
        ]),
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toEqual([
        {
          category: 'electronics',
          subcategory: 'phones',
          product: 'phones-item-1',
        },
        {
          category: 'electronics',
          subcategory: 'laptops',
          product: 'laptops-item-1',
        },
        {
          category: 'clothing',
          subcategory: 'shirts',
          product: 'shirts-item-1',
        },
        { category: 'clothing', subcategory: 'pants', product: 'pants-item-1' },
      ])
    })

    it('should handle blog with optional catch-all', async () => {
      const segments: TestAppSegment[] = [
        createMockSegment(), // Static segment
        createMockSegment(async () => [{ year: '2023' }, { year: '2024' }]),
        createMockSegment(async ({ params: _params }) => [
          { month: '01' },
          { month: '02' },
        ]),
        createMockSegment(async ({ params }) => [
          { slug: [`${params?.year}-${params?.month}-post`] },
          { slug: [] }, // Empty for optional catch-all
        ]),
      ]
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toHaveLength(8) // 2 years × 2 months × 2 slug variations
      expect(result).toContainEqual({
        year: '2023',
        month: '01',
        slug: ['2023-01-post'],
      })
      expect(result).toContainEqual({ year: '2024', month: '02', slug: [] })
    })
  })

  describe('Performance considerations', () => {
    it('should handle recursive calls without stack overflow', async () => {
      const segments: TestAppSegment[] = []
      for (let i = 0; i < 5000; i++) {
        segments.push(
          createMockSegment(async () => [{ [`param${i}`]: `value${i}` }])
        )
      }
      const store = createMockWorkStore()
      const result = await generateRouteStaticParams(segments, store, false)
      expect(result).toHaveLength(1)
      expect(Object.keys(result[0])).toHaveLength(5000)
    })
  })
})
