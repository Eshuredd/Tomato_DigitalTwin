import { CropTwinApiClient } from "./client";
import { CropTwinEndpoints } from "./endpoints";
import { getPublicEnv } from "@/lib/config/env";

export function createBrowserEndpoints() {
  const { apiBaseUrl } = getPublicEnv();
  return new CropTwinEndpoints(new CropTwinApiClient({ baseUrl: apiBaseUrl }));
}
