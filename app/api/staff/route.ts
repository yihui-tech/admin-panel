import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// List all staff profiles
export async function GET() {
  const { data, error } = await adminClient
    .from('user_profiles')
    .select('user_id, email, location_id, is_superadmin, locations(id, name)')
    .order('email');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// Create new user account
export async function POST(req: NextRequest) {
  const { email, password, location_id } = await req.json();
  if (!email?.trim() || !password?.trim()) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  }

  const { data: { user }, error: createError } = await adminClient.auth.admin.createUser({
    email: email.trim(),
    password: password.trim(),
    email_confirm: true,
  });
  if (createError) return NextResponse.json({ error: createError.message }, { status: 500 });

  const { error: profileError } = await adminClient
    .from('user_profiles')
    .insert({
      user_id: user!.id,
      email: email.trim(),
      location_id: location_id ?? null,
      is_superadmin: false,
    });
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// Update yard assignment
export async function PUT(req: NextRequest) {
  const { user_id, location_id } = await req.json();
  if (!user_id) return NextResponse.json({ error: 'user_id is required.' }, { status: 400 });

  const { error } = await adminClient
    .from('user_profiles')
    .update({ location_id: location_id ?? null })
    .eq('user_id', user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// Reset password
export async function PATCH(req: NextRequest) {
  const { user_id, password } = await req.json();
  if (!user_id || !password) {
    return NextResponse.json({ error: 'user_id and password are required.' }, { status: 400 });
  }

  const { error } = await adminClient.auth.admin.updateUserById(user_id, { password });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// Delete user account entirely
export async function DELETE(req: NextRequest) {
  const { user_id } = await req.json();
  const { error } = await adminClient.auth.admin.deleteUser(user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
