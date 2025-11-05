import { FallbackMode } from '../../../lib/fallback'
import { calculateFallbackMode } from './calculate-fallback-mode'

describe('calculateFallbackMode', () => {
  it('should return NOT_FOUND when dynamic params are disabled', () => {
    const result = calculateFallbackMode(false, [], FallbackMode.PRERENDER)

    expect(result).toBe(FallbackMode.NOT_FOUND)
  })

  it('should return NOT_FOUND when dynamic params are disabled regardless of root params', () => {
    const result = calculateFallbackMode(
      false,
      ['rootParam'],
      FallbackMode.BLOCKING_STATIC_RENDER
    )

    expect(result).toBe(FallbackMode.NOT_FOUND)
  })

  it('should return BLOCKING_STATIC_RENDER when dynamic params are enabled and root params exist', () => {
    const result = calculateFallbackMode(
      true,
      ['rootParam1', 'rootParam2'],
      FallbackMode.PRERENDER
    )

    expect(result).toBe(FallbackMode.BLOCKING_STATIC_RENDER)
  })

  it('should return base fallback mode when dynamic params are enabled and no root params', () => {
    const result = calculateFallbackMode(true, [], FallbackMode.PRERENDER)

    expect(result).toBe(FallbackMode.PRERENDER)
  })

  it('should return base fallback mode when dynamic params are enabled and empty root params', () => {
    const result = calculateFallbackMode(
      true,
      [],
      FallbackMode.BLOCKING_STATIC_RENDER
    )

    expect(result).toBe(FallbackMode.BLOCKING_STATIC_RENDER)
  })

  it('should return NOT_FOUND when dynamic params are enabled but no base fallback mode provided', () => {
    const result = calculateFallbackMode(true, [], undefined)

    expect(result).toBe(FallbackMode.NOT_FOUND)
  })

  it('should prioritize root params over base fallback mode', () => {
    const result = calculateFallbackMode(
      true,
      ['rootParam'],
      FallbackMode.PRERENDER
    )

    expect(result).toBe(FallbackMode.BLOCKING_STATIC_RENDER)
  })

  it('should handle single root param correctly', () => {
    const result = calculateFallbackMode(
      true,
      ['singleParam'],
      FallbackMode.PRERENDER
    )

    expect(result).toBe(FallbackMode.BLOCKING_STATIC_RENDER)
  })
})
