import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getRealtimeUrl } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/service";

function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const publicDeviceId = body?.publicDeviceId?.trim();
  const pairingCode = body?.pairingCode?.trim().toUpperCase();
  const firmwareVersion = body?.firmwareVersion?.trim() ?? null;

  if (!publicDeviceId || !pairingCode) {
    return NextResponse.json({ error: "publicDeviceId and pairingCode are required." }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: device, error } = await supabase
    .from("devices")
    .select("id,public_device_id,pairing_code,device_secret_hash")
    .eq("public_device_id", publicDeviceId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!device || device.pairing_code !== pairingCode) {
    return NextResponse.json({ error: "Invalid device pairing credentials." }, { status: 404 });
  }

  if (device.device_secret_hash) {
    return NextResponse.json({ error: "Device is already claimed." }, { status: 409 });
  }

  const deviceSecret = `hly_${randomBytes(32).toString("base64url")}`;
  const { error: updateError } = await supabase
    .from("devices")
    .update({
      device_secret_hash: hashSecret(deviceSecret),
      pairing_code: null,
      firmware_version: firmwareVersion,
      status: "provisioned",
      claimed_at: new Date().toISOString(),
    })
    .eq("id", device.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    deviceId: device.public_device_id,
    deviceSecret,
    websocketUrl: getRealtimeUrl(),
  });
}
