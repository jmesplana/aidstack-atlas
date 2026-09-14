import Head from 'next/head';
import LandingPage from '../components/LandingPage';

export default function Landing() {
  const siteUrl = 'https://disasters.aidstack.ai';
  const title = 'Aidstack Atlas — Geospatial Operational Intelligence';
  const description = 'Combine global risk signals with your own locations and operational data to understand exposure, changing conditions, and operational risk.';
  const keywords = 'geospatial intelligence, operational intelligence, risk intelligence, geospatial risk, operational risk, disaster response, outbreak response, field operations';

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
        <meta property="og:site_name" content="Aidstack Atlas" />
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
              name: 'Aidstack Atlas',
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
                'Site uploads and administrative boundary mapping',
                'Hazard and outbreak reports with uploaded conflict context',
                'Optional population, infrastructure and earth-observation layers',
                'Site exposure analysis and experimental batch Operation Viability',
                'Experimental area-scoped prioritization and Operational Outlook',
                'Decision brief exports and source-linked outbreak briefings',
                'Workspace apps for immunization planning and outbreak response'
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
