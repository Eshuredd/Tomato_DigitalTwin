"use client";
import { useQuery } from "@tanstack/react-query";
import { getHealth } from "../operations";
import { queryKeys } from "../query-keys";
export function useHealth() { return useQuery({ queryKey: queryKeys.health(), queryFn: ({ signal }) => getHealth(signal), staleTime: 60_000, retry: 1 }); }
