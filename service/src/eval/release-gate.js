/**
 * Release gate. The shipped default stays off until a real iPhone and Mac
 * offline recovery has been recorded. Automated cases alone do not flip it.
 */
export function evaluateRelease(report) {
  const total = report.total || 0;
  const semanticRate = total ? report.passed / total : 0;
  const criticalOk = (report.criticalFailed || 0) === 0;
  const faultsOk =
    (report.messageLoss || 0) === 0 &&
    (report.duplicateExec || 0) === 0 &&
    (report.indexLoss || 0) === 0 &&
    (report.profileWrites || 0) === 0;
  const automatedPass = semanticRate >= 0.9 && criticalOk && faultsOk && !!report.budgetOk;
  return {
    semanticRate,
    criticalOk,
    faultsOk,
    automatedPass,
    deviceVerified: !!report.deviceVerified,
    enableByDefault: automatedPass && !!report.deviceVerified,
  };
}
