import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

type HomeRecord = { id: string };

type DeviceRecord = {
  id: string;
  public_device_id: string;
  pairing_code: string | null;
  name: string;
};

type ApplianceRecord = {
  id: string;
};

export async function POST(_request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { data: home } = await supabase
    .from("homes")
    .select("id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<HomeRecord>();

  if (!home) {
    return NextResponse.json({ error: "Home not found." }, { status: 404 });
  }

  const service = createServiceClient();
  const { data: existingDevice, error: deviceLookupError } = await service
    .from("devices")
    .select("id")
    .eq("home_id", home.id)
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (deviceLookupError) {
    return NextResponse.json({ error: deviceLookupError.message }, { status: 500 });
  }

  if (existingDevice) {
    return NextResponse.json({ error: "A device already exists for this home." }, { status: 409 });
  }

  const { data: device, error: deviceError } = await service
    .from("devices")
    .insert({
      home_id: home.id,
      owner_id: user.id,
      name: "Primary ESP32",
      status: "pairing",
    })
    .select("id, public_device_id, pairing_code, name")
    .single<DeviceRecord>();

  if (deviceError || !device) {
    return NextResponse.json({ error: deviceError?.message ?? "Device creation failed." }, { status: 500 });
  }

  const { data: appliance, error: applianceError } = await service
    .from("appliances")
    .insert({
      device_id: device.id,
      name: "Ceiling Light",
      room: "Living Room",
      kind: "light",
      state: { power: false },
      is_online: false,
      sort_order: 1,
    })
    .select("id")
    .single<ApplianceRecord>();

  if (applianceError) {
    return NextResponse.json({ error: applianceError.message }, { status: 500 });
  }

  return NextResponse.json({
    device,
    applianceId: appliance?.id ?? null,
  });
}
