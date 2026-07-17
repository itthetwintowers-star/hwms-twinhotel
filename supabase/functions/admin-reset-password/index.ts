// =========================================================
//  supabase/functions/admin-reset-password/index.ts
//  Edge Function: ให้ Admin รีเซ็ตรหัสผ่านของผู้ใช้คนอื่นได้ (กรณีลืมรหัสผ่านจริง ๆ
//  และ login เข้าไม่ได้เลย จึงเปลี่ยนรหัสผ่านเองผ่าน "เปลี่ยนรหัสผ่าน" ไม่ได้)
//
//  ทำไมต้องเป็น Edge Function (รันบนเซิร์ฟเวอร์ของ Supabase) แทนที่จะเรียกตรงจาก
//  หน้าเว็บ (GitHub Pages)? เพราะการเปลี่ยนรหัสผ่านของ "คนอื่น" ต้องใช้ service_role
//  key (สิทธิ์สูงสุด) ซึ่งห้ามฝังในโค้ด frontend เด็ดขาด (ใครก็เปิดดูโค้ดได้)
//  Edge Function จึงเป็นจุดเดียวที่ปลอดภัยพอจะถือ key นี้ไว้ (เก็บเป็น secret
//  ฝั่งเซิร์ฟเวอร์ ไม่มีใครเห็นได้จากภายนอก)
//
//  วิธี deploy (ทำครั้งเดียว):
//    1. ติดตั้ง Supabase CLI: npm install -g supabase
//    2. supabase login
//    3. supabase link --project-ref <your-project-ref>
//    4. supabase functions deploy admin-reset-password
//
//  Secrets ที่ต้องใช้ (ตั้งค่าอัตโนมัติอยู่แล้วโดย Supabase สำหรับทุก Edge Function
//  ไม่ต้องตั้งเอง): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// =========================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

Deno.serve(async (req) => {
  // ตอบ preflight request ของ CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, message: "ไม่พบ token กรุณาเข้าสู่ระบบใหม่" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // client ตัวแรก: ใช้ anon key + JWT ของผู้เรียก เพื่อตรวจสอบว่าใครกำลังเรียกอยู่
    // (RLS ของตาราง profiles จะบังคับให้เห็นแค่แถวของตัวเองถ้าไม่ใช่ admin อยู่แล้ว)
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: callerUser, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerUser?.user) {
      return new Response(
        JSON.stringify({ success: false, message: "token ไม่ถูกต้องหรือหมดอายุ" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: callerProfile } = await callerClient
      .from("profiles")
      .select("role, active")
      .eq("id", callerUser.user.id)
      .single();

    if (!callerProfile || callerProfile.role !== "Admin" || !callerProfile.active) {
      return new Response(
        JSON.stringify({ success: false, message: "เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่รีเซ็ตรหัสผ่านผู้อื่นได้" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ผ่านการตรวจสอบว่าเป็น Admin จริงแล้ว จึงอ่าน target user + รหัสผ่านใหม่จาก body
    const { targetUserId, newPassword } = await req.json();

    if (!targetUserId || !newPassword || newPassword.length < 6) {
      return new Response(
        JSON.stringify({ success: false, message: "ข้อมูลไม่ครบถ้วน (ต้องมี targetUserId และ newPassword อย่างน้อย 6 ตัวอักษร)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // client ตัวที่สอง: ใช้ service_role key (สิทธิ์สูงสุด) เพื่อรีเซ็ตรหัสผ่านจริง
    // ตัวแปรนี้ปลอดภัยเพราะรันอยู่บนเซิร์ฟเวอร์ของ Supabase เท่านั้น ไม่เคยถูกส่งออกไปให้ browser
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error: updateError } = await adminClient.auth.admin.updateUserById(targetUserId, {
      password: newPassword
    });

    if (updateError) {
      return new Response(
        JSON.stringify({ success: false, message: "รีเซ็ตรหัสผ่านไม่สำเร็จ: " + updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "รีเซ็ตรหัสผ่านสำเร็จ" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, message: "เกิดข้อผิดพลาดในระบบ: " + (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
