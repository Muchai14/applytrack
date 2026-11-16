import { createMockApi } from "./mock";
import { createHttpApi } from "./http";
export const isMock = import.meta.env.VITE_USE_MOCK_API === "true";
export const api = isMock
  ? createMockApi()
  : createHttpApi(import.meta.env.VITE_API_BASE_URL || "");
