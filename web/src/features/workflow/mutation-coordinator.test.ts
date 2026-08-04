import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useMutationCoordinator } from "./mutation-coordinator";

describe("authoritative mutation coordinator", () => {
  it("allows only one owner and aborts it explicitly", () => {
    const { result } = renderHook(() => useMutationCoordinator());
    let water!: NonNullable<ReturnType<typeof result.current.acquire>>;
    act(() => { water = result.current.acquire("water", "water-1")!; });
    expect(result.current.active?.id).toBe(water.id);
    expect(result.current.acquire("twin", "twin-1")).toBeUndefined();
    act(() => result.current.cancel(water));
    expect(water.controller.signal.aborted).toBe(true);
    expect(result.current.active).toBeUndefined();
  });

  it("does not let a stale finally release a newer owner", () => {
    const { result } = renderHook(() => useMutationCoordinator());
    let oldOwner!: NonNullable<ReturnType<typeof result.current.acquire>>;
    let newOwner!: NonNullable<ReturnType<typeof result.current.acquire>>;
    act(() => { oldOwner = result.current.acquire("water", "old")!; });
    act(() => result.current.cancel(oldOwner));
    act(() => { newOwner = result.current.acquire("twin", "new")!; });
    act(() => result.current.release(oldOwner));
    expect(result.current.active?.id).toBe(newOwner.id);
    expect(newOwner.controller.signal.aborted).toBe(false);
  });
});
