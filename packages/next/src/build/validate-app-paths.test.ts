import { validateAppPaths } from './validate-app-paths'

describe('validateAppPaths', () => {
  // NOTE: The paths passed to validateAppPaths have already been normalized
  // by normalizeAppPath, which strips out parallel route segments (@modal, etc.),
  // route groups ((group)), and the trailing /page or /route segment.
  //
  // So app/blog/@modal/[slug]/page.tsx becomes /blog/[slug]
  // and app/blog/[slug]/page.tsx also becomes /blog/[slug]

  describe('should allow valid route configurations', () => {
    it('allows routes with different static segments', () => {
      const paths = ['/blog/posts', '/blog/authors', '/about']

      expect(() => validateAppPaths(paths)).not.toThrow()
    })

    it('allows routes with different depths', () => {
      const paths = ['/blog', '/blog/[slug]', '/blog/[slug]/comments']

      expect(() => validateAppPaths(paths)).not.toThrow()
    })

    it('allows routes with different dynamic segment positions', () => {
      const paths = ['/[category]/posts', '/posts/[slug]', '/posts/featured']

      expect(() => validateAppPaths(paths)).not.toThrow()
    })

    it('allows routes with different catch-all patterns', () => {
      const paths = ['/docs/[...slug]', '/blog/[slug]']

      expect(() => validateAppPaths(paths)).not.toThrow()
    })

    it('allows special routes', () => {
      const paths = ['/_not-found', '/_global-error', '/blog/[slug]', '/about']

      expect(() => validateAppPaths(paths)).not.toThrow()
    })

    it('allows same dynamic segment names in different paths', () => {
      const paths = ['/blog/[slug]', '/posts/[slug]', '/docs/[slug]']

      expect(() => validateAppPaths(paths)).not.toThrow()
    })

    it('allows routes with optional catch-all', () => {
      const paths = ['/docs/[[...slug]]', '/blog/[slug]']

      expect(() => validateAppPaths(paths)).not.toThrow()
    })

    it('allows catch-all at the end of path', () => {
      const paths = ['/docs/[...slug]', '/blog/posts/[...rest]']

      expect(() => validateAppPaths(paths)).not.toThrow()
    })
  })

  describe('should detect ambiguous routes', () => {
    it('detects conflict from normalized parallel routes (most common case)', () => {
      // This represents:
      // - app/blog/[slug]/page.tsx
      // - app/blog/@modal/[modalSlug]/page.tsx (normalized to /blog/[modalSlug])
      const paths = ['/blog/[slug]', '/blog/[modalSlug]']

      expect(() => validateAppPaths(paths)).toThrow(/Ambiguous app routes/)
      expect(() => validateAppPaths(paths)).toThrow(/blog\/\[slug\]/)
      expect(() => validateAppPaths(paths)).toThrow(/blog\/\[modalSlug\]/)
    })

    it('detects conflict between three normalized parallel routes', () => {
      // This represents multiple parallel slots with dynamic segments
      const paths = ['/dashboard/[id]', '/dashboard/[userId]']

      expect(() => validateAppPaths(paths)).toThrow(/Ambiguous app routes/)
      expect(() => validateAppPaths(paths)).toThrow(/dashboard\/\[id\]/)
      expect(() => validateAppPaths(paths)).toThrow(/dashboard\/\[userId\]/)
    })

    it('detects conflict with different dynamic segment names', () => {
      const paths = ['/blog/[slug]', '/blog/[id]']

      expect(() => validateAppPaths(paths)).toThrow(/Ambiguous app routes/)
      expect(() => validateAppPaths(paths)).toThrow(/blog\/\[slug\]/)
      expect(() => validateAppPaths(paths)).toThrow(/blog\/\[id\]/)
    })

    it('detects conflict with catch-all segments', () => {
      const paths = ['/docs/[...slug]', '/docs/[...pages]']

      expect(() => validateAppPaths(paths)).toThrow(/Ambiguous app routes/)
    })

    it('detects conflict with optional catch-all segments', () => {
      const paths = ['/docs/[[...slug]]', '/docs/[[...pages]]']

      expect(() => validateAppPaths(paths)).toThrow(/Ambiguous app routes/)
    })

    it('detects multiple conflicts', () => {
      const paths = [
        '/blog/[slug]',
        '/blog/[id]',
        '/posts/[id]',
        '/posts/[slug]',
      ]

      expect(() => validateAppPaths(paths)).toThrow(/Ambiguous app routes/)
      // Should report both conflicts
      const error = () => validateAppPaths(paths)
      expect(error).toThrow(/blog/)
      expect(error).toThrow(/posts/)
    })

    it('detects conflict with three or more routes', () => {
      // Three different routes that all normalize to the same pattern
      const paths = ['/blog/[slug]', '/blog/[id]', '/blog/[postId]']

      expect(() => validateAppPaths(paths)).toThrow(/Ambiguous app routes/)
      // All three should be listed
      expect(() => validateAppPaths(paths)).toThrow(/blog\/\[slug\]/)
      expect(() => validateAppPaths(paths)).toThrow(/blog\/\[id\]/)
      expect(() => validateAppPaths(paths)).toThrow(/blog\/\[postId\]/)
    })
  })

  describe('individual path validation', () => {
    describe('segment syntax errors', () => {
      it('detects three-dot character (…) instead of ...', () => {
        const paths = ['/docs/[…slug]']

        expect(() => validateAppPaths(paths)).toThrow(
          /three-dot character \('…'\)/
        )
      })

      it('detects extra brackets in segment names', () => {
        const paths = ['/blog/[[slug]']

        expect(() => validateAppPaths(paths)).toThrow(
          /may not start or end with extra brackets/
        )
      })

      it('detects erroneous periods at start of segment', () => {
        const paths = ['/blog/[.slug]']

        expect(() => validateAppPaths(paths)).toThrow(
          /may not start with erroneous periods/
        )
      })

      it('detects optional non-catch-all segments', () => {
        const paths = ['/blog/[[slug]]']

        expect(() => validateAppPaths(paths)).toThrow(
          /Optional route parameters are not yet supported/
        )
      })
    })

    describe('duplicate slug names', () => {
      it('detects duplicate slug names in same path', () => {
        const paths = ['/blog/[slug]/posts/[slug]']

        expect(() => validateAppPaths(paths)).toThrow(
          /same slug name "slug" repeat/
        )
      })

      it('detects slug names differing only by non-word symbols', () => {
        const paths = ['/blog/[helloworld]/[hello-world]']

        expect(() => validateAppPaths(paths)).toThrow(
          /differ only by non-word symbols/
        )
      })
    })

    describe('catch-all placement', () => {
      it('detects catch-all not at the end', () => {
        const paths = ['/docs/[...slug]/more']

        expect(() => validateAppPaths(paths)).toThrow(
          /Catch-all must be the last part/
        )
      })

      it('detects optional catch-all not at the end', () => {
        const paths = ['/docs/[[...slug]]/more']

        expect(() => validateAppPaths(paths)).toThrow(
          /Optional catch-all must be the last part/
        )
      })

      it('detects both required and optional catch-all in same path', () => {
        // This would be impossible in practice but we should catch it
        const paths = ['/docs/[...required]/[[...optional]]']

        expect(() => validateAppPaths(paths)).toThrow(
          /cannot use both a required and optional catch-all/
        )
      })
    })

    describe('optional catch-all specificity conflicts', () => {
      it('detects route with same specificity as optional catch-all', () => {
        const paths = ['/docs', '/docs/[[...slug]]']

        expect(() => validateAppPaths(paths)).toThrow(
          /same specificity as an optional catch-all/
        )
      })

      it('allows optional catch-all without conflicting route', () => {
        const paths = ['/docs/[[...slug]]']

        expect(() => validateAppPaths(paths)).not.toThrow()
      })

      it('allows nested optional catch-all without conflict', () => {
        const paths = ['/docs/api/[[...slug]]', '/docs/guides']

        expect(() => validateAppPaths(paths)).not.toThrow()
      })
    })
  })

  describe('edge cases', () => {
    it('handles empty array', () => {
      expect(() => validateAppPaths([])).not.toThrow()
    })

    it('handles single route', () => {
      expect(() => validateAppPaths(['/blog/[slug]'])).not.toThrow()
    })

    it('handles complex nested structures', () => {
      const paths = [
        '/[locale]/blog/[category]/[slug]',
        '/[locale]/blog/[category]/featured',
      ]

      expect(() => validateAppPaths(paths)).not.toThrow()
    })

    it('handles root route', () => {
      const paths = ['/', '/blog']

      expect(() => validateAppPaths(paths)).not.toThrow()
    })
  })

  describe('error message quality', () => {
    it('provides clear error message with normalized path', () => {
      const paths = ['/blog/[slug]', '/blog/[modalSlug]']

      expect(() => validateAppPaths(paths)).toThrow(
        /Ambiguous route pattern "\/blog\/\[\*\]"/
      )
    })

    it('provides actionable guidance', () => {
      const paths = ['/blog/[slug]', '/blog/[id]']

      expect(() => validateAppPaths(paths)).toThrow(
        /ensure that dynamic segments have unique patterns/
      )
    })

    it('lists all conflicting routes', () => {
      const paths = ['/blog/[slug]', '/blog/[id]', '/blog/[postId]']

      try {
        validateAppPaths(paths)
        throw new Error('Should have thrown an error')
      } catch (error) {
        const message = (error as Error).message
        if (message === 'Should have thrown an error') {
          throw error
        }
        expect(message).toContain('/blog/[slug]')
        expect(message).toContain('/blog/[id]')
        expect(message).toContain('/blog/[postId]')
      }
    })

    it('provides clear message for syntax errors', () => {
      const paths = ['/docs/[...slug]/more']

      expect(() => validateAppPaths(paths)).toThrow(
        /in route "\/docs\/\[\.\.\.slug\]\/more"/
      )
    })
  })
})
