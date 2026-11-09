import styles from '../../platform/Planning.module.css';
const count = value => value == null ? 'Unknown' : value.toLocaleString(undefined, { maximumFractionDigits: 0 });

export default function DecisionBrief({ result, onUseRecommendation }) {
  const decision = result.decision;
  if (!decision) return <p className={styles.notice}>This saved assessment predates complementary-site recommendations. Recalculate in Access Gaps to create a decision brief.</p>;
  return <section aria-label="Outreach decision brief">
    <h3>Decision brief · {decision.status === 'provisional' ? 'Provisional — evidence needs review' : 'For local operational review'}</h3>
    <p><strong>Population considered:</strong> {decision.cohort}. Planning year: {result.sources.populationDate.slice(0, 4)}. Travel threshold: {result.settings.thresholdMinutes} minutes.</p>
    <p><strong>Proposed option:</strong> {decision.steps.length ? `Review ${decision.steps.length} complementary outreach ${decision.steps.length === 1 ? 'site' : 'sites'} within your limit of ${decision.budget}. Together they add geographic reach for ${count(decision.additionalPopulation)} people previously beyond the threshold${decision.reachableFromUnknown ? `, plus ${count(decision.reachableFromUnknown)} whose baseline access was unknown` : ''}.` : 'No additional reach was found among the tested locations.'}</p>
    <p>With this option, {count(decision.coveredPopulation)} of {count(result.totals.population)} people ({decision.coveragePercent == null ? 'unknown' : decision.coveragePercent.toFixed(1)}%) would be within the threshold. {count(decision.remainingBeyondThreshold)} remain beyond it; {count(decision.remainingUnknown)} still have unknown access.</p>
    {!!decision.issues.length && <div className={styles.notice}><strong>Resolve before deployment approval</strong><ul>{decision.issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>}
    <p><strong>Next action:</strong> {decision.nextAction}</p>
    {!!decision.steps.length && <>
      <div className={styles.tableWrap}><table className={styles.table} style={{ whiteSpace: 'normal', tableLayout: 'fixed', minWidth: 620 }}><thead><tr><th style={{ width: '28%' }}>Order / outreach option</th><th>Additional people after earlier sites</th><th>Newly reachable, baseline unknown</th><th>Overlap with earlier sites</th><th>Cumulative coverage including existing services</th></tr></thead><tbody>{decision.steps.map(step => <tr key={step.id}><td>{step.order}. {step.name}</td><td>{count(step.additionalPopulation)}</td><td>{count(step.reachableFromUnknown)}</td><td>{count(step.overlapPopulation)}</td><td>{count(step.cumulativeCoverage)}</td></tr>)}</tbody></table></div>
      <p>Each next site is chosen for the largest remaining reach among the tested options. A nearby site is retained only if it reaches additional people. This does not establish a globally optimal location or sufficient session capacity.</p>
      {onUseRecommendation && <button onClick={onUseRecommendation}>Use recommended sites in combined scenario</button>}
    </>}
    {!!decision.alternatives.length && <details><summary>Why other candidates were not included</summary><ul>{decision.alternatives.map(site => <li key={site.id}>{site.name}: {count(site.gain)} further people could be reached after the proposed sites; {count(site.overlap)} overlap. {site.gain > 0 ? 'Outside the selected site limit.' : 'No remaining geographic gain; consider only if capacity or local conditions justify it.'}</li>)}</ul></details>}
    <p>{decision.interpretation}</p>
    <p><strong>Delivery follow-up:</strong> Confirm the eligible unvaccinated population, venue and community acceptance; assign teams and session dates; check vaccine supply, cold chain, transport and security. Reassess remaining gaps using alternative sites or mobile routes.</p>
    <p>Decision owner: {result.settings.decisionOwner || 'Not assigned'} · Review by: {result.settings.reviewDate || 'Not set'}.</p>
    {result.settings.deliveryConstraints && <p>Recorded delivery constraints: {result.settings.deliveryConstraints}</p>}
  </section>;
}
