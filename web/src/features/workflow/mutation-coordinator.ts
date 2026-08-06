"use client";

import { useCallback, useRef, useState } from "react";

export type AuthoritativeOperation = "water" | "twin" | "advancement";

export interface MutationToken {
  id: string;
  operation: AuthoritativeOperation;
  requestIdentity: string;
  controller: AbortController;
}

export interface MutationCoordinator {
  active?: MutationToken;
  acquire: (operation: AuthoritativeOperation, requestIdentity: string) => MutationToken | undefined;
  release: (token: MutationToken) => void;
  cancel: (token?: MutationToken) => void;
}

export function useMutationCoordinator(): MutationCoordinator {
  const owner = useRef<MutationToken | undefined>(undefined);
  const [active, setActive] = useState<MutationToken>();

  const acquire = useCallback((operation: AuthoritativeOperation, requestIdentity: string) => {
    if (owner.current) return undefined;
    const token = { id: crypto.randomUUID(), operation, requestIdentity, controller: new AbortController() } satisfies MutationToken;
    owner.current = token;
    setActive(token);
    return token;
  }, []);

  const release = useCallback((token: MutationToken) => {
    if (owner.current?.id !== token.id) return;
    owner.current = undefined;
    setActive(undefined);
  }, []);

  const cancel = useCallback((token?: MutationToken) => {
    const current = owner.current;
    if (!current || (token && token.id !== current.id)) return;
    current.controller.abort();
    owner.current = undefined;
    setActive(undefined);
  }, []);

  return { active, acquire, release, cancel };
}
