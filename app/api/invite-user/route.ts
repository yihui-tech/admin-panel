import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const { email } = await req.json();
  if (!email) return Response.json({ error: 'Email required' }, { status: 400 });

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ user: data.user });
}
