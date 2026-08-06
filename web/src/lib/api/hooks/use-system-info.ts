"use client";
import { useQuery } from "@tanstack/react-query";
import { getSystemInfo } from "../operations";
import { queryKeys } from "../query-keys";
export function useSystemInfo() { return useQuery({ queryKey: queryKeys.systemInfo(), queryFn: ({ signal }) => getSystemInfo(signal), staleTime: 300_000, retry: 1 }); }
