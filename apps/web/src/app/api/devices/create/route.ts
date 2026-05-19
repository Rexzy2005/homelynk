import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type DeviceRecord = {
  id: string;
  public_device_id: string;
  pairing_code: string | null;
  name: string;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const rawName = typeof body?.deviceName === "string" ? body.deviceName.trim() : "";
  const deviceName = rawName || "ESP32 Hub";

  const { data, error } = await supabase.rpc("create_home_device", {
    device_name: deviceName,
  });

  if (error) {
    const message = error.message.includes("function public.create_home_device")
      ? "Run the latest supabase/schema.sql before adding devices."
      : error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const device = Array.isArray(data) ? (data[0] as DeviceRecord | undefined) : undefined;
  if (!device) {
    return NextResponse.json({ error: "Device creation returned no device." }, { status: 500 });
  }

  return NextResponse.json({
    device,
  });
}
