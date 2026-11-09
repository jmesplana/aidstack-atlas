import dynamic from 'next/dynamic';

// Reviewed modules use literal imports so Next.js can build separate bundles.
// Keep module registration here; AppHub does not need app-specific branches.
export const APP_COMPONENTS = Object.freeze({
  'access-gaps': dynamic(() => import('../apps/access-gaps'), {
    ssr: false, loading: () => <p role="status">Loading Access Gaps...</p>
  }),
  outbreak: dynamic(() => import('../apps/outbreak'), {
    ssr: false, loading: () => <p role="status">Loading outbreak response...</p>
  }),
  immunization: dynamic(() => import('../apps/immunization'), {
    ssr: false, loading: () => <p role="status">Loading app...</p>
  })
});
