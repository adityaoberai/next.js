import type { Params } from '../../../server/request/params'
import { generateAllParamCombinations } from './generate-all-param-combinations'

describe('generateParamPrefixCombinations', () => {
  it('should return only the route parameters', () => {
    const params = [
      { id: '1', name: 'test' },
      { id: '1', name: 'test' },
      { id: '2', name: 'test' },
    ]

    const unique = generateAllParamCombinations(
      [{ paramName: 'id' }],
      params,
      []
    )

    expect(unique).toEqual([{ id: '1' }, { id: '2' }])
  })

  it('should handle multiple route parameters', () => {
    const params = [
      { lang: 'en', region: 'US', page: 'home' },
      { lang: 'en', region: 'US', page: 'about' },
      { lang: 'fr', region: 'CA', page: 'home' },
      { lang: 'fr', region: 'CA', page: 'about' },
    ]

    const unique = generateAllParamCombinations(
      [{ paramName: 'lang' }, { paramName: 'region' }],
      params,
      []
    )

    expect(unique).toEqual([
      { lang: 'en' },
      { lang: 'en', region: 'US' },
      { lang: 'fr' },
      { lang: 'fr', region: 'CA' },
    ])
  })

  it('should handle parameter value collisions', () => {
    const params = [{ slug: ['foo', 'bar'] }, { slug: 'foo,bar' }]

    const unique = generateAllParamCombinations(
      [{ paramName: 'slug' }],
      params,
      []
    )

    expect(unique).toEqual([{ slug: ['foo', 'bar'] }, { slug: 'foo,bar' }])
  })

  it('should handle empty inputs', () => {
    // Empty routeParamKeys
    expect(generateAllParamCombinations([], [{ id: '1' }], [])).toEqual([])

    // Empty routeParams
    expect(generateAllParamCombinations([{ paramName: 'id' }], [], [])).toEqual(
      []
    )

    // Both empty
    expect(generateAllParamCombinations([], [], [])).toEqual([])
  })

  it('should handle undefined parameters', () => {
    const params = [
      { id: '1', name: 'test' },
      { id: '2', name: undefined },
      { id: '3' }, // missing name key
    ]

    const unique = generateAllParamCombinations(
      [{ paramName: 'id' }, { paramName: 'name' }],
      params,
      []
    )

    expect(unique).toEqual([
      { id: '1' },
      { id: '1', name: 'test' },
      { id: '2' },
      { id: '3' },
    ])
  })

  it('should handle missing parameter keys in objects', () => {
    const params = [
      { lang: 'en', region: 'US', category: 'tech' },
      { lang: 'en', region: 'US' }, // missing category
      { lang: 'fr' }, // missing region and category
    ]

    const unique = generateAllParamCombinations(
      [
        { paramName: 'lang' },
        { paramName: 'region' },
        { paramName: 'category' },
      ],
      params,
      []
    )

    expect(unique).toEqual([
      { lang: 'en' },
      { lang: 'en', region: 'US' },
      { lang: 'en', region: 'US', category: 'tech' },
      { lang: 'fr' },
    ])
  })

  it('should prevent collisions with special characters', () => {
    const params = [
      { slug: ['foo', 'bar'] }, // Array: A:foo,bar
      { slug: 'foo,bar' }, // String: S:foo,bar
      { slug: 'A:foo,bar' }, // String that looks like array prefix
      { slug: ['A:foo', 'bar'] }, // Array with A: prefix in element
      { slug: undefined }, // Undefined: U:undefined
      { slug: 'U:undefined' }, // String that looks like undefined prefix
    ]

    const unique = generateAllParamCombinations(
      [{ paramName: 'slug' }],
      params,
      []
    )

    expect(unique).toEqual([
      { slug: ['foo', 'bar'] },
      { slug: 'foo,bar' },
      { slug: 'A:foo,bar' },
      { slug: ['A:foo', 'bar'] },
      { slug: undefined },
      { slug: 'U:undefined' },
    ])
  })

  it('should handle parameters with pipe characters', () => {
    const params = [
      { slug: 'foo|bar' }, // String with pipe
      { slug: ['foo', 'bar|baz'] }, // Array with pipe in element
    ]

    const unique = generateAllParamCombinations(
      [{ paramName: 'slug' }],
      params,
      []
    )

    expect(unique).toEqual([{ slug: 'foo|bar' }, { slug: ['foo', 'bar|baz'] }])
  })

  it('should handle deep parameter hierarchies', () => {
    const params = [
      { a: '1', b: '2', c: '3', d: '4', e: '5' },
      { a: '1', b: '2', c: '3', d: '4', e: '6' },
      { a: '1', b: '2', c: '3', d: '7' },
    ]

    const unique = generateAllParamCombinations(
      [
        { paramName: 'a' },
        { paramName: 'b' },
        { paramName: 'c' },
        { paramName: 'd' },
        { paramName: 'e' },
      ],
      params,
      []
    )

    // Should contain all the unique prefix combinations
    expect(unique).toEqual([
      { a: '1' },
      { a: '1', b: '2' },
      { a: '1', b: '2', c: '3' },
      { a: '1', b: '2', c: '3', d: '4' },
      { a: '1', b: '2', c: '3', d: '4', e: '5' },
      { a: '1', b: '2', c: '3', d: '4', e: '6' },
      { a: '1', b: '2', c: '3', d: '7' },
    ])
  })

  it('should only generate combinations with complete root params', () => {
    const params = [
      { lang: 'en', region: 'US', slug: 'home' },
      { lang: 'en', region: 'US', slug: 'about' },
      { lang: 'fr', region: 'CA', slug: 'about' },
    ]

    const unique = generateAllParamCombinations(
      [{ paramName: 'lang' }, { paramName: 'region' }, { paramName: 'slug' }],
      params,
      ['lang', 'region'] // Root params
    )

    // Should NOT include partial combinations like { lang: 'en' }
    // Should only include combinations with complete root params
    expect(unique).toEqual([
      { lang: 'en', region: 'US' }, // Complete root params
      { lang: 'en', region: 'US', slug: 'home' },
      { lang: 'en', region: 'US', slug: 'about' },
      { lang: 'fr', region: 'CA' }, // Complete root params
      { lang: 'fr', region: 'CA', slug: 'about' },
    ])
  })

  it('should handle routes without root params normally', () => {
    const params = [
      { category: 'tech', slug: 'news' },
      { category: 'tech', slug: 'reviews' },
      { category: 'sports', slug: 'news' },
    ]

    const unique = generateAllParamCombinations(
      [{ paramName: 'category' }, { paramName: 'slug' }],
      params,
      [] // No root params
    )

    // Should generate all sub-combinations as before
    expect(unique).toEqual([
      { category: 'tech' },
      { category: 'tech', slug: 'news' },
      { category: 'tech', slug: 'reviews' },
      { category: 'sports' },
      { category: 'sports', slug: 'news' },
    ])
  })

  it('should handle single root param', () => {
    const params = [
      { lang: 'en', page: 'home' },
      { lang: 'en', page: 'about' },
      { lang: 'fr', page: 'home' },
    ]

    const unique = generateAllParamCombinations(
      [{ paramName: 'lang' }, { paramName: 'page' }],
      params,
      ['lang'] // Single root param
    )

    // Should include combinations starting from the root param
    expect(unique).toEqual([
      { lang: 'en' },
      { lang: 'en', page: 'home' },
      { lang: 'en', page: 'about' },
      { lang: 'fr' },
      { lang: 'fr', page: 'home' },
    ])
  })

  it('should handle missing root params gracefully', () => {
    const params = [
      { lang: 'en', page: 'home' },
      { lang: 'en', page: 'about' },
      { page: 'contact' }, // Missing lang root param
    ]

    const unique = generateAllParamCombinations(
      [{ paramName: 'lang' }, { paramName: 'page' }],
      params,
      ['lang'] // Root param
    )

    // Should only include combinations that have the root param
    expect(unique).toEqual([
      { lang: 'en' },
      { lang: 'en', page: 'home' },
      { lang: 'en', page: 'about' },
      // { page: 'contact' } should be excluded because it lacks the root param
    ])
  })

  it('should handle root params not in route params', () => {
    const params = [
      { category: 'tech', slug: 'news' },
      { category: 'sports', slug: 'news' },
    ]

    const unique = generateAllParamCombinations(
      [{ paramName: 'category' }, { paramName: 'slug' }],
      params,
      ['lang', 'region'] // Root params not in route params
    )

    // Should fall back to normal behavior when root params are not found
    expect(unique).toEqual([
      { category: 'tech' },
      { category: 'tech', slug: 'news' },
      { category: 'sports' },
      { category: 'sports', slug: 'news' },
    ])
  })

  it('should handle test case scenario: route with extra param but missing value', () => {
    // This simulates the failing test scenario:
    // Route: /[lang]/[locale]/other/[slug]
    // generateStaticParams only provides: { lang: 'en', locale: 'us' }
    // Missing: slug parameter
    const params = [
      { lang: 'en', locale: 'us' }, // Missing slug parameter
    ]

    const unique = generateAllParamCombinations(
      [{ paramName: 'lang' }, { paramName: 'locale' }, { paramName: 'slug' }], // All route params
      params,
      ['lang', 'locale'] // Root params
    )

    // Should generate only the combination with complete root params
    // but not try to include the missing slug param
    expect(unique).toEqual([
      { lang: 'en', locale: 'us' }, // Complete root params, slug omitted
    ])
  })

  it('should handle empty routeParams with root params', () => {
    // This might be what's happening for the [slug] route
    const params: Params[] = [] // No generateStaticParams results

    const unique = generateAllParamCombinations(
      [{ paramName: 'lang' }, { paramName: 'locale' }, { paramName: 'slug' }], // All route params
      params,
      ['lang', 'locale'] // Root params
    )

    // Should return empty array when there are no route params to work with
    expect(unique).toEqual([])
  })
})
