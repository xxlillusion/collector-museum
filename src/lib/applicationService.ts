import { supabase } from './supabase';

/**
 * Booth applications (0006): a vendor account applies to a published show
 * with one of their stores; the show's organizer approves or declines.
 * Approval is a communication/tracking state — booth assignment stays a
 * manual action in the show editor (which rect is the organizer's call).
 *
 * Vendor-side reads degrade gracefully (empty/null) like the public readers;
 * writes throw so the UI can surface the message.
 */

export type ApplicationStatus = 'pending' | 'approved' | 'declined';

export interface BoothApplication {
  id: string;
  showId: string;
  vendorId: string;
  vendorName: string;
  message: string;
  status: ApplicationStatus;
  createdAt: string;
}

function client() {
  if (!supabase) throw new Error('Accounts are not configured on this deployment.');
  return supabase;
}

interface ApplicationRow {
  id: string;
  show_id: string;
  vendor_id: string;
  message: string;
  status: ApplicationStatus;
  created_at: string;
  vendors: { name: string } | null;
}

function toApplication(row: ApplicationRow): BoothApplication {
  return {
    id: row.id,
    showId: row.show_id,
    vendorId: row.vendor_id,
    vendorName: row.vendors?.name ?? 'Unknown store',
    message: row.message ?? '',
    status: row.status,
    createdAt: row.created_at,
  };
}

const APPLICATION_COLUMNS = 'id, show_id, vendor_id, message, status, created_at, vendors(name)';

/** Apply with one of the caller's stores. Throws (e.g. duplicate application). */
export async function applyForBooth(args: {
  applicantId: string;
  showId: string;
  vendorId: string;
  message: string;
}): Promise<void> {
  const sb = client();
  const { error } = await sb.from('booth_applications').insert({
    show_id: args.showId,
    vendor_id: args.vendorId,
    applicant_id: args.applicantId,
    message: args.message.trim(),
  });
  if (error) {
    if (error.code === '23505') {
      throw new Error('This store has already applied to this show.');
    }
    throw new Error(`apply: ${error.message}`);
  }
}

/** The caller's own applications to one show (one per store, at most). */
export async function listMyApplications(
  showId: string,
  applicantId: string,
): Promise<BoothApplication[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('booth_applications')
      .select(APPLICATION_COLUMNS)
      .eq('show_id', showId)
      .eq('applicant_id', applicantId);
    if (error || !data) return [];
    return (data as unknown as ApplicationRow[]).map(toApplication);
  } catch {
    return [];
  }
}

/** Withdraw a pending application (applicant only, RLS-enforced). */
export async function withdrawApplication(id: string): Promise<void> {
  const sb = client();
  const { error } = await sb.from('booth_applications').delete().eq('id', id);
  if (error) throw new Error(`withdraw: ${error.message}`);
}

/** All applications to a show — organizer of the show only (RLS). */
export async function listApplicationsForShow(showId: string): Promise<BoothApplication[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('booth_applications')
      .select(APPLICATION_COLUMNS)
      .eq('show_id', showId)
      .order('created_at', { ascending: true });
    if (error || !data) return [];
    return (data as unknown as ApplicationRow[]).map(toApplication);
  } catch {
    return [];
  }
}

export async function setApplicationStatus(
  id: string,
  status: Exclude<ApplicationStatus, 'pending'>,
): Promise<void> {
  const sb = client();
  const { error } = await sb.from('booth_applications').update({ status }).eq('id', id);
  if (error) throw new Error(`${status === 'approved' ? 'approve' : 'decline'}: ${error.message}`);
}
