import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const { email, password } = await req.json();
  if (!email || !password) return Response.json({ error: 'Email and password required' }, { status: 400 });

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) return Response.json({ error: error.message }, { status: 400 });

  // Create user_profiles row immediately so admin can set permissions without waiting for first login
  await supabaseAdmin.from('user_profiles').insert({
    user_id: data.user.id,
    email,
    is_superadmin: false,
  });

  return Response.json({ user: data.user });
}
