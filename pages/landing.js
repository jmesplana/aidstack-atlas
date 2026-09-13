import Head from 'next/head';
import LandingPage from '../components/LandingPage';

export default function Landing() {
  const siteUrl = 'https://disasters.aidstack.ai';
  const title = 'Aidstack Disasters - Geospatial Operational Intelligence';
  const description = 'Monitor disasters and outbreaks, then open workspace apps for immunization planning, response tracking and source-linked briefings. Bring your data, save plans and export results with Aidstack Disasters.';
  const keywords = 'workspace apps, app hub, immunization session planning, outbreak response, response indicators, leadership briefings, geospatial operational intelligence, crisis response, public health operations, field operations, humanitarian technology, disaster response, GDACS, WHO outbreaks, ACLED CSV upload, WorldPop, Google Earth Engine, admin boundary analysis, prioritization board, operational outlook, situation report, emergency response platform, conflict mapping, population data, OSM infrastructure, logistics assessment, trend analysis, temporal patterns';

  return (
    <>
      <Head>
        {/* Primary Meta Tags */}
        <title>{title}</title>
        <meta name="title" content={title} />
        <meta name="description" content={description} key="description" />
        <meta name="keywords" content={keywords} />
        <meta name="author" content="Aidstack" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="robots" content="index, follow" />
        <meta name="language" content="English" />
        <meta name="revisit-after" content="7 days" />

        {/* Canonical URL */}
        <link rel="canonical" href={`${siteUrl}/landing`} />

        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${siteUrl}/landing`} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:site_name" content="Aidstack Disasters" />
        <meta property="og:locale" content="en_US" />

        {/* Twitter */}
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:url" content={`${siteUrl}/landing`} />
        <meta property="twitter:title" content={title} />
        <meta property="twitter:description" content={description} />
        <meta name="twitter:creator" content="@aidstack" />

        {/* Additional Meta Tags */}
        <meta name="theme-color" content="#1A365D" />
        <meta name="msapplication-TileColor" content="#1A365D" />

        {/* Favicon */}
        <link rel="icon" type="image/svg+xml" href="/images/gdacs/warning.svg" />

        {/* Structured Data - Schema.org JSON-LD */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'Aidstack Disasters',
              applicationCategory: 'BusinessApplication',
              operatingSystem: 'Web',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'USD'
              },
              description: description,
              url: siteUrl,
              author: {
                '@type': 'Organization',
                name: 'Aidstack',
                url: 'https://aidstack.ai'
              },
              featureList: [
                'Workspace App Hub with compatible ZIP app installation',
                'Immunization coverage, session planning and resource estimates',
                'Outbreak aggregate data imports, trends and mobility context',
                'Response indicators, coordinator actions and source-linked briefings',
                'Browser-local app plans and outbreak snapshots',
                'Planning workbook, briefing and SVG visual exports',
                'Real-time GDACS disaster monitoring',
                'WHO outbreak report mapping',
                'Uploaded ACLED conflict event tracking',
                'WorldPop population demographics',
                'Admin boundary shapefile analysis',
                'District hazard analysis with auditable drivers',
                'Operational outlook and prioritization board',
                'Operation viability analysis',
                'Six Google Earth Engine context layers (nighttime lights, Sentinel-2, Sentinel-1, flood/drought, accessibility)',
                'Healthcare accessibility overlay (Oxford MAP travel time)',
                'IndexedDB workspace persistence for low-connectivity workflows',
                'Error boundary crash protection',
                'Enhanced choropleth styling with 7 color palettes',
                'Batch site assessment',
                'Interactive geospatial mapping',
                'AI-assisted decision support',
                'OSM infrastructure integration and logistics assessment',
                'Temporal trend analysis and pattern detection',
                'Multi-tier caching with IndexedDB storage'
              ]
            })
          }}
        />

        {/* Additional Schema for Organization */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'Aidstack',
              url: 'https://aidstack.ai',
              sameAs: [
                'https://github.com/jmesplana/gdacs_ai'
              ]
            })
          }}
        />
      </Head>
      <LandingPage />
    </>
  );
}
