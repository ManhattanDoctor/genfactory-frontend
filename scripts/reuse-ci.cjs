// Reuse only the push check for the exact source commit; PR merge checks are different inputs.
module.exports = async function reuseCi({
  github,
  context,
  core,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  attempts = 90,
}) {
  const query = {
    ...context.repo,
    workflow_id: 'ci.yml',
    event: 'push',
    head_sha: context.sha,
    per_page: 100,
  };
  for (let attempt = 0; attempt < attempts; attempt++) {
    const { data } = await github.rest.actions.listWorkflowRuns(query);
    const run = data.workflow_runs
      .filter((item) => item.event === 'push' && item.head_sha === context.sha)
      .sort((a, b) => b.id - a.id)[0];
    if (!run) {
      core.setOutput('verified', 'false');
      core.info('No push check for this commit; run the complete checks in this workflow.');
      return;
    }
    if (run.status === 'completed') {
      if (run.conclusion !== 'success')
        throw new Error(`Checks ${run.id} ended with ${run.conclusion}; fix or rerun them before building.`);
      core.setOutput('verified', 'true');
      core.info(`Reusing successful checks: ${run.html_url}`);
      return;
    }
    core.info(`Waiting for checks ${run.id} (${run.status}).`);
    if (attempt + 1 < attempts) await sleep(20_000);
  }
  throw new Error('Timed out waiting for the existing checks; no image will be published.');
};
