import PageShell, { ComingSoon } from '../PageShell';

/** Password-recovery landing (reset-email links). Stream A fills this in. */
export default function ResetPasswordScreen() {
  return (
    <PageShell title="Reset Password">
      <ComingSoon note="Password reset is on its way — this workstream hasn't landed yet." />
    </PageShell>
  );
}
