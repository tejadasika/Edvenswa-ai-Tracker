import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/session';
import { query } from '@/lib/db';
import OrganizationsClient from './OrganizationsClient';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  name: string;
  created_at: string;
  member_count: number;
  admin_count: number;
};

// super_admin-only page: list every organization, create new ones, add an
// admin owner to a fresh org. Regular admins shouldn't reach this; the
// link is hidden from their nav and the page itself bounces them away.
export default async function AdminOrganizations() {
  const s = await requireAdmin();
  if (s.role !== 'super_admin') redirect('/admin');

  const r = await query<Row>(
    `SELECT o.id::text, o.name, o.created_at,
            COALESCE(c.member_count, 0)::int AS member_count,
            COALESCE(c.admin_count, 0)::int AS admin_count
       FROM organizations o
  LEFT JOIN (
       SELECT org_id,
              COUNT(*) AS member_count,
              COUNT(*) FILTER (WHERE role IN ('admin','super_admin')) AS admin_count
         FROM users
        WHERE org_id IS NOT NULL
     GROUP BY org_id
  ) c ON c.org_id = o.id
   ORDER BY o.created_at DESC`,
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Organizations</h1>
        <p className="text-sm text-fg-faint">
          {r.rowCount} {r.rowCount === 1 ? 'organization' : 'organizations'}. As super_admin
          you can create new tenants and seed them with an owner-admin.
        </p>
      </header>

      <OrganizationsClient initial={r.rows} />
    </div>
  );
}
