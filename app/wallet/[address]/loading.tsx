/* A wallet's page while it loads: the black stage it opens on, so nothing flashes white. */
export default function Loading() {
  return <main className="b-root" data-testid="wallet-loading"><section className="b-stage" aria-busy="true"><div className="b-stage__in"><p className="b-small b-center">Loading the wallet…</p></div></section></main>;
}
