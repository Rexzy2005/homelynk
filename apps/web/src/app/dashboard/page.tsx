import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DeviceConsole, type ApplianceRecord, type CommandRecord, type DeviceRecord } from "@/components/dashboard/device-console";
import { hasSupabaseConfig } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Dashboard",
};

export const dynamic = "force-dynamic";

type HomeRecord = {
  id: string;
  name: string;
};

export default async function DashboardPage() {
  if (!hasSupabaseConfig()) {
    return (
      <DeviceConsole
        userEmail="demo@homelynk.local"
        home={{ id: "demo-home", name: "Demo Residence" }}
        device={null}
        appliances={[]}
        commands={[]}
        setupError="Supabase environment variables are not configured."
      />
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const bootstrap = await supabase.rpc("ensure_home_bootstrap");
  const setupError = bootstrap.error?.message ?? null;

  const { data: home } = await supabase
    .from("homes")
    .select("id,name")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<HomeRecord>();

  const { data: device } = home
    ? await supabase
        .from("devices")
        .select("id,home_id,public_device_id,name,status,last_seen_at,pairing_code,firmware_version")
        .eq("home_id", home.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle<DeviceRecord>()
    : { data: null };

  const { data: appliances } = device
    ? await supabase
        .from("appliances")
        .select("id,device_id,name,room,kind,state,is_online,sort_order")
        .eq("device_id", device.id)
        .order("sort_order", { ascending: true })
        .returns<ApplianceRecord[]>()
    : { data: [] };

  const { data: commands } = device
    ? await supabase
        .from("appliance_commands")
        .select("id,device_id,appliance_id,action,status,error_message,created_at,completed_at")
        .eq("device_id", device.id)
        .order("created_at", { ascending: false })
        .limit(8)
        .returns<CommandRecord[]>()
    : { data: [] };

  return (
    <DeviceConsole
      userEmail={user.email ?? "HomeLynk user"}
      home={home ?? { id: "pending", name: "HomeLynk Home" }}
      device={device ?? null}
      appliances={appliances ?? []}
      commands={commands ?? []}
      setupError={setupError}
    />
  );
}
