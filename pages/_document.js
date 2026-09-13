import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta charSet="utf-8" />
        <link rel="icon" type="image/svg+xml" href="/images/gdacs/warning.svg" />
        <meta name="theme-color" content="#1A365D" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
