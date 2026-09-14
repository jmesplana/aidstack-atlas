import Head from 'next/head';
import LandingPage from '../components/LandingPage';

export default function Landing() {
  const siteUrl = 'https://disasters.aidstack.ai';
  const title = 'Aidstack - Global Risk Intelligence';
  const description = 'Aidstack turns fragmented global signals - disasters, conflict, outbreaks, population, infrastructure and environmental conditions - into decision-ready intelligence around the assets and operations that matter to you. See risk before it becomes disruption.';
  const keywords = 'global risk intelligence, risk intelligence platform, geospatial intelligence, earth observation, decision intelligence, operational intelligence, asset exposure, supply chain risk, business continuity, climate risk, conflict risk, disruption risk, situational awareness, AI geospatial analysis, GDACS, WHO outbreaks, ACLED, WorldPop, Google Earth Engine, OpenStreetMap infrastructure, admin boundary analysis, logistics assessment, trend analysis, humanitarian technology, public health operations';

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
        <meta property="og:site_name" content="Aidstack" />
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
              name: 'Aidstack Global Risk Intelligence',
              alternateName: 'Aidstack Disasters',
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
                'Multi-signal risk monitoring: disasters, outbreaks, conflict and environmental conditions',
                'Bring your own assets: facility CSV and boundary shapefile/GeoJSON upload',
                'Asset and area exposure analysis against live hazard signals',
                'Access and logistics assessment from OpenStreetMap infrastructure',
                'Population exposure context via WorldPop',
                'Six Google Earth Engine context layers (nighttime lights, Sentinel-2, Sentinel-1, flood/drought, accessibility)',
                'Healthcare accessibility overlay (Oxford MAP travel time)',
                'Area prioritization with visible drivers and confidence',
                'Temporal trend analysis and change detection',
                'Natural-language querying of the operational environment',
                'Forward-looking operational outlook',
                'Source-linked briefings and exportable decision briefs',
                'Workspace app hub for specialist workflows',
                'Browser-local (IndexedDB) persistence for low-connectivity environments'
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
